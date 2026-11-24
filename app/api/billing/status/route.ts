import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { activatePendingPro, centsToDisplayPoints, effectiveCreditCents, getOrCreateAppSetting, hasActivePro } from '@/lib/billing';
import { checkoutChannel, checkoutOrderSelect } from '@/lib/checkout';
import { getProduct } from '@/lib/product-catalog';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  await ensureRuntimeSchema();
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请登录后查看点数与套餐。' }, { status: 401 });
  const [initialAccount, appSetting, orders, transactions, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true, planType: true, signupBonusGrantedAt: true, proAccessActivatedAt: true, proAccessExpiresAt: true, pendingProAccessDays: true, pendingProAccessExpiresAt: true } }),
    getOrCreateAppSetting(),
    prisma.purchaseOrder.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10, select: checkoutOrderSelect }),
    prisma.pointTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.userSettings.findUnique({ where: { userId: user.id }, select: { modelSource: true, llmApiKeyEncrypted: true, tavilyApiKeyEncrypted: true, serperApiKeyEncrypted: true } }),
  ]);
  let account = initialAccount;
  if (!account) return NextResponse.json({ error: '账号不存在，请重新登录。' }, { status: 401 });
  if (account.pendingProAccessDays > 0) {
    await activatePendingPro(user.id);
    account = await prisma.user.findUnique({ where: { id: user.id }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true, planType: true, signupBonusGrantedAt: true, proAccessActivatedAt: true, proAccessExpiresAt: true, pendingProAccessDays: true, pendingProAccessExpiresAt: true } });
    if (!account) return NextResponse.json({ error: '账号不存在，请重新登录。' }, { status: 401 });
  }
  const starter = getProduct('STARTER', 'alipay_qr'); const pro = getProduct('PRO', 'alipay_qr'); const paypalStarter = getProduct('STARTER', 'paypal_qr'); const paypalPro = getProduct('PRO', 'paypal_qr');
  return NextResponse.json({
    creditBalance: centsToDisplayPoints(effectiveCreditCents(account)),
    creditDisplay: String(centsToDisplayPoints(effectiveCreditCents(account))).replace(/\.0$/, ''),
    signupBonusGrantedAt: account.signupBonusGrantedAt,
    pro: { active: hasActivePro(account), activatedAt: account.proAccessActivatedAt, expiresAt: account.proAccessExpiresAt },
    modelSource: settings?.modelSource || 'platform',
    customApiConfigured: Boolean(settings?.llmApiKeyEncrypted),
    customSearchConfigured: Boolean(settings?.tavilyApiKeyEncrypted || settings?.serperApiKeyEncrypted),
    packages: {
      alipay: [starter, pro].map((item) => ({ ...item, available: Boolean(checkoutChannel(item.productId, 'alipay_qr', appSetting)) })),
      paypal: [paypalStarter, paypalPro].map((item) => ({ ...item, available: Boolean(checkoutChannel(item.productId, 'paypal_qr', appSetting)) })),
    },
    recentOrders: orders,
    recentTransactions: transactions,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
