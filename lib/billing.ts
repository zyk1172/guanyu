import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { getProduct, type PaymentMethod, type ProductId } from '@/lib/product-catalog';

// All arithmetic uses integer hundredths. The database stores the same value in
// DECIMAL(12,2); no JS floating-point amount is used for billing decisions.
export const SIGNUP_BONUS_CREDITS = Number(process.env.SIGNUP_BONUS_CREDITS || 15);
export const CREDIT_COSTS = { NEWS_ANALYSIS: 300, AI_COMPLETION: 200, AI_FOLLOWUP: 100, DISCUSSION: 50, WORD_EXPORT: 100, PDF_EXPORT: 100, MARKDOWN_EXPORT: 100 } as const;
export type UsageSource = 'platform' | 'custom';
export type PackageType = 'starter_credits' | 'pro_credits';
export interface UsagePlan { userId: string; mode: 'quick' | 'deep'; costPoints: number; costCents: number; source: UsageSource; creditBalanceBefore: number; creditBalanceCentsBefore: number; rateLimitEventId?: string; idempotencyKey?: string; }

export const pointsToCents = (points: number) => Math.round(points * 100);
export const centsToDisplayPoints = (cents: number) => Number((cents / 100).toFixed(2));
export const formatCredits = (cents: number) => Number.isInteger(cents / 100) ? String(cents / 100) : String(cents / 100).replace(/0+$/, '').replace(/\.$/, '');
export function effectiveCreditCents(user: { creditBalance: number; creditBalanceCents?: number | null; creditBalanceAmount?: Prisma.Decimal | number | null }) {
  const decimal = user.creditBalanceAmount;
  if (decimal !== null && decimal !== undefined && new Prisma.Decimal(decimal).gt(0)) return new Prisma.Decimal(decimal).mul(100).toDecimalPlaces(0).toNumber();
  return user.creditBalanceCents && user.creditBalanceCents > 0 ? user.creditBalanceCents : pointsToCents(user.creditBalance);
}
export function getAnalysisPointCost() { return 3; }
// Legacy permanent purchasers remain operational; new purchases only grant time-bound Pro.
export function isByokPlan(planType?: string | null) { return planType === 'byok'; }
export function hasActivePro(user: { planType?: string | null; proAccessExpiresAt?: Date | null }) { return isByokPlan(user.planType) || Boolean(user.proAccessExpiresAt && user.proAccessExpiresAt > new Date()); }

type AppSettingRecord = Awaited<ReturnType<typeof upsertAppSetting>>;
function upsertAppSetting() { return prisma.appSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global', adminModelName: process.env.PLATFORM_DEFAULT_MODEL_ID || process.env.OPENAI_MODEL_DEFAULT || 'deepseek-v4-pro', adminLlmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com' } }); }
export async function getOrCreateAppSetting() { const cached = await cacheGet<AppSettingRecord>(CACHE_KEYS.appSetting); if (cached) return cached; await ensureRuntimeSchema(); const setting = await upsertAppSetting(); await cacheSet(CACHE_KEYS.appSetting, setting, CACHE_TTL.appSetting); return setting; }

