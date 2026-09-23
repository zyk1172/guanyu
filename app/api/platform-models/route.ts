import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasActivePro } from '@/lib/billing';
import { effectivePlatformModelId, normalizeModelOperation } from '@/lib/platform-model-core.mjs';
import { listPublicPlatformModels } from '@/lib/platform-models';

function localeFromRequest(request: Request) {
  const url = new URL(request.url);
  const requested = String(url.searchParams.get('locale') || '').trim();
  if (requested) return requested;
  const cookie = String(request.headers.get('cookie') || '').match(/(?:^|;\s*)guanyu-ui-language=([^;]+)/)?.[1];
  if (cookie) return decodeURIComponent(cookie);
  return String(request.headers.get('accept-language') || 'zh-CN').split(',')[0].trim() || 'zh-CN';
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const operation = normalizeModelOperation(new URL(request.url).searchParams.get('operation'));
    const settings = user
      ? await prisma.userSettings.findUnique({
          where: { userId: user.id },
          select: { modelSource: true, defaultPlatformModelConfigId: true, llmApiKeyEncrypted: true },
        })
      : null;
    const account = user
      ? await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, planType: true, proAccessExpiresAt: true },
        })
      : null;
    const customAvailable = Boolean(
      settings?.llmApiKeyEncrypted
      && (account?.role === 'super_admin' || hasActivePro(account || {})),
    );
    const models = await listPublicPlatformModels({
      operation,
      locale: localeFromRequest(request),
      userDefaultId: settings?.defaultPlatformModelConfigId,
    });
    const defaultPlatformModelConfigId = effectivePlatformModelId(
      models,
      settings?.defaultPlatformModelConfigId,
    ) || null;
    return NextResponse.json({
      models,
      operation,
      modelSource: settings?.modelSource === 'custom' && customAvailable ? 'custom' : 'platform',
      customAvailable,
      defaultPlatformModelConfigId,
    });
  } catch (error) {
    console.error('List platform models failed:', error);
    return NextResponse.json({ error: '平台模型列表暂时不可用，请稍后重试。' }, { status: 503 });
  }
}
