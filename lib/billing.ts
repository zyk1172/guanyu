import { prisma } from '@/lib/prisma';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { getPaymentPackageDefinition } from '@/lib/payment-package-core.mjs';

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
  rateLimitEventId?: string;
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
  return 3;
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

type AppSettingRecord = Awaited<ReturnType<typeof upsertAppSetting>>;

function upsertAppSetting() {
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

export async function getOrCreateAppSetting() {
  const cached = await cacheGet<AppSettingRecord>(CACHE_KEYS.appSetting);
  if (cached) return cached;

  await ensureRuntimeSchema();
  const setting = await upsertAppSetting();
  await cacheSet(CACHE_KEYS.appSetting, setting, CACHE_TTL.appSetting);
  return setting;
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
      isBanned: true,
    },
  });

  if (!user) {
    throw new Error('账号不存在，请重新登录。');
  }
  if (user.isBanned) {
    throw new Error('账号已被管理员暂停使用，无法生成报告。');
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
        reason: '观隅分析消耗 3 点',
        auditId,
      },
    });
  });
}

export async function reserveAnalysisUsage(userId: string, mode: 'quick' | 'deep'): Promise<UsagePlan> {
  await ensureRuntimeSchema();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-analysis:${userId}`}));`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, freeQuotaDate: true, freeQuotaUsed: true, creditBalance: true, creditBalanceCents: true, planType: true, isBanned: true },
    });
    if (!user) throw new Error('账号不存在，请重新登录。');
    if (user.isBanned) throw new Error('账号已被管理员暂停使用，无法生成报告。');

    const windowStart = new Date(Date.now() - 5 * 60 * 1000);
    const recentCount = await tx.rateLimitEvent.count({ where: { userId, action: 'analyze', createdAt: { gte: windowStart } } });
    if (recentCount >= 3) throw new Error('操作过于频繁，请 5 分钟后再生成新的审视报告。');
    const rateEvent = await tx.rateLimitEvent.create({ data: { userId, action: 'analyze' } });

    const freeQuotaDate = todayInShanghai();
    const freeQuotaUsedBefore = user.freeQuotaDate === freeQuotaDate ? user.freeQuotaUsed : 0;
    const costPoints = getAnalysisPointCost(mode);
    const costCents = pointsToCents(costPoints);
    const creditBalanceCentsBefore = effectiveCreditCents(user);
    const plan: UsagePlan = {
      userId, mode, costPoints, costCents, freeQuotaDate, freeQuotaUsedBefore,
      creditBalanceBefore: user.creditBalance, creditBalanceCentsBefore, rateLimitEventId: rateEvent.id,
      source: isByokPlan(user.planType) ? 'byok' : freeQuotaUsedBefore < DAILY_FREE_REPORT_LIMIT ? 'free_admin' : 'points',
    };

    if (plan.source === 'free_admin') {
      await tx.user.update({ where: { id: userId }, data: { freeQuotaDate, freeQuotaUsed: freeQuotaUsedBefore + 1 } });
    } else if (plan.source === 'points') {
      if (creditBalanceCentsBefore < costCents) throw new Error(`免费额度已用完，本次需要 ${costPoints} 点，当前剩余 ${centsToDisplayPoints(creditBalanceCentsBefore)} 点。请先购买点数。`);
      const nextCents = creditBalanceCentsBefore - costCents;
      const updated = await tx.user.update({ where: { id: userId }, data: { creditBalance: Math.floor(nextCents / 100), creditBalanceCents: nextCents }, select: { creditBalance: true, creditBalanceCents: true } });
      await tx.pointTransaction.create({ data: { userId, delta: -costPoints, balanceAfter: updated.creditBalance, deltaCents: -costCents, balanceAfterCents: updated.creditBalanceCents, type: 'consume', reason: '观隅分析预扣 3 点' } });
    }
    return plan;
  });
}

export async function refundAnalysisUsage(plan: UsagePlan) {
  if (!plan.rateLimitEventId) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-analysis:${plan.userId}`}));`;
    await tx.rateLimitEvent.deleteMany({ where: { id: plan.rateLimitEventId, userId: plan.userId } });
    if (plan.source === 'free_admin') {
      const current = await tx.user.findUnique({ where: { id: plan.userId }, select: { freeQuotaDate: true, freeQuotaUsed: true } });
      if (current?.freeQuotaDate === plan.freeQuotaDate && current.freeQuotaUsed > 0) {
        await tx.user.update({ where: { id: plan.userId }, data: { freeQuotaUsed: { decrement: 1 } } });
      }
    }
    if (plan.source === 'points') {
      const current = await tx.user.findUnique({ where: { id: plan.userId }, select: { creditBalance: true, creditBalanceCents: true } });
      if (!current) return;
      const nextCents = effectiveCreditCents(current) + plan.costCents;
      const updated = await tx.user.update({ where: { id: plan.userId }, data: { creditBalance: Math.floor(nextCents / 100), creditBalanceCents: nextCents }, select: { creditBalance: true, creditBalanceCents: true } });
      await tx.pointTransaction.create({ data: { userId: plan.userId, delta: plan.costPoints, balanceAfter: updated.creditBalance, deltaCents: plan.costCents, balanceAfterCents: updated.creditBalanceCents, type: 'refund', reason: '分析失败，已退还 3 点' } });
    }
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
  const costCents = 100;

  await ensureRuntimeSchema();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-question:${userId}`}));`;
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
      throw new Error(`追问需要 1 点，当前剩余 ${centsToDisplayPoints(currentCents)} 点。请先购买点数。`);
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
        reason: '报告追问消耗 1 点',
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

export function getPackageDefinition(packageType: string, paymentMethod = 'alipay_qr'): {
  packageType: PackageType;
  packageName: string;
  amountCents: number;
  currency: 'CNY' | 'USD';
  points: number;
} {
  return getPaymentPackageDefinition(packageType, paymentMethod) as {
    packageType: PackageType;
    packageName: string;
    amountCents: number;
    currency: 'CNY' | 'USD';
    points: number;
  };
}