function decimal(cents: number) { return new Prisma.Decimal(cents).div(100); }
async function writeLedger(tx: Prisma.TransactionClient, data: { userId: string; cents: number; before: number; after: number; transactionType: string; description: string; idempotencyKey?: string; auditId?: string; orderId?: string; relatedTaskId?: string; relatedReportVersion?: number; relatedDiscussionMessageId?: string; }) {
  if (data.idempotencyKey) {
    const prior = await tx.pointTransaction.findFirst({ where: { userId: data.userId, idempotencyKey: data.idempotencyKey } });
    if (prior) return prior;
  }
  return tx.pointTransaction.create({ data: { userId: data.userId, delta: Math.trunc(data.cents / 100), balanceAfter: Math.floor(data.after / 100), deltaCents: data.cents, balanceAfterCents: data.after, amount: decimal(data.cents), balanceBefore: decimal(data.before), balanceAfterAmount: decimal(data.after), type: data.cents >= 0 ? 'grant' : 'consume', transactionType: data.transactionType, reason: data.description, auditId: data.auditId, orderId: data.orderId, relatedTaskId: data.relatedTaskId, relatedReportVersion: data.relatedReportVersion, relatedDiscussionMessageId: data.relatedDiscussionMessageId, idempotencyKey: data.idempotencyKey } });
}
async function changeBalance(tx: Prisma.TransactionClient, userId: string, cents: number, options: Omit<Parameters<typeof writeLedger>[1], 'userId' | 'cents' | 'before' | 'after'>) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-credit:${userId}`}));`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true } });
  if (!user) throw new Error('账号不存在。');
  const before = effectiveCreditCents(user); const after = before + cents;
  if (after < 0) throw new Error(`点数不足，当前剩余 ${formatCredits(before)} 点。`);
  if (options.idempotencyKey) {
    const prior = await tx.pointTransaction.findFirst({ where: { userId, idempotencyKey: options.idempotencyKey } });
    if (prior) return { before, after: effectiveCreditCents({ creditBalance: prior.balanceAfter, creditBalanceCents: prior.balanceAfterCents }), repeated: true, transaction: prior };
  }
  const updated = await tx.user.update({ where: { id: userId }, data: { creditBalance: Math.floor(after / 100), creditBalanceCents: after, creditBalanceAmount: decimal(after) }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true } });
  const transaction = await writeLedger(tx, { userId, cents, before, after, ...options });
  return { before, after: effectiveCreditCents(updated), repeated: false, transaction };
}

export async function grantSignupBonus(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { signupBonusGrantedAt: true } });
    if (!user || user.signupBonusGrantedAt) return false;
    await changeBalance(tx, userId, pointsToCents(SIGNUP_BONUS_CREDITS), { transactionType: 'SIGNUP_BONUS', description: '邮箱验证完成，新用户赠送点数', idempotencyKey: `signup-bonus:${userId}` });
    await tx.user.update({ where: { id: userId }, data: { signupBonusGrantedAt: new Date() } });
    return true;
  });
}

export async function activatePendingPro(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { planType: true, pendingProAccessDays: true, pendingProAccessExpiresAt: true, proAccessExpiresAt: true } });
    if (!user || isByokPlan(user.planType) || user.pendingProAccessDays <= 0) return user?.proAccessExpiresAt || null;
    if (!user.pendingProAccessExpiresAt || user.pendingProAccessExpiresAt <= new Date()) { await tx.user.update({ where: { id: userId }, data: { pendingProAccessDays: 0, pendingProAccessExpiresAt: null } }); return null; }
    const start = user.proAccessExpiresAt && user.proAccessExpiresAt > new Date() ? user.proAccessExpiresAt : new Date();
    const max = new Date(Date.now() + 90 * 86400000); const requested = new Date(start.getTime() + user.pendingProAccessDays * 86400000); const expires = requested > max ? max : requested;
    await tx.user.update({ where: { id: userId }, data: { proAccessActivatedAt: new Date(), proAccessExpiresAt: expires, pendingProAccessDays: 0, pendingProAccessExpiresAt: null } });
    return expires;
  });
}

export async function getUsageSource(userId: string, requested?: string) {
  const [user, settings] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { planType: true, proAccessExpiresAt: true } }), prisma.userSettings.findUnique({ where: { userId }, select: { modelSource: true } })]);
  const source = requested || settings?.modelSource || 'platform';
  if (source === 'custom') {
    if (hasActivePro(user || {})) return 'custom' as const;
    const activated = await activatePendingPro(userId);
    if (activated && activated > new Date()) return 'custom' as const;
  }
  return 'platform' as const;
}

export async function buildUsagePlan(userId: string, mode: 'quick' | 'deep' = 'deep', requestedSource?: string): Promise<UsagePlan> {
  await ensureRuntimeSchema(); const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true, isBanned: true } });
  if (!user) throw new Error('账号不存在，请重新登录。'); if (user.isBanned) throw new Error('账号已被管理员暂停使用，无法生成报告。');
  const source = await getUsageSource(userId, requestedSource); const before = effectiveCreditCents(user); const costCents = source === 'custom' ? 0 : CREDIT_COSTS.NEWS_ANALYSIS;
  if (before < costCents) throw new Error(`本次观隅分析需要 3 点，当前剩余 ${formatCredits(before)} 点。请先购买点数。`);
  return { userId, mode, costPoints: costCents / 100, costCents, source, creditBalanceBefore: Math.floor(before / 100), creditBalanceCentsBefore: before };
}

