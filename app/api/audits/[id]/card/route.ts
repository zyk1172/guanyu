import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { getOrCreateAppSetting, getUsageSource } from '@/lib/billing';
import { chooseModelConfig } from '@/lib/model-config';
import { prisma } from '@/lib/prisma';
import { buildGuanyuCardFallback, buildGuanyuCardPrompt, parseGuanyuCardContent } from '@/lib/guanyu-card-core.mjs';
import { getAnalysisTimeoutMs } from '@/lib/reasoning-depth-core.mjs';
import { safeOutboundRequest } from '@/lib/safe-outbound';
import { reserveCompletionAttempt } from '@/lib/rate-limit';
import { sameOriginResponse } from '@/lib/request-security';

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = sameOriginResponse(request);
    if (originError) return originError;
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: '请登录后生成观隅卡。' }, { status: 401 });

    const { id } = await params;
    const audit = await prisma.audit.findUnique({
      where: { id },
      select: { id: true, userId: true, title: true, source: true, newsSummary: true, auditResultJson: true, reportLanguage: true },
    });
    if (!audit) return NextResponse.json({ error: '审视记录不存在。' }, { status: 404 });
    const isSuperAdmin = await getSuperAdminStatus(user.id);
    if (audit.userId !== user.id && !isSuperAdmin) {
      return NextResponse.json({ error: '你没有权限生成这条报告的观隅卡。' }, { status: 403 });
    }

    const [account, userSettings, appSetting] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { planType: true, isBanned: true } }),
      prisma.userSettings.findUnique({ where: { userId: user.id } }),
      getOrCreateAppSetting(),
    ]);
    if (!account || account.isBanned) return NextResponse.json({ error: '账号暂时无法生成观隅卡。' }, { status: 403 });

    let report: Record<string, unknown> = { newsSummary: audit.newsSummary };
    try {
      const parsedReport = JSON.parse(audit.auditResultJson);
      if (parsedReport && typeof parsedReport === 'object' && !Array.isArray(parsedReport)) report = parsedReport as Record<string, unknown>;
    } catch {
      // Older or damaged report JSON must not prevent the owner from sharing a card.
    }
    const fallbackCard = buildGuanyuCardFallback({ report, reportLanguage: audit.reportLanguage });

    try {
      await reserveCompletionAttempt(user.id);
    } catch {
      console.warn('Guanyu Card model attempt limited; using stored report fallback.', { auditId: audit.id, userId: user.id });
      return NextResponse.json({ card: fallbackCard, source: 'fallback' });
    }

    try {
      const usageSource = await getUsageSource(user.id);
      const modelConfig = chooseModelConfig({
        usageSource,
        userSettings,
        appSetting,
      });
      if (!modelConfig.apiKey || !modelConfig.modelName || !modelConfig.baseURL) {
        console.warn('Guanyu Card model configuration unavailable; using stored report fallback.', { auditId: audit.id, userId: user.id });
        return NextResponse.json({ card: fallbackCard, source: 'fallback' });
      }

      const prompt = buildGuanyuCardPrompt({
        title: audit.title,
        source: audit.source,
        report,
        reportLanguage: audit.reportLanguage,
      });
      const response = await safeOutboundRequest(`${modelConfig.baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelConfig.apiKey}` },
        body: JSON.stringify({
          model: modelConfig.modelName,
          messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
          temperature: 0.15,
          max_tokens: 700,
        }),
        timeoutMs: Math.min(getAnalysisTimeoutMs(process.env.GUANYU_LLM_TIMEOUT_MS), 90_000),
        maxBytes: 1024 * 1024,
        requireHttps: process.env.NODE_ENV === 'production',
      });
      if (response.status < 200 || response.status >= 300) {
        console.warn('Guanyu Card model request failed; using stored report fallback.', { auditId: audit.id, userId: user.id, status: response.status });
        return NextResponse.json({ card: fallbackCard, source: 'fallback' });
      }
      const payload = JSON.parse(response.body.toString('utf8') || '{}');
      const card = parseGuanyuCardContent(payload?.choices?.[0]?.message?.content, audit.reportLanguage);
      return NextResponse.json({ card, source: 'model' });
    } catch (error) {
      console.warn('Guanyu Card model path failed; using stored report fallback.', {
        auditId: audit.id,
        userId: user.id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return NextResponse.json({ card: fallbackCard, source: 'fallback' });
    }
  } catch (error) {
    console.error('Generate Guanyu Card failed:', error);
    return NextResponse.json({ error: '观隅卡暂时无法生成，请稍后再试。' }, { status: 500 });
  }
}
