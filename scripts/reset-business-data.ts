import { prisma } from '../lib/prisma';

const confirmation = process.env.CONFIRM_RESET_BUSINESS_DATA;
if (confirmation !== 'DELETE_NON_ADMIN_BUSINESS_DATA') {
  console.error('Refusing to reset data. Set CONFIRM_RESET_BUSINESS_DATA=DELETE_NON_ADMIN_BUSINESS_DATA to continue.');
  process.exit(1);
}


try {
  const admins = await prisma.user.findMany({ where: { role: 'super_admin' }, select: { id: true, email: true } });
  if (!admins.length) throw new Error('No super administrator exists. Refusing to delete data.');

  await prisma.$transaction(async (tx) => {
    // Clear business records first. AppSetting and administrator UserSettings are not touched.
    await tx.discussionReport.deleteMany();
    await tx.reportDiscussionMessage.deleteMany();
    await tx.exportArtifact.deleteMany();
    await tx.emailDelivery.deleteMany();
    await tx.auditJob.deleteMany();
    await tx.audit.deleteMany();
    await tx.rssItem.deleteMany();
    await tx.rssFeed.deleteMany();
    await tx.purchaseOrder.deleteMany();
    await tx.pointTransaction.deleteMany();
    await tx.rateLimitEvent.deleteMany();
    await tx.verificationCode.deleteMany();
    await tx.extensionLinkCode.deleteMany();
    await tx.extensionSession.deleteMany();

    // Preserve super administrator credentials and API settings, but reset their
    // business state so package and credit lifecycle tests start from a known base.
    await tx.user.updateMany({
      where: { role: 'super_admin' },
      data: {
        planType: 'free', creditBalance: 0, creditBalanceCents: 0, creditBalanceAmount: 0,
        signupBonusGrantedAt: null, proAccessActivatedAt: null, proAccessExpiresAt: null,
        pendingProAccessDays: 0, pendingProAccessExpiresAt: null, freeQuotaDate: null, freeQuotaUsed: 0,
      },
    });
    await tx.user.deleteMany({ where: { role: { not: 'super_admin' } } });
  });

  console.log(`Business data cleared. Preserved ${admins.length} super administrator account(s) and AppSetting.`);
} finally {
  await prisma.$disconnect();
}