export async function reserveAnalysisUsage(userId: string, mode: 'quick' | 'deep', requestedSource?: string) {
  const plan = await buildUsagePlan(userId, mode, requestedSource); const rate = await prisma.rateLimitEvent.count({ where: { userId, action: 'analyze', createdAt: { gte: new Date(Date.now() - 5 * 60_000) } } });
  if (rate >= 3) throw new Error('操作过于频繁，请 5 分钟后再生成新的观隅分析。');
  const event = await prisma.rateLimitEvent.create({ data: { userId, action: 'analyze' } }); return { ...plan, rateLimitEventId: event.id };
}
// Analysis is charged only once a report is successfully written.
export async function commitUsage(plan: UsagePlan, auditId: string) { if (plan.costCents <= 0) return; await prisma.$transaction((tx) => changeBalance(tx, plan.userId, -plan.costCents, { transactionType: 'NEWS_ANALYSIS', description: '观隅分析消耗 3 点', auditId, idempotencyKey: `analysis:${auditId}` })); }
export async function refundAnalysisUsage(plan: UsagePlan) { if (plan.rateLimitEventId) await prisma.rateLimitEvent.deleteMany({ where: { id: plan.rateLimitEventId, userId: plan.userId } }); }

export async function consumeServiceCredits(params: { userId: string; cents: number; transactionType: string; description: string; auditId?: string; reportVersion?: number; taskId?: string; idempotencyKey: string; customFree?: boolean; }) {
  const committed = await consumeServiceCreditsWithResult(params, async () => null);
  return { source: committed.source, balance: committed.balance, transaction: committed.transaction };
}

type ServiceCreditParams = Parameters<typeof consumeServiceCredits>[0];

export async function assertServiceCreditsAvailable(params: Pick<ServiceCreditParams, 'userId' | 'cents' | 'customFree'>) {
  const source = await getUsageSource(params.userId);
  const account = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true, isBanned: true },
  });
  if (!account) throw new Error('账号不存在，请重新登录。');
  if (account.isBanned) throw new Error('账号已被管理员暂停使用。');
  const balanceCents = effectiveCreditCents(account);
  if (params.customFree && source === 'custom') {
    return { source: 'custom' as const, balanceCents };
  }
  if (balanceCents < params.cents) {
    throw new Error(`本次操作需要 ${formatCredits(params.cents)} 点，当前剩余 ${formatCredits(balanceCents)} 点。`);
  }
  return { source: 'platform' as const, balanceCents };
}

export async function consumeServiceCreditsWithResult<T>(
  params: ServiceCreditParams,
  operation: (tx: Prisma.TransactionClient, transaction: Awaited<ReturnType<typeof writeLedger>> | null) => Promise<T>
) {
  const source = await getUsageSource(params.userId);
  if (params.customFree && source === 'custom') {
    const result = await prisma.$transaction((tx) => operation(tx, null));
    return { source: 'custom' as const, balance: null, transaction: null, result };
  }
  return prisma.$transaction(async (tx) => {
    const changed = await changeBalance(tx, params.userId, -params.cents, {
      transactionType: params.transactionType,
      description: params.description,
      auditId: params.auditId,
      relatedReportVersion: params.reportVersion,
      relatedTaskId: params.taskId,
      idempotencyKey: params.idempotencyKey,
    });
    const result = await operation(tx, changed.transaction);
    return {
      source: 'platform' as const,
      balance: centsToDisplayPoints(changed.after),
      transaction: changed.transaction,
      result,
    };
  });
}

export async function consumeQuestionPoint(userId: string, auditId: string, requestId: string) {
  return consumeServiceCredits({
    userId,
    cents: CREDIT_COSTS.AI_FOLLOWUP,
    transactionType: 'AI_FOLLOWUP',
    description: '报告追问消耗 1 点',
    auditId,
    idempotencyKey: `followup:${auditId}:${requestId}`,
    customFree: true,
  });
}
export async function grantPoints(userId: string, points: number, reason: string, orderId?: string) {
  if (!Number.isFinite(points) || points <= 0 || points > 100_000) throw new Error('增加点数必须大于 0 且不超过 100000 点。');
  const result = await prisma.$transaction((tx) => changeBalance(tx, userId, pointsToCents(points), { transactionType: orderId ? 'CREDIT_PURCHASE' : 'ADMIN_ADJUSTMENT', description: reason, orderId, idempotencyKey: orderId ? `order-credit:${orderId}` : `grant:${userId}:${Date.now()}` }));
  return centsToDisplayPoints(result.after);
}

