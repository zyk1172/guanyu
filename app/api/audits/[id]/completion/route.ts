import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { getOrCreateAppSetting } from '@/lib/billing';
import { chooseModelConfig } from '@/lib/model-config';
import { prisma } from '@/lib/prisma';
import { buildAiCompletionPrompt, validateCompletionMarkdown } from '@/lib/ai-completion-core.mjs';
import { getAnalysisTimeoutMs } from '@/lib/reasoning-depth-core.mjs';
import { safeOutboundRequest } from '@/lib/safe-outbound';
import { reserveCompletionAttempt } from '@/lib/rate-limit';

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

    const { user, audit } = result;
    if (audit.originalContent.trim().length < 50) {
      return NextResponse.json({ error: '未保存足够的新闻原文，无法进行 AI 补全。' }, { status: 400 });
    }

    const [account, userSettings, appSetting] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { planType: true, isBanned: true } }),
      prisma.userSettings.findUnique({ where: { userId: user.id } }),
      getOrCreateAppSetting(),
    ]);
    if (!account || account.isBanned) {
      return NextResponse.json({ error: '账号已被管理员暂停使用，无法使用 AI 补全。' }, { status: 403 });
    }

    try {
      await reserveCompletionAttempt(user.id);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'AI 补全操作过于频繁，请稍后再试。' }, { status: 429 });
    }

    const modelConfig = chooseModelConfig({
      usageSource: account.planType === 'byok' ? 'byok' : 'free_admin',
      userSettings,
      appSetting,
    });
    if (!modelConfig.apiKey || !modelConfig.modelName || !modelConfig.baseURL) {
      return NextResponse.json({ error: '当前账号可用的大模型配置不完整，暂时无法进行 AI 补全。' }, { status: 500 });
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
    const response = await safeOutboundRequest(`${modelConfig.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.modelName,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.15,
        max_tokens: 12_000,
      }),
      timeoutMs: Math.min(getAnalysisTimeoutMs(process.env.GUANYU_LLM_TIMEOUT_MS), 220_000),
      maxBytes: 8 * 1024 * 1024,
      requireHttps: process.env.NODE_ENV === 'production',
    });
    const payload = JSON.parse(response.body.toString('utf8') || '{}');
    if (response.status < 200 || response.status >= 300) {
      return NextResponse.json({ error: 'AI 补全调用失败，请检查模型配置后重试。' }, { status: 502 });
    }
    const markdown = String(payload?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '');
    if (!validateCompletionMarkdown(markdown)) {
      return NextResponse.json({ error: 'AI 补全返回格式不完整，请重新生成。' }, { status: 502 });
    }

    const updated = await prisma.audit.update({
      where: { id: audit.id },
      data: { completionMarkdown: markdown, completionGeneratedAt: new Date() },
      select: { completionMarkdown: true, completionGeneratedAt: true },
    });
    return NextResponse.json({ markdown: updated.completionMarkdown, generatedAt: updated.completionGeneratedAt });
  } catch (error) {
    console.error('AI completion failed:', error);
    return NextResponse.json({ error: 'AI 补全暂时无法完成，请稍后重试。' }, { status: 500 });
  }
}
