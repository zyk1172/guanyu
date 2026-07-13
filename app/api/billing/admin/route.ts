import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { activateByokPlan, getOrCreateAppSetting, grantPoints } from '@/lib/billing';
import { cacheDel, CACHE_KEYS } from '@/lib/cache';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { notifyAccountAccessChanged, notifyCreditsGranted, notifyOrderDecision, sendTrackedEmail } from '@/lib/email';
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
  await ensureRuntimeSchema();
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: '你没有权限管理计费设置。' }, { status: 403 });
  }

  const [setting, orders, users, emailDeliveries] = await Promise.all([
    getOrCreateAppSetting(),
    prisma.purchaseOrder.findMany({
      where: { status: 'pending' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isBanned: true,
        planType: true,
        creditBalance: true,
        creditBalanceCents: true,
        freeQuotaDate: true,
        freeQuotaUsed: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            audits: true,
            purchaseOrders: true,
          },
        },
        audits: {
          select: { id: true, title: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
        purchaseOrders: {
          select: { id: true, packageName: true, amountCents: true, currency: true, status: true, paymentMethod: true, paymentNote: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
        pointTransactions: {
          select: { id: true, delta: true, deltaCents: true, type: true, reason: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.emailDelivery.findMany({
      select: {
        id: true,
        category: true,
        recipient: true,
        subject: true,
        provider: true,
        status: true,
        attempts: true,
        error: true,
        createdAt: true,
        sentAt: true,
        user: { select: { email: true } },
        audit: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    setting: safeAppSetting(setting),
    pendingOrders: orders,
    users,
    emailDeliveries,
  });
}

export async function PATCH(request: NextRequest) {
  await ensureRuntimeSchema();
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
      alipayPointsQrImageUrl: String(body.alipayPointsQrImageUrl || '/alipay-points.jpg').trim(),
      alipayByokQrImageUrl: String(body.alipayByokQrImageUrl || '/alipay-byok.jpg').trim(),
      paypalQrImageUrl: String(body.paypalQrImageUrl || '/paypal-qr.jpg').trim(),
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
    await cacheDel(CACHE_KEYS.appSetting);
    return NextResponse.json({ setting: safeAppSetting(setting) });
  }

  if (action === 'grant') {
    const userId = String(body.userId || '');
    const points = Number.parseInt(String(body.points || ''), 10);
    const reason = String(body.reason || '管理员手动加点').trim();
    const balance = await grantPoints(userId, points, reason);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (target?.email && points > 0) {
      await notifyCreditsGranted({ userId, email: target.email, points, balance, reason });
    }
    return NextResponse.json({ ok: true, balance });
  }

  if (action === 'unlockByok') {
    const userId = String(body.userId || '');
    if (!userId) return NextResponse.json({ error: '缺少用户 ID。' }, { status: 400 });
    const planType = await activateByokPlan(userId, '超级管理员手动解锁高级功能');
    return NextResponse.json({ ok: true, planType });
  }

  if (action === 'setUserBanned') {
    const userId = String(body.userId || '');
    const isBanned = Boolean(body.isBanned);
    if (!userId) return NextResponse.json({ error: '缺少用户 ID。' }, { status: 400 });
    if (userId === admin.id && isBanned) {
      return NextResponse.json({ error: '不能封禁当前超级管理员账号。' }, { status: 400 });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isBanned },
      select: { id: true, email: true, isBanned: true },
    });
    await notifyAccountAccessChanged({
      userId: updated.id,
      email: updated.email,
      isBanned: updated.isBanned,
      reason: String(body.reason || '').trim() || undefined,
    });
    return NextResponse.json({ ok: true, user: updated });
  }

  if (action === 'deleteUser') {
    const userId = String(body.userId || '');
    if (!userId) return NextResponse.json({ error: '缺少用户 ID。' }, { status: 400 });
    if (userId === admin.id) {
      return NextResponse.json({ error: '不能删除当前超级管理员账号。' }, { status: 400 });
    }
    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'sendUserEmail') {
    const userId = String(body.userId || '');
    const subject = String(body.subject || '').trim().slice(0, 120);
    const message = String(body.message || '').trim().slice(0, 3000);
    if (!userId || !subject || !message) {
      return NextResponse.json({ error: '邮件收件人、标题和正文不能为空。' }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!target?.email) return NextResponse.json({ error: '用户邮箱不存在。' }, { status: 404 });

    await sendTrackedEmail({
      category: 'admin_message',
      userId,
      to: target.email,
      subject,
      text: message,
      html: `<div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.8;color:#111827;white-space:pre-wrap">${message.replace(/[<>&]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] || char))}</div>`,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'confirmOrder') {
    const orderId = String(body.orderId || '');
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { user: { select: { email: true } } } });
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
    if (order.user.email) {
      await notifyOrderDecision({
        userId: order.userId,
        email: order.user.email,
        packageName: order.packageName,
        confirmed: true,
        adminNote,
      });
    }
    return NextResponse.json({ ok: true, order: updated, balance, planType });
  }

  if (action === 'rejectOrder') {
    const orderId = String(body.orderId || '');
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { user: { select: { email: true } } } });
    if (!order) return NextResponse.json({ error: '订单不存在。' }, { status: 404 });
    if (order.status !== 'pending') return NextResponse.json({ error: '订单已经处理过。' }, { status: 400 });

    const updated = await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: {
        status: 'rejected',
        adminNote: String(body.adminNote || '管理员取消订单').trim(),
      },
    });
    if (order.user.email) {
      await notifyOrderDecision({
        userId: order.userId,
        email: order.user.email,
        packageName: order.packageName,
        confirmed: false,
        adminNote: updated.adminNote,
      });
    }
    return NextResponse.json({ ok: true, order: updated });
  }

  return NextResponse.json({ error: '未知的管理操作。' }, { status: 400 });
}