export async function createDiscussionMessageWithCharge(params: { userId: string; reportId: string; reportVersion: number; parentMessageId?: string | null; content: string; languageCode: string; idempotencyKey: string; }) {
  return prisma.$transaction(async (tx) => {
    const prior = await tx.reportDiscussionMessage.findFirst({ where: { userId: params.userId, idempotencyKey: params.idempotencyKey } });
    if (prior) return { message: prior, repeated: true };
    const charged = await changeBalance(tx, params.userId, -CREDIT_COSTS.DISCUSSION, { transactionType: params.parentMessageId ? 'DISCUSSION_REPLY' : 'DISCUSSION_MESSAGE', description: params.parentMessageId ? '发布交流回复消耗 0.5 点' : '发布交流留言消耗 0.5 点', auditId: params.reportId, relatedReportVersion: params.reportVersion, idempotencyKey: `discussion-charge:${params.idempotencyKey}` });
    const message = await tx.reportDiscussionMessage.create({ data: { reportId: params.reportId, reportVersionAtPost: params.reportVersion, userId: params.userId, parentMessageId: params.parentMessageId || null, content: params.content, languageCode: params.languageCode, idempotencyKey: params.idempotencyKey, pointTransactionId: charged.transaction.id } });
    await tx.pointTransaction.update({ where: { id: charged.transaction.id }, data: { relatedDiscussionMessageId: message.id } });
    return { message, repeated: false };
  });
}

const OPEN_ORDER_STATUSES = ['pending', 'PENDING', 'PAYMENT_SUBMITTED', 'PAID'];

export async function fulfillOrder(orderId: string, adminNote = '') {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-order:${orderId}`}));`;
    const order = await tx.purchaseOrder.findUnique({ where: { id: orderId } }); if (!order) throw new Error('订单不存在。');
    if (['FULFILLED', 'confirmed'].includes(order.status)) return { order, repeated: true as const };
    if (!OPEN_ORDER_STATUSES.includes(order.status)) throw new Error('订单已经处理过。');
    await changeBalance(tx, order.userId, pointsToCents(order.points), { transactionType: 'CREDIT_PURCHASE', description: `确认套餐订单 ${order.id}`, orderId: order.id, idempotencyKey: `order-credit:${order.id}` });
    const pendingDays = Math.max(0, order.proAccessDays || 0); const existing = await tx.user.findUnique({ where: { id: order.userId }, select: { pendingProAccessDays: true, proAccessExpiresAt: true } });
    if (pendingDays) {
      const currentExpiry = existing?.proAccessExpiresAt && existing.proAccessExpiresAt > new Date() ? existing.proAccessExpiresAt : null;
      const pendingExpiry = new Date(Date.now() + 90 * 86400000);
      if (currentExpiry) {
        const extended = new Date(Math.min(currentExpiry.getTime() + pendingDays * 86400000, Date.now() + 90 * 86400000));
        await tx.user.update({ where: { id: order.userId }, data: { proAccessExpiresAt: extended } });
      } else await tx.user.update({ where: { id: order.userId }, data: { pendingProAccessDays: Math.min(90, (existing?.pendingProAccessDays || 0) + pendingDays), pendingProAccessExpiresAt: pendingExpiry, planType: 'points' } });
    }
    const fulfilled = await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: 'FULFILLED', confirmedAt: new Date(), fulfilledAt: new Date(), paidAt: order.paidAt || new Date(), adminNote } });
    return { order: fulfilled, repeated: false as const };
  });
}

export async function rejectOrder(orderId: string, adminNote: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-order:${orderId}`}));`;
    const order = await tx.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('订单不存在。');
    if (!OPEN_ORDER_STATUSES.includes(order.status)) throw new Error('订单已经处理过。');
    return tx.purchaseOrder.update({
      where: { id: orderId },
      data: { status: 'REJECTED', adminNote: adminNote || '管理员取消订单' },
    });
  });
}
export function getPackageDefinition(packageType: string, paymentMethod: PaymentMethod = 'alipay_qr') { return getProduct(packageType, paymentMethod); }
export function getProductDefinition(productId: ProductId, paymentMethod: PaymentMethod) { return getProduct(productId, paymentMethod); }
