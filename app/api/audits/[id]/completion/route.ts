import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { formatCredits } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { beginServiceOperation, completeServiceOperation, failServiceOperation } from '@/lib/service-operation';
import { buildAiCompletionPrompt, validateCompletionMarkdown } from '@/lib/ai-completion-core.mjs';
import { getAnalysisTimeoutMs } from '@/lib/reasoning-depth-core.mjs';
import { reserveCompletionAttempt } from '@/lib/rate-limit';
import { resolveOperationModel } from '@/lib/operation-model';
import { invokeModel } from '@/lib/model-runtime';
import { recordModelUsage } from '@/lib/model-usage';

export const maxDuration = 300;

async function getAuthorizedAudit(request: Request, id: string) {
  const user = await getCurrentUser(request);
  if (!user) return { error: '请登录后使用 AI 补全。', status: 401 as const };

  const audit = await prisma.audit.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      source: true,
      originalContent: true,
      auditResultJson: true,
      reportLanguage: true,
      completionMarkdown: true,
      completionGeneratedAt: true,
    },
  });
  if (!audit) return { error: '审视记录不存在。', status: 404 as const };

  const isSuperAdmin = await getSuperAdminStatus(user.id);
  if (audit.userId !== user.id && !isSuperAdmin) {
    return { error: '你没有权限补全这条新闻。', status: 403 as const };
  }
  return { user, audit };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureRuntimeSchema();
  const { id } = await params;
  const result = await getAuthorizedAudit(request, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    markdown: result.audit.completionMarkdown || null,
    generatedAt: result.audit.completionGeneratedAt,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureRuntimeSchema();
    const { id } = await params;
    const result = await getAuthorizedAudit(request, id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId || '').trim();
    if (!requestId || requestId.length > 100) {
      return NextResponse.json({ error: '请求标识无效，请刷新页面后重试。' }, { status: 400 });
    }

    const { user, audit } = result;
    if (audit.originalContent.trim().length < 50) {
      return NextResponse.json({ error: '未保存足够的新闻原文，无法进行 AI 补全。' }, { status: 400 });
    }

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { planType: true, isBanned: true, proAccessExpiresAt: true },
    });
    if (!account || account.isBanned) {
      return NextResponse.json({ error: '账号已被管理员暂停使用，无法使用 AI 补全。' }, { status: 403 });
    }

    try {
      await reserveCompletionAttempt(user.id);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'AI 补全操作过于频繁，请稍后再试。' }, { status: 429 });
    }

    let operationModel;
    try {
      operationModel = await resolveOperationModel({
        userId: user.id,
        operation: 'completion',
      });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '所选模型暂时不可用，本次未扣除点数。' }, { status: 400 });
    }
    const idempotencyKey = `completion:${audit.id}:${requestId}`;
    let serviceOperation;
    try {
      const claimed = await beginServiceOperation({
        userId: user.id,
        idempotencyKey,
        operation: 'completion',
        reservedCredits: operationModel.costCents,
        transactionType: 'AI_COMPLETION',
        description: `使用${operationModel.snapshot?.displayName || operationModel.modelId}完成 AI 补全，消耗 ${formatCredits(operationModel.costCents)} 点`,
        auditId: audit.id,
        modelSnapshot: operationModel.snapshot ? {
          configId: operationModel.snapshot.configId,
          displayName: operationModel.snapshot.displayName,
          modelName: operationModel.snapshot.modelId,
          multiplierBps: operationModel.snapshot.multiplierBps,
          configVersion: operationModel.snapshot.configVersion,
        } : undefined,
      });
      serviceOperation = claimed.operation;
      if (claimed.state === 'completed') {
        const stored = JSON.parse(claimed.operation.resultJson || '{}');
        return NextResponse.json({
          markdown: stored.markdown || null,
          generatedAt: stored.generatedAt || null,
          usage: stored.usage || {
            source: operationModel.source,
            cost: formatCredits(operationModel.costCents),
            model: operationModel.snapshot?.displayName || operationModel.modelId,
          },
        });
      }
      if (claimed.state === 'running') {
        return NextResponse.json({ status: 'processing', message: 'AI 补全正在生成中，请稍后刷新查看。' }, { status: 202 });
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '当前点数不足。' }, { status: 402 });
    }

    let report: unknown = {};
    try {
      report = JSON.parse(audit.auditResultJson);
    } catch {
      return NextResponse.json({ error: '审视报告数据异常，无法进行 AI 补全。' }, { status: 500 });
    }

    const prompt = buildAiCompletionPrompt({
      title: audit.title,
      source: audit.source,
      originalContent: audit.originalContent,
      report,
      reportLanguage: audit.reportLanguage,
    });
    const startedAt = Date.now();
    const response = await invokeModel({
      provider: operationModel.provider,
      baseUrl: operationModel.baseUrl,
      apiKey: operationModel.apiKey,
      modelId: operationModel.modelId,
      reasoningDepth: operationModel.reasoningDepth,
      system: prompt.system,
      userPrompt: prompt.user,
      timeoutMs: Math.min(getAnalysisTimeoutMs(process.env.GUANYU_LLM_TIMEOUT_MS), 220_000),
      maxTokens: 12_000,
      jsonMode: false,
      nativeSearch: false,
      allowPrivateAddress: operationModel.allowPrivateAddress,
    });
    if (!response.ok) {
      await recordModelUsage({ userId: user.id, auditId: audit.id, operation: 'completion', status: 'failed', source: operationModel.source, snapshot: operationModel.snapshot, usage: response.usage, durationMs: Date.now() - startedAt, errorCode: response.errorCode }).catch(() => {});
      await failServiceOperation(serviceOperation.id, response.errorCode || 'model_upstream_failure').catch(() => {});
      const retryHint = operationModel.source === 'custom'
        ? '自定义 API 调用失败，本次未扣除点数。你可以检查配置后重试，或切换到平台模型并确认点数后重新运行。'
        : '所选平台模型调用失败，本次未扣除点数。请稍后重试或重新选择其他模型。';
      return NextResponse.json({ error: retryHint }, { status: 502 });
    }
    const markdown = response.message.trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '');
    if (!validateCompletionMarkdown(markdown)) {
      await recordModelUsage({ userId: user.id, auditId: audit.id, operation: 'completion', status: 'failed', source: operationModel.source, snapshot: operationModel.snapshot, usage: response.usage, durationMs: Date.now() - startedAt, errorCode: 'invalid_output' }).catch(() => {});
      await failServiceOperation(serviceOperation.id, 'invalid_output').catch(() => {});
      return NextResponse.json({ error: 'AI 补全返回格式不完整，请重新生成。' }, { status: 502 });
    }

    const generatedAt = new Date();
    const usagePayload = {
      source: operationModel.source,
      cost: formatCredits(operationModel.costCents),
      model: operationModel.snapshot?.displayName || operationModel.modelId,
    };
    try {
      await completeServiceOperation(serviceOperation.id, {
        resultId: audit.id,
        resultJson: JSON.stringify({ markdown, generatedAt, usage: usagePayload }),
      }, (tx) => tx.audit.update({
      where: { id: audit.id },
      data: { completionMarkdown: markdown, completionGeneratedAt: generatedAt },
      select: { completionMarkdown: true, completionGeneratedAt: true },
      }));
    } catch {
      await failServiceOperation(serviceOperation.id, 'persist_result_failed').catch(() => {});
      return NextResponse.json({ error: 'AI 补全结果保存失败，本次点数已释放，请重试。' }, { status: 500 });
    }
    await recordModelUsage({ userId: user.id, auditId: audit.id, operation: 'completion', status: 'success', source: operationModel.source, snapshot: operationModel.snapshot, creditCostCents: operationModel.costCents, usage: response.usage, durationMs: Date.now() - startedAt }).catch(() => {});
    return NextResponse.json({
      markdown,
      generatedAt,
      usage: usagePayload,
    });
  } catch (error) {
    console.error('AI completion failed:', error);
    return NextResponse.json({ error: 'AI 补全暂时无法完成，请稍后重试。' }, { status: 500 });
  }
}
