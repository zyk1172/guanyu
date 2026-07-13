import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  DAILY_FREE_REPORT_LIMIT,
  getPackageDefinition,
  getOrCreateAppSetting,
} from '@/lib/billing';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { formatPaymentAmount } from '@/lib/payment-core.mjs';
import { prisma } from '@/lib/prisma';

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: Request) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后查看额度。' }, { status: 401 });
  }

  const [account, appSetting, orders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        creditBalance: true,
        creditBalanceCents: true,
        freeQuotaDate: true,
        freeQuotaUsed: true,
        planType: true,
      },
    }),
    getOrCreateAppSetting(),
    prisma.purchaseOrder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  if (!account) {
    return NextResponse.json({ error: '账号不存在，请重新登录。' }, { status: 401 });
  }

  const today = todayInShanghai();
  const used = account.freeQuotaDate === today ? account.freeQuotaUsed : 0;
  const alipayPackage = getPackageDefinition('points_30', 'alipay_qr');
  const alipayByokPackage = getPackageDefinition('byok_lifetime', 'alipay_qr');
  const paypalPackage = getPackageDefinition('points_30', 'paypal_qr');
  const paypalByokPackage = getPackageDefinition('byok_lifetime', 'paypal_qr');
  return NextResponse.json({
    creditBalance: Number((((account.creditBalanceCents && account.creditBalanceCents > 0 ? account.creditBalanceCents : account.creditBalance * 100) / 100)).toFixed(1)),
    planType: account.planType,
    canUseOwnApi: account.planType === 'byok',
    freeQuotaLimit: DAILY_FREE_REPORT_LIMIT,
    freeQuotaUsed: used,
    freeQuotaRemaining: Math.max(DAILY_FREE_REPORT_LIMIT - used, 0),
    package: { ...alipayPackage, label: '6 元 / 30 点', displayAmount: formatPaymentAmount(alipayPackage.amountCents, alipayPackage.currency) },
    byokPackage: { ...alipayByokPackage, label: '30 元高级功能解锁', displayAmount: formatPaymentAmount(alipayByokPackage.amountCents, alipayByokPackage.currency) },
    paypalPackage: { ...paypalPackage, label: '$1 / 20 点', displayAmount: formatPaymentAmount(paypalPackage.amountCents, paypalPackage.currency) },
    paypalByokPackage: { ...paypalByokPackage, label: '$5 高级功能解锁', displayAmount: formatPaymentAmount(paypalByokPackage.amountCents, paypalByokPackage.currency) },
    alipayQrImageUrl: appSetting.alipayQrImageUrl,
    alipayPointsQrImageUrl: appSetting.alipayPointsQrImageUrl || appSetting.alipayQrImageUrl,
    alipayByokQrImageUrl: appSetting.alipayByokQrImageUrl || appSetting.alipayQrImageUrl,
    paypalQrImageUrl: appSetting.paypalQrImageUrl || '/paypal-qr.jpg',
    alipayQrNote: appSetting.alipayQrNote,
    recentOrders: orders,
  });
}
