import { prisma } from '@/lib/prisma';

export const DAILY_FREE_REPORT_LIMIT = 3;
export const POINT_PACKAGE_POINTS = 30;
export const POINT_PACKAGE_AMOUNT_CENTS = 600;
export const BYOK_PACKAGE_AMOUNT_CENTS = 3000;

export type UsageSource = 'free_admin' | 'points' | 'byok';
export type PackageType = 'points_30' | 'byok_lifetime';

export interface UsagePlan {
  userId: string;
  mode: 'quick' | 'deep';
  costPoints: number;
  source: UsageSource;
  freeQuotaDate: string;
  freeQuotaUsedBefore: number;
  creditBalanceBefore: number;
}

export function isByokPlan(planType?: string | null) {
  return planType === 'byok';
}

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function getAnalysisPointCost(mode: string) {
  return mode === 'deep' ? 2 : 1;
}

export async function getOrCreateAppSetting() {
  return prisma.appSetting.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      adminModelName: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
      adminLlmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },
  });
}

export async function buildUsagePlan(userId: string, mode: 'quick' | 'deep'): Promise<UsagePlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      freeQuotaDate: true,
      freeQuotaUsed: true,
      creditBalance: true,
      planType: true,
    },
  });

  if (!user) {
    throw new Error('账号不存在，请重新登录。');
  }

  const freeQuotaDate = todayInShanghai();
  const freeQuotaUsedBefore = user.freeQuotaDate === freeQuotaDate ? user.freeQuotaUsed : 0;
  const costPoints = getAnalysisPointCost(mode);

  if (isByokPlan(user.planType)) {
    return {
      userId,
      mode,
      costPoints: 0,
      source: 'byok',
      freeQuotaDate,
      freeQuotaUsedBefore,
      creditBalanceBefore: user.creditBalance,
    };
  }

  if (freeQuotaUsedBefore < DAILY_FREE_REPORT_LIMIT) {
    return {
      userId,
      mode,
      costPoints,
      source: 'free_admin',
      freeQuotaDate,
      freeQuotaUsedBefore,
      creditBalanceBefore: user.creditBalance,
    };
  }

  if (user.creditBalance < costPoints) {
    throw new Error(`免费额度已用完，本次需要 ${costPoints} 点，当前剩余 ${user.creditBalance} 点。请先购买点数。`);
  }

  return {
    userId,
    mode,
    costPoints,
    source: 'points',
    freeQuotaDate,
    freeQuotaUsedBefore,
    creditBalanceBefore: user.creditBalance,
  };
}

export async function commitUsage(plan: UsagePlan, auditId: string) {
  if (plan.source === 'byok') {
    return;
  }

  if (plan.source === 'free_admin') {
    await prisma.user.update({
      where: { id: plan.userId },
      data: {
        freeQuotaDate: plan.freeQuotaDate,
        freeQuotaUsed: plan.freeQuotaUsedBefore + 1,
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: plan.userId },
      select: { creditBalance: true },
    });
    if (!user || user.creditBalance < plan.costPoints) {
      throw new Error('点数不足，无法完成扣减。');
    }

    const updated = await tx.user.update({
      where: { id: plan.userId },
      data: { creditBalance: { decrement: plan.costPoints } },
      select: { creditBalance: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId: plan.userId,
        delta: -plan.costPoints,
        balanceAfter: updated.creditBalance,
        type: 'consume',
        reason: plan.mode === 'deep' ? '深度审视消耗' : '快速审视消耗',
        auditId,
      },
    });
  });
}

export async function grantPoints(userId: string, points: number, reason: string, orderId?: string) {
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error('加点数量必须为正整数。');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: points } },
      select: { creditBalance: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId,
        delta: points,
        balanceAfter: updated.creditBalance,
        type: orderId ? 'purchase' : 'grant',
        reason,
        orderId,
      },
    });

    return updated.creditBalance;
  });
}

export async function activateByokPlan(userId: string, reason: string, orderId?: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { planType: 'byok' },
      select: { planType: true, creditBalance: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId,
        delta: 0,
        balanceAfter: updated.creditBalance,
        type: 'purchase',
        reason,
        orderId,
      },
    });

    return updated.planType;
  });
}

export function getPackageDefinition(packageType: string): {
  packageType: PackageType;
  packageName: string;
  amountCents: number;
  points: number;
} {
  if (packageType === 'byok_lifetime') {
    return {
      packageType: 'byok_lifetime',
      packageName: '30 元买断 · 自备 API',
      amountCents: BYOK_PACKAGE_AMOUNT_CENTS,
      points: 0,
    };
  }

  return {
    packageType: 'points_30',
    packageName: '30 点套餐',
    amountCents: POINT_PACKAGE_AMOUNT_CENTS,
    points: POINT_PACKAGE_POINTS,
  };
}
