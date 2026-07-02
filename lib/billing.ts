import { prisma } from '@/lib/prisma';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';

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
  costCents: number;
  source: UsageSource;
  freeQuotaDate: string;
  freeQuotaUsedBefore: number;
  creditBalanceBefore: number;
  creditBalanceCentsBefore: number;
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

export function pointsToCents(points: number) {
  return Math.round(points * 100);
}

export function centsToDisplayPoints(cents: number) {
  return Number((cents / 100).toFixed(1));
}

export function effectiveCreditCents(user: { creditBalance: number; creditBalanceCents?: number | null }) {
  return user.creditBalanceCents && user.creditBalanceCents > 0
    ? user.creditBalanceCents
    : pointsToCents(user.creditBalance);
}

export async function getOrCreateAppSetting() {
  await ensureRuntimeSchema();
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
  await ensureRuntimeSchema();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      freeQuotaDate: true,
      freeQuotaUsed: true,
      creditBalance: true,
      creditBalanceCents: true,
      planType: true,
    },
  });

  if (!user) {
    throw new Error('账号不存在，请重新登录。');
  }

  const freeQuotaDate = todayInShanghai();
  const freeQuotaUsedBefore = user.freeQuotaDate === freeQuotaDate ? user.freeQuotaUsed : 0;
  const costPoints = getAnalysisPointCost(mode);
  const costCents = pointsToCents(costPoints);
  const creditBalanceCentsBefore = effectiveCreditCents(user);

  if (isByokPlan(user.planType)) {
    return {
      userId,
      mode,
      costPoints: 0,
      costCents: 0,
      source: 'byok',
      freeQuotaDate,
      freeQuotaUsedBefore,
      creditBalanceBefore: user.creditBalance,
      creditBalanceCentsBefore,
    };
  }

  if (freeQuotaUsedBefore < DAILY_FREE_REPORT_LIMIT) {
    return {
      userId,
      mode,
      costPoints,
      costCents,
      source: 'free_admin',
      freeQuotaDate,
      freeQuotaUsedBefore,
      creditBalanceBefore: user.creditBalance,
      creditBalanceCentsBefore,
    };
  }

  if (creditBalanceCentsBefore < costCents) {
    throw new Error(`免费额度已用完，本次需要 ${costPoints} 点，当前剩余 ${centsToDisplayPoints(creditBalanceCentsBefore)} 点。请先购买点数。`);
  }

  return {
    userId,
    mode,
    costPoints,
    costCents,
    source: 'points',
    freeQuotaDate,
    freeQuotaUsedBefore,
    creditBalanceBefore: user.creditBalance,
    creditBalanceCentsBefore,
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
      select: { creditBalance: true, creditBalanceCents: true },
    });
    const currentCents = user ? effectiveCreditCents(user) : 0;
    if (!user || currentCents < plan.costCents) {
      throw new Error('点数不足，无法完成扣减。');
    }

    const nextCents = currentCents - plan.costCents;
    const updated = await tx.user.update({
      where: { id: plan.userId },
      data: {
        creditBalance: Math.floor(nextCents / 100),
        creditBalanceCents: nextCents,
      },
      select: { creditBalance: true, creditBalanceCents: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId: plan.userId,
        delta: -plan.costPoints,
        balanceAfter: updated.creditBalance,
        deltaCents: -plan.costCents,
        balanceAfterCents: updated.creditBalanceCents,
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

  await ensureRuntimeSchema();
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true, creditBalanceCents: true },
    });
    if (!current) throw new Error('账号不存在。');
    const nextCents = effectiveCreditCents(current) + pointsToCents(points);
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        creditBalance: Math.floor(nextCents / 100),
        creditBalanceCents: nextCents,
      },
      select: { creditBalance: true, creditBalanceCents: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId,
        delta: points,
        balanceAfter: updated.creditBalance,
        deltaCents: pointsToCents(points),
        balanceAfterCents: updated.creditBalanceCents,
        type: orderId ? 'purchase' : 'grant',
        reason,
        orderId,
      },
    });

    return updated.creditBalance;
  });
}

export async function consumeQuestionPoint(userId: string, auditId?: string) {
  const costCents = 50;

  await ensureRuntimeSchema();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { planType: true, creditBalance: true, creditBalanceCents: true },
    });
    if (!user) throw new Error('账号不存在，请重新登录。');
    if (isByokPlan(user.planType)) {
      return { source: 'byok' as const, balance: centsToDisplayPoints(effectiveCreditCents(user)) };
    }

    const currentCents = effectiveCreditCents(user);
    if (currentCents < costCents) {
      throw new Error(`追问需要 0.5 点，当前剩余 ${centsToDisplayPoints(currentCents)} 点。请先购买点数。`);
    }

    const nextCents = currentCents - costCents;
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        creditBalance: Math.floor(nextCents / 100),
        creditBalanceCents: nextCents,
      },
      select: { creditBalance: true, creditBalanceCents: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId,
        delta: 0,
        balanceAfter: updated.creditBalance,
        deltaCents: -costCents,
        balanceAfterCents: updated.creditBalanceCents,
        type: 'consume',
        reason: '报告追问消耗 0.5 点',
        auditId,
      },
    });

    return { source: 'points' as const, balance: centsToDisplayPoints(updated.creditBalanceCents) };
  });
}

export async function activateByokPlan(userId: string, reason: string, orderId?: string) {
  await ensureRuntimeSchema();
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
