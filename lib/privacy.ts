import { prisma } from '@/lib/prisma';
import { hashForStorage } from '@/lib/rate-limit';

export async function exportUserData(userId: string) {
  const [
    user,
    settings,
    audits,
    purchaseOrders,
    pointTransactions,
    discussionMessages,
    emailDeliveries,
    exportArtifacts,
    rssFeeds,
    extensionSessions,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.audit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.purchaseOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.pointTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.reportDiscussionMessage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.emailDelivery.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.exportArtifact.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.rssFeed.findMany({ where: { ownerUserId: userId }, orderBy: { createdAt: 'desc' } }),
    prisma.extensionSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  ]);

  if (!user) throw new Error('账号不存在。');

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isBanned: user.isBanned,
      planType: user.planType,
      creditBalanceAmount: String(user.creditBalanceAmount),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    settings: settings ? {
      defaultReasoningDepth: settings.defaultReasoningDepth,
      defaultReportLanguage: settings.defaultReportLanguage,
      defaultAnalysisMode: settings.defaultAnalysisMode,
      defaultIsPublic: settings.defaultIsPublic,
      defaultEnableCharts: settings.defaultEnableCharts,
      modelSource: settings.modelSource,
      defaultPlatformModelConfigId: settings.defaultPlatformModelConfigId,
      hasLlmApiKey: Boolean(settings.llmApiKeyEncrypted),
      hasTavilyApiKey: Boolean(settings.tavilyApiKeyEncrypted),
      hasSerperApiKey: Boolean(settings.serperApiKeyEncrypted),
      rssFeedUrlsJson: settings.rssFeedUrlsJson,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    } : null,
    audits,
    purchaseOrders,
    pointTransactions,
    discussionMessages,
    emailDeliveries,
    exportArtifacts,
    rssFeeds,
    extensionSessions,
  };
}

export async function deleteUserAccount(userId: string, email: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    await tx.extensionSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.emailDelivery.updateMany({
      where: { userId },
      data: {
        recipient: '[deleted]',
        subject: '[deleted]',
        error: null,
        metadataJson: '{}',
      },
    });
    await tx.accountDeletionLog.create({
      data: {
        userIdHash: hashForStorage(userId),
        emailHash: hashForStorage(String(email || '').trim().toLowerCase()),
      },
    });
    await tx.user.delete({ where: { id: userId } });
  });
}

export async function anonymizeExpiredEmailDeliveries(retentionDays = 90) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return prisma.emailDelivery.updateMany({
    where: { createdAt: { lt: cutoff } },
    data: {
      recipient: '[deleted]',
      subject: '[deleted]',
      error: null,
      metadataJson: '{}',
    },
  });
}

export async function cleanupExpiredAuditJobInputs() {
  const now = new Date();
  const failed = await prisma.auditJob.updateMany({
    where: {
      status: 'failed',
      inputRetentionExpiresAt: { lt: now },
    },
    data: {
      inputJson: '{}',
      error: '原始输入已按保留期清理。',
    },
  });
  const staleRunning = await prisma.auditJob.updateMany({
    where: {
      status: { in: ['pending', 'running'] },
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    data: {
      status: 'failed',
      inputJson: '{}',
      error: '任务超时，原始输入已按保留期清理。',
    },
  });
  return { failed, staleRunning };
}

export async function runPrivacyCleanup() {
  const emails = await anonymizeExpiredEmailDeliveries();
  const jobs = await cleanupExpiredAuditJobInputs();
  return { emails, jobs };
}
