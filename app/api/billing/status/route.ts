import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  BYOK_PACKAGE_AMOUNT_CENTS,
  DAILY_FREE_REPORT_LIMIT,
  POINT_PACKAGE_AMOUNT_CENTS,
  POINT_PACKAGE_POINTS,
  getOrCreateAppSetting,
} from '@/lib/billing';
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
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '请登录后查看额度。' }, { status: 401 });
  }

  const [account, appSetting, orders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        creditBalance: true,
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
  return NextResponse.json({
    creditBalance: account.creditBalance,
    planType: account.planType,
    canUseOwnApi: account.planType === 'byok',
    freeQuotaLimit: DAILY_FREE_REPORT_LIMIT,
    freeQuotaUsed: used,
    freeQuotaRemaining: Math.max(DAILY_FREE_REPORT_LIMIT - used, 0),
    package: {
      amountCents: POINT_PACKAGE_AMOUNT_CENTS,
      points: POINT_PACKAGE_POINTS,
      label: '6 元 / 30 点',
    },
    byokPackage: {
      amountCents: BYOK_PACKAGE_AMOUNT_CENTS,
      points: 0,
      label: '30 元买断 · 自备 API',
    },
    alipayQrImageUrl: appSetting.alipayQrImageUrl,
    alipayQrNote: appSetting.alipayQrNote,
    recentOrders: orders,
  });
}
