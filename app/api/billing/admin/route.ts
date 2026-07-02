import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { activateByokPlan, getOrCreateAppSetting, grantPoints } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/secret';

async function requireAdmin(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return null;
  const ok = await getSuperAdminStatus(user.id);
  return ok ? user : null;
}

function safeAppSetting(setting: Awaited<ReturnType<typeof getOrCreateAppSetting>>) {
  const {
    adminLlmApiKeyEncrypted,
    adminTavilyApiKeyEncrypted,
    adminSerperApiKeyEncrypted,
    ...safe
  } = setting;
  return {
    ...safe,
    hasAdminLlmApiKey: Boolean(adminLlmApiKeyEncrypted),
    hasAdminTavilyApiKey: Boolean(adminTavilyApiKeyEncrypted),
    hasAdminSerperApiKey: Boolean(adminSerperApiKeyEncrypted),
  };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: '你没有权限管理计费设置。' }, { status: 403 });
  }

  const [setting, orders, users] = await Promise.all([
    getOrCreateAppSetting(),
    prisma.purchaseOrder.findMany({
      where: { status: 'pending' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.user.findMany({
      select: { id: true, email: true, creditBalance: true, role: true, planType: true },
      orderBy: { email: 'asc' },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    setting: safeAppSetting(setting),
    pendingOrders: orders,
    users,
  });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: '你没有权限管理计费设置。' }, { status: 403 });
  }

  const body = await request.json();
  const action = String(body.action || '');

  if (action === 'settings') {
    const update: any = {
      adminModelName: String(body.adminModelName || '').trim() || 'gpt-4o',
      adminLlmBaseUrl: String(body.adminLlmBaseUrl || '').trim() || 'https://api.openai.com/v1',
      enableAdminTavilySearch: Boolean(body.enableAdminTavilySearch),
      enableAdminSerperSearch: Boolean(body.enableAdminSerperSearch),
      alipayQrImageUrl: String(body.alipayQrImageUrl || '').trim(),
      alipayQrNote: String(body.alipayQrNote || '').trim() || '6 元购买 30 点；30 元买断后可填写自己的大模型和搜索 API。付款备注请填写账号邮箱、昵称或转账时间。',
    };
    if (String(body.adminLlmApiKey || '').trim()) update.adminLlmApiKeyEncrypted = encryptSecret(String(body.adminLlmApiKey).trim());
    if (String(body.adminTavilyApiKey || '').trim()) update.adminTavilyApiKeyEncrypted = encryptSecret(String(body.adminTavilyApiKey).trim());
    if (String(body.adminSerperApiKey || '').trim()) update.adminSerperApiKeyEncrypted = encryptSecret(String(body.adminSerperApiKey).trim());

    const setting = await prisma.appSetting.upsert({
      where: { id: 'global' },
      update,
      create: { id: 'global', ...update },
    });
    return NextResponse.json({ setting: safeAppSetting(setting) });
  }

  if (action === 'grant') {
    const userId = String(body.userId || '');
    const points = Number.parseInt(String(body.points || ''), 10);
    const reason = String(body.reason || '管理员手动加点').trim();
    const balance = await grantPoints(userId, points, reason);
    return NextResponse.json({ ok: true, balance });
  }

  if (action === 'confirmOrder') {
    const orderId = String(body.orderId || '');
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) return NextResponse.json({ error: '订单不存在。' }, { status: 404 });
    if (order.status !== 'pending') return NextResponse.json({ error: '订单已经处理过。' }, { status: 400 });

    const adminNote = String(body.adminNote || '').trim();
    let balance: number | null = null;
    let planType: string | null = null;
    if (order.packageType === 'byok_lifetime') {
      planType = await activateByokPlan(order.userId, `确认买断订单 ${order.id}`, order.id);
    } else {
      balance = await grantPoints(order.userId, order.points, `确认点数订单 ${order.id}`, order.id);
      await prisma.user.update({
        where: { id: order.userId },
        data: { planType: 'points' },
      });
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        adminNote,
      },
    });
    return NextResponse.json({ ok: true, order: updated, balance, planType });
  }

  return NextResponse.json({ error: '未知的管理操作。' }, { status: 400 });
}
