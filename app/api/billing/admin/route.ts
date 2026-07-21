import { after, NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { fulfillOrder, getOrCreateAppSetting, grantPoints, rejectOrder } from '@/lib/billing';
import { cacheDel, CACHE_KEYS } from '@/lib/cache';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { notifyAccountAccessChanged, notifyCreditsGranted, notifyOrderDecision, sendTrackedEmail } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { calculateProAccessExpiry } from '@/lib/pro-access-core.mjs';
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

  const [setting, orders, users, emailDeliveries, discussionReports] = await Promise.all([
    getOrCreateAppSetting(),
    prisma.purchaseOrder.findMany({
      where: { status: { in: ['pending', 'PENDING', 'PAYMENT_SUBMITTED', 'PAID'] } },
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
    prisma.discussionReport.findMany({
      where: { status: 'PENDING' },
      include: {
        reporter: { select: { email: true, name: true } },
        message: { select: { id: true, content: true, status: true, reportId: true, report: { select: { title: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    setting: safeAppSetting(setting),
    pendingOrders: orders,
    users,
    emailDeliveries,
    discussionReports,
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
      enableAdminTavilySearch: Boolean(body.enableAdminTavilySearch),
      enableAdminSerperSearch: Boolean(body.enableAdminSerperSearch),
      alipayQrImageUrl: String(body.alipayQrImageUrl || '').trim(),
      alipayPointsQrImageUrl: String(body.alipayPointsQrImageUrl || '/alipay-points.jpg').trim(),
      alipayByokQrImageUrl: String(body.alipayByokQrImageUrl || '/alipay-byok.jpg').trim(),
      paypalQrImageUrl: String(body.paypalQrImageUrl || '/paypal-qr.jpg').trim(),
      alipayQrNote: String(body.alipayQrNote || '').trim() || '基础点数包到账 30 点；专业点数包到账 80 点，付款确认后立即开始 30 天 Pro 专业权益。付款备注请填写账号邮箱、昵称或转账时间。',
    };
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
    const points = Number(body.points);
    const reason = String(body.reason || '管理员手动加点').trim();
    if (!userId) return NextResponse.json({ error: '缺少用户 ID。' }, { status: 400 });
    if (!Number.isFinite(points) || points <= 0 || points > 100_000) {
      return NextResponse.json({ error: '增加点数必须大于 0 且不超过 100000 点。' }, { status: 400 });
    }
    const balance = await grantPoints(userId, points, reason);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (target?.email && points > 0) {
      after(async () => {
        try {
          await notifyCreditsGranted({ userId, email: target.email, points, balance, reason });
        } catch (error) {
          console.error('Notify credits granted failed:', error);
        }
      });
    }
    return NextResponse.json({ ok: true, balance });
  }

  if (action === 'grantProAccess' || action === 'unlockByok') {
    const userId = String(body.userId || '');
    if (!userId) return NextResponse.json({ error: '缺少用户 ID。' }, { status: 400 });
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { proAccessExpiresAt: true } });
    if (!target) return NextResponse.json({ error: '用户不存在。' }, { status: 404 });
    const now = new Date();
    const expiresAt = calculateProAccessExpiry(now, target.proAccessExpiresAt, 30);
    await prisma.user.update({ where: { id: userId }, data: { proAccessActivatedAt: new Date(), proAccessExpiresAt: expiresAt, pendingProAccessDays: 0, pendingProAccessExpiresAt: null } });
    return NextResponse.json({ ok: true, expiresAt });
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
    after(async () => {
      try {
        await notifyAccountAccessChanged({
          userId: updated.id,
          email: updated.email,
          isBanned: updated.isBanned,
          reason: String(body.reason || '').trim() || undefined,
        });
      } catch (error) {
        console.error('Notify account access change failed:', error);
      }
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
    if (!orderId) return NextResponse.json({ error: '缺少订单 ID。' }, { status: 400 });
    const adminNote = String(body.adminNote || '').trim();
    let result;
    try {
      result = await fulfillOrder(orderId, adminNote);
    } catch (error) {
      const message = error instanceof Error ? error.message : '订单确认失败。';
      return NextResponse.json({ error: message }, { status: message === '订单不存在。' ? 404 : 400 });
    }
    const updated = result.order;
    const target = result.repeated ? null : await prisma.user.findUnique({ where: { id: updated.userId }, select: { email: true } });
    if (target?.email && !result.repeated) {
      after(async () => {
        try {
          await notifyOrderDecision({
            userId: updated.userId,
            email: target.email,
            packageName: updated.packageName,
            confirmed: true,
            adminNote,
          });
        } catch (error) {
          console.error('Notify confirmed order failed:', error);
        }
      });
    }
    return NextResponse.json({ ok: true, order: updated, repeated: result.repeated });
  }

  if (action === 'rejectOrder') {
    const orderId = String(body.orderId || '');
    if (!orderId) return NextResponse.json({ error: '缺少订单 ID。' }, { status: 400 });
    let updated;
    try {
      updated = await rejectOrder(orderId, String(body.adminNote || '管理员取消订单').trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : '订单取消失败。';
      return NextResponse.json({ error: message }, { status: message === '订单不存在。' ? 404 : 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: updated.userId }, select: { email: true } });
    if (target?.email) {
      after(async () => {
        try {
          await notifyOrderDecision({
            userId: updated.userId,
            email: target.email,
            packageName: updated.packageName,
            confirmed: false,
            adminNote: updated.adminNote,
          });
        } catch (error) {
          console.error('Notify rejected order failed:', error);
        }
      });
    }
    return NextResponse.json({ ok: true, order: updated });
  }

  return NextResponse.json({ error: '未知的管理操作。' }, { status: 400 });
}
