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
    savedArticles,
    serviceOperations,
    modelUsageEvents,
    auditJobs,
    discussionReports,
    extensionLinkCodes,
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
    prisma.savedArticle.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.serviceOperation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.modelUsageEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.auditJob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.discussionReport.findMany({ where: { reporterUserId: userId }, orderBy: { createdAt: 'desc' } }),
    prisma.extensionLinkCode.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
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
    extensionSessions: extensionSessions.map((session) => ({
      id: session.id,
      name: session.name,
      browser: session.browser,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      createdAt: session.createdAt,
    })),
    savedArticles,
    serviceOperations: serviceOperations.map((operation) => ({
      id: operation.id,
      operation: operation.operation,
      status: operation.status,
      currentAttempt: operation.currentAttempt,
      reservedCredits: operation.reservedCredits,
      resultHash: operation.resultHash,
      errorCode: operation.errorCode,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    })),
    modelUsageEvents,
    auditJobs: auditJobs.map((job) => ({
      id: job.id,
      status: job.status,
      auditId: job.auditId,
      error: job.error,
      attemptCount: job.attemptCount,
      creditCostCents: job.creditCostCents,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    })),
    discussionReports,
    extensionLinkCodes: extensionLinkCodes.map((code) => ({
      id: code.id,
      usedAt: code.usedAt,
      expiresAt: code.expiresAt,
      createdAt: code.createdAt,
    })),
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
    await tx.verificationCode.deleteMany({
      where: { email: String(email || '').trim().toLowerCase() },
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
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      nextAttemptAt: null,
      workerId: null,
    },
  });
  const maxAttempts = Math.max(1, Number(process.env.PLATFORM_ANALYSIS_MAX_RETRIES || 1) + 1);
  const expiredLeaseJobs = await prisma.auditJob.findMany({
    where: { status: 'running', leaseExpiresAt: { lte: now } },
    select: { id: true, attemptCount: true },
  });
  let recoveredExpiredLeases = 0;
  for (const job of expiredLeaseJobs) {
    const terminal = job.attemptCount >= maxAttempts;
    const updated = await prisma.auditJob.updateMany({
      where: { id: job.id, status: 'running', leaseExpiresAt: { lte: now } },
      data: terminal
        ? {
            status: 'failed',
            error: '审视任务执行超时，重试次数已用完。',
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
            nextAttemptAt: null,
            workerId: null,
            inputRetentionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          }
        : {
            status: 'pending',
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
            workerId: null,
            nextAttemptAt: now,
          },
    });
    recoveredExpiredLeases += updated.count;
  }
  return { failed, staleRunning, recoveredExpiredLeases };
}

export async function runPrivacyCleanup() {
  const retentionDays = Number(process.env.EMAIL_DELIVERY_RETENTION_DAYS || 90);
  const emails = await anonymizeExpiredEmailDeliveries(retentionDays);
  const jobs = await cleanupExpiredAuditJobInputs();
  const now = new Date();
  const verificationCodes = await prisma.verificationCode.deleteMany({
    where: {
      OR: [
        { consumedAt: { not: null } },
        { expiresAt: { lt: now } },
        { createdAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  const extensionLinkCodes = await prisma.extensionLinkCode.deleteMany({
    where: {
      OR: [
        { usedAt: { not: null } },
        { expiresAt: { lt: now } },
      ],
    },
  });
  const serviceOperations = await prisma.serviceOperation.updateMany({
    where: {
      status: 'COMPLETED',
      createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      resultJson: { not: null },
    },
    data: { resultJson: null },
  });
  return { emails, jobs, verificationCodes, extensionLinkCodes, serviceOperations };
}
