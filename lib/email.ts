import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { mergeAdminRecipientEmails } from '@/lib/admin-recipient-core.mjs';
import { buildPendingPaymentLines } from '@/lib/payment-notification-core.mjs';
import { formatPaymentAmount, getPaymentMethodLabel } from '@/lib/payment-core.mjs';
import { buildReportCompletionEmail } from '@/lib/report-email-core.mjs';
import { getEmailProviderPlan, normalizeEmailError } from '@/lib/email-delivery-core.mjs';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface TrackedEmailInput extends SendEmailInput {
  category: 'report_completed' | 'account_banned' | 'account_unbanned' | 'credits_granted' | 'order_confirmed' | 'order_rejected' | 'welcome' | 'register_code' | 'admin_message' | 'order_submitted';
  userId?: string | null;
  auditId?: string | null;
  metadata?: Record<string, unknown>;
}

function escapeHtml(value: string | null | undefined) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function aliyunConfigured() {
  return Boolean(
    process.env.ALIYUN_ACCESS_KEY_ID &&
    process.env.ALIYUN_ACCESS_KEY_SECRET &&
    process.env.ALIYUN_DM_ACCOUNT_NAME
  );
}

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function signAliyunParams(params: Record<string, string>, secret: string) {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
  const stringToSign = `POST&%2F&${percentEncode(canonical)}`;
  return crypto
    .createHmac('sha1', `${secret}&`)
    .update(stringToSign)
    .digest('base64');
}

async function sendWithAliyunDirectMail(input: SendEmailInput) {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET || '';
  const accountName = process.env.ALIYUN_DM_ACCOUNT_NAME || '';
  const fromAlias = process.env.ALIYUN_DM_FROM_ALIAS || '观隅';
  const regionId = process.env.ALIYUN_DM_REGION || 'cn-hangzhou';

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    AccountName: accountName,
    Action: 'SingleSendMail',
    AddressType: '1',
    Format: 'JSON',
    FromAlias: fromAlias,
    HtmlBody: input.html,
    RegionId: regionId,
    ReplyToAddress: 'false',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Subject: input.subject,
    Timestamp: new Date().toISOString(),
    ToAddress: input.to,
    Version: '2015-11-23',
  };
  params.Signature = signAliyunParams(params, accessKeySecret);

  const body = new URLSearchParams(params);
  const response = await fetch('https://dm.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`阿里云邮件发送失败 (${response.status}): ${text.slice(0, 160)}`);
  }
}

async function sendWithSmtp(input: SendEmailInput) {
  const port = Number.parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'false' ? false : port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const fromName = process.env.SMTP_FROM_NAME || '观隅';
  await transporter.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendEmail(input: SendEmailInput) {
  const providerPlan = getEmailProviderPlan({
    smtpConfigured: smtpConfigured(),
    aliyunConfigured: aliyunConfigured(),
  });
  const errors: string[] = [];

  for (const provider of providerPlan) {
    try {
      if (provider === 'smtp') await sendWithSmtp(input);
      else await sendWithAliyunDirectMail(input);
      return { delivered: true, provider };
    } catch (error) {
      errors.push(`${provider}: ${normalizeEmailError(error)}`);
    }
  }

  if (providerPlan.length === 0 && process.env.NODE_ENV !== 'production') {
    console.log('[dev-email]', JSON.stringify(input, null, 2));
    return { delivered: false, provider: 'dev-log' };
  }

  if (providerPlan.length === 0) {
    throw new Error('邮件服务未配置，请联系管理员设置 SMTP 或阿里云 DirectMail。');
  }
  throw new Error(`邮件投递失败：${errors.join(' | ')}`);
}

export async function sendTrackedEmail(input: TrackedEmailInput) {
  await ensureRuntimeSchema();
  const delivery = await prisma.emailDelivery.create({
    data: {
      userId: input.userId || null,
      auditId: input.auditId || null,
      category: input.category,
      recipient: input.to,
      subject: input.subject,
      status: 'pending',
      attempts: 1,
      metadataJson: JSON.stringify(input.metadata || {}),
    },
  });

  let attempts = 0;
  let lastError: unknown;
  let result: Awaited<ReturnType<typeof sendEmail>> | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      result = await sendEmail(input);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  try {
    if (!result) throw lastError || new Error('邮件投递失败');
    const updated = await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts,
        status: result.delivered ? 'sent' : 'failed',
        provider: result.provider,
        error: result.delivered ? null : '开发环境仅记录邮件，未实际投递。',
        sentAt: result.delivered ? new Date() : null,
      },
    });
    return { delivered: result.delivered, provider: result.provider, deliveryId: updated.id };
  } catch (error) {
    const message = normalizeEmailError(error);
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', attempts, error: message },
    });
    console.error('[email-delivery-failed]', JSON.stringify({ category: input.category, recipient: input.to, deliveryId: delivery.id, error: message }));
    return { delivered: false, provider: 'none', deliveryId: delivery.id, error: message };
  }
}

export async function sendRegisterCodeEmail(email: string, code: string) {
  return sendTrackedEmail({
    category: 'register_code',
    to: email,
    subject: '观隅注册验证码',
    text: `您的观隅注册验证码是 ${code}，10 分钟内有效。`,
    html: `
      <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7;color:#111827">
        <h2 style="margin:0 0 12px">观隅注册验证码</h2>
        <p>您的验证码是：</p>
        <div style="font-size:28px;font-weight:800;letter-spacing:6px;margin:12px 0;color:#312e81">${code}</div>
        <p style="color:#6b7280">验证码 10 分钟内有效。如果不是您本人操作，请忽略此邮件。</p>
      </div>
    `,
  });
}

function appUrl(path = '/') {
  const base = process.env.NEXTAUTH_URL || process.env.APP_URL || 'https://guanyu-seven.vercel.app';
  return `${base.replace(/\/$/, '')}${path}`;
}

async function adminNotifyRecipients() {
  const configuredValues = [
    'zykhs@icloud.com',
    process.env.ADMIN_NOTIFY_EMAILS,
    process.env.SUPER_ADMIN_EMAILS,
    process.env.ALIYUN_DM_REPLY_TO,
  ];
  const configuredSuperAdminEmails = String(process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const administrators = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'super_admin' },
        ...(configuredSuperAdminEmails.length ? [{ email: { in: configuredSuperAdminEmails } }] : []),
      ],
    },
    select: { email: true },
  });
  return mergeAdminRecipientEmails(configuredValues, administrators.map((user) => user.email));
}

function formatPointBalance(creditBalance?: number | null, creditBalanceCents?: number | null) {
  const cents = creditBalanceCents && creditBalanceCents > 0
    ? creditBalanceCents
    : Number(creditBalance || 0) * 100;
  return Number((cents / 100).toFixed(1));
}

export async function sendWelcomeEmail(email: string) {
  return sendTrackedEmail({
    category: 'welcome',
    to: email,
    subject: '欢迎使用观隅：新闻叙事审视使用指南',
    text: [
      '欢迎使用观隅。',
      '观隅用于帮助你阅读新闻时区分原文事实、报道主张、叙事框架、证据缺口和待核验问题。',
      '使用方式：登录后粘贴新闻链接或正文，点击观隅分析；报告生成后可在我的审视中查看、追问、导出 Markdown。',
      '重要免责声明：观隅输出不构成事实认定、法律意见、投资建议、医疗建议或任何专业意见；报告中的推断性内容仅供进一步核验参考。',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.8;color:#2d251b;background:#f4ecd8;padding:24px">
        <div style="max-width:640px;margin:0 auto;background:#fff8e8;border:1px solid #d8c7a8;border-radius:14px;padding:24px">
          <h1 style="margin:0 0 8px;font-size:24px;color:#2d251b">欢迎来到观隅</h1>
          <p style="margin:0 0 18px;color:#6f6252">看见新闻没有展开的一角。</p>
          <p>观隅不是“替你判断真相”的工具，而是帮助你把新闻文本拆成：原文明确事实、报道主张、叙事框架、证据状态、信息缺口、利益关系和待核验问题。</p>
          <h2 style="font-size:16px;margin-top:20px">快速使用</h2>
          <ol>
            <li>在首页粘贴新闻链接，或手动粘贴标题、来源和正文。</li>
            <li>点击“开始观隅分析”，等待系统生成完整审视报告。</li>
            <li>在“我的审视”查看历史记录，按需公开、隐藏、删除或导出 Markdown。</li>
            <li>在报告页使用“继续追问”，围绕原文和报告进一步核验。</li>
          </ol>
          <h2 style="font-size:16px;margin-top:20px">重要免责声明</h2>
          <p style="font-size:13px;color:#6f6252">观隅基于用户提交内容、账号配置和可用外部线索生成结构化报告。报告不构成事实认定、法律意见、投资建议、医疗建议、行政决定或任何专业意见。报告中的推断、替代解释、风险提示和待核验事项仅用于辅助阅读和进一步核查，不应直接视为已经证实的事实。涉及法律、财务、医疗、安全、公共事务等高影响决策时，请以原始文件、权威数据、专业人员意见和多方独立来源为准。</p>
          <p style="margin-top:20px"><a href="${appUrl('/')}" style="display:inline-block;background:#7a4f22;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700">打开观隅</a></p>
        </div>
      </div>
    `,
  });
}

export async function notifyAdminsPendingOrder(input: {
  orderId: string;
  userEmail?: string | null;
  userId: string;
  packageName: string;
  amountCents: number;
  currency: string;
  points: number;
  paymentMethod: string;
  paymentNote?: string | null;
  userName?: string | null;
  planType?: string | null;
  creditBalance?: number | null;
  creditBalanceCents?: number | null;
  freeQuotaUsed?: number | null;
  orderCreatedAt: Date | string;
}) {
  const recipients = await adminNotifyRecipients();
  if (recipients.length === 0) return { delivered: false, provider: 'no-recipient' };

  const amount = formatPaymentAmount(input.amountCents, input.currency);
  const paymentMethodLabel = getPaymentMethodLabel(input.paymentMethod);
  const detailLines = buildPendingPaymentLines(input);
  const accountLabel = input.userName ? `${input.userName} <${input.userEmail || input.userId}>` : (input.userEmail || input.userId);
  const orderCreatedAt = new Date(input.orderCreatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const results = await Promise.all(recipients.map((recipient) => sendTrackedEmail({
    category: 'order_submitted',
    to: recipient,
    subject: `观隅待确认订单：${input.packageName} / ${amount}`,
    text: [
      '有新的观隅付款订单等待确认。',
      `用户：${accountLabel}`,
      `账号 ID：${input.userId}`,
      `当前套餐：${input.planType || 'free'}`,
      `当前点数：${formatPointBalance(input.creditBalance, input.creditBalanceCents)}`,
      `今日已用免费次数：${input.freeQuotaUsed ?? 0}`,
      ...detailLines,
      `下单时间：${orderCreatedAt}`,
      `管理入口：${appUrl('/account')}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7;color:#111827">
        <h2 style="margin:0 0 12px">观隅待确认订单</h2>
        <table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
          <tbody>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">订单 ID</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.orderId)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">用户</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(accountLabel)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">账号 ID</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.userId)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">当前套餐</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.planType || 'free')}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">当前点数</td><td style="padding:8px;border:1px solid #e5e7eb">${formatPointBalance(input.creditBalance, input.creditBalanceCents)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">今日已用免费次数</td><td style="padding:8px;border:1px solid #e5e7eb">${input.freeQuotaUsed ?? 0}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">套餐</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.packageName)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">金额</td><td style="padding:8px;border:1px solid #e5e7eb">${amount}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">点数</td><td style="padding:8px;border:1px solid #e5e7eb">${input.points}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">付款方式</td><td style="padding:8px;border:1px solid #e5e7eb">${paymentMethodLabel}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">付款备注</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.paymentNote || '未填写')}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">下单时间</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(orderCreatedAt)}</td></tr>
          </tbody>
        </table>
        <p style="margin-top:16px"><a href="${appUrl('/account')}" style="background:#111827;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px;font-weight:700">进入账号管理确认</a></p>
      </div>
    `,
  })));
  return { delivered: results.some((result) => result.delivered), provider: results.find((result) => result.delivered)?.provider || 'none' };
}

export async function notifyUserPendingOrder(input: {
  userEmail?: string | null;
  orderId: string;
  packageName: string;
  amountCents: number;
  currency: string;
  points: number;
  paymentMethod: string;
  paymentNote?: string | null;
}) {
  if (!input.userEmail) return { delivered: false, provider: 'no-recipient' };

  const detailLines = buildPendingPaymentLines(input);
  return sendTrackedEmail({
    category: 'order_submitted',
    to: input.userEmail,
    subject: `观隅订单已提交，等待确认：${input.packageName}`,
    text: [
      '你的观隅付款订单已提交，正在等待管理员人工确认。',
      ...detailLines,
      '确认后，点数或买断权限会自动写入你的账号。若付款信息有误，请联系管理员并提供订单 ID。',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7;color:#111827">
        <h2 style="margin:0 0 12px">观隅订单已提交</h2>
        <p>你的付款订单已提交，正在等待管理员人工确认。</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
          <tbody>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">订单 ID</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.orderId)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">套餐</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.packageName)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">金额</td><td style="padding:8px;border:1px solid #e5e7eb">${formatPaymentAmount(input.amountCents, input.currency)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">付款方式</td><td style="padding:8px;border:1px solid #e5e7eb">${getPaymentMethodLabel(input.paymentMethod)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">付款备注</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(input.paymentNote || '未填写')}</td></tr>
          </tbody>
        </table>
        <p style="margin-top:16px">确认后，点数或买断权限会自动写入你的账号。若付款信息有误，请联系管理员并提供订单 ID。</p>
      </div>
    `,
  });
}

export async function notifyReportCompleted(input: {
  userEmail?: string | null;
  audit: {
    id: string;
    userId?: string | null;
    title: string;
    source: string;
    reportLanguage?: string | null;
    modelName?: string | null;
    reasoningDepth?: string | null;
    createdAt?: Date | string | null;
  };
  report: unknown;
}) {
  const reportUrl = appUrl(`/audits/${input.audit.id}`);
  const mail = buildReportCompletionEmail({
    audit: input.audit,
    report: input.report,
    reportUrl,
  });
  const [adminRecipients, userResult] = await Promise.all([
    adminNotifyRecipients(),
    input.userEmail
      ? sendTrackedEmail({
          ...mail,
          category: 'report_completed',
          to: input.userEmail,
          userId: input.audit.userId || null,
          auditId: input.audit.id,
          metadata: { recipientRole: 'creator' },
        })
      : Promise.resolve({ delivered: false }),
  ]);
  const userEmail = input.userEmail?.trim().toLowerCase();
  const recipients = adminRecipients.filter((email) => email.toLowerCase() !== userEmail);
  const adminResults = await Promise.all(recipients.map((recipient) => sendTrackedEmail({
    ...mail,
    category: 'report_completed',
    to: recipient,
    userId: input.audit.userId || null,
    auditId: input.audit.id,
    subject: `[Admin copy] ${mail.subject}`,
    metadata: { recipientRole: 'administrator', creatorEmail: userEmail || null },
  })));

  return {
    creatorDelivered: userResult.delivered,
    administratorDelivered: adminResults.some((result) => result.delivered),
    administratorRecipientCount: recipients.length,
  };
}

export async function notifyAccountAccessChanged(input: {
  userId: string;
  email: string;
  isBanned: boolean;
  reason?: string;
}) {
  const subject = input.isBanned ? '观隅账号已暂停使用' : '观隅账号已恢复使用';
  const headline = input.isBanned ? '你的观隅账号已被暂停' : '你的观隅账号已恢复';
  const message = input.isBanned
    ? '账号目前无法登录、创建报告或提交订单。如认为该处理有误，请联系管理员并提供注册邮箱。'
    : '你现在可以重新登录、创建报告和使用账号内的有效点数。';
  return sendTrackedEmail({
    category: input.isBanned ? 'account_banned' : 'account_unbanned',
    userId: input.userId,
    to: input.email,
    subject,
    text: [headline, message, input.reason ? `说明：${input.reason}` : ''].filter(Boolean).join('\n'),
    html: `<div style="margin:0;padding:28px 16px;background:#f2ead9;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#2d251b;line-height:1.75"><main style="max-width:620px;margin:0 auto;background:#fffdf7;border:1px solid #dfcfad;border-radius:14px;padding:26px"><h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(headline)}</h1><p style="margin:0;color:#5f5546">${escapeHtml(message)}</p>${input.reason ? `<p style="margin:16px 0 0;padding:12px;border-left:3px solid #b98c4c;background:#f8f0df">说明：${escapeHtml(input.reason)}</p>` : ''}<p style="margin:20px 0 0"><a href="${appUrl('/login')}" style="display:inline-block;background:#7a4f22;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700">打开观隅</a></p></main></div>`,
  });
}

export async function notifyCreditsGranted(input: {
  userId: string;
  email: string;
  points: number;
  balance: number;
  reason: string;
}) {
  return sendTrackedEmail({
    category: 'credits_granted',
    userId: input.userId,
    to: input.email,
    subject: '观隅点数已到账',
    text: `已为你的观隅账号增加 ${input.points} 点。当前可用点数：${input.balance} 点。\n原因：${input.reason}`,
    html: `<div style="margin:0;padding:28px 16px;background:#f2ead9;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#2d251b;line-height:1.75"><main style="max-width:620px;margin:0 auto;background:#fffdf7;border:1px solid #dfcfad;border-radius:14px;padding:26px"><h1 style="margin:0 0 12px;font-size:22px">观隅点数已到账</h1><p style="margin:0">本次增加 <strong style="font-size:20px;color:#7a4f22">${input.points} 点</strong>，当前可用点数为 <strong>${input.balance} 点</strong>。</p><p style="margin:14px 0 0;color:#5f5546">原因：${escapeHtml(input.reason)}</p><p style="margin:20px 0 0"><a href="${appUrl('/account')}" style="display:inline-block;background:#7a4f22;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700">查看账号点数</a></p></main></div>`,
  });
}

export async function notifyOrderDecision(input: {
  userId: string;
  email: string;
  packageName: string;
  confirmed: boolean;
  adminNote?: string | null;
}) {
  const subject = input.confirmed ? '观隅订单已确认' : '观隅订单未获确认';
  const message = input.confirmed
    ? `你的“${input.packageName}”订单已确认，权益已写入账号。`
    : `你的“${input.packageName}”订单未获确认。请核对付款备注和转账信息后重新提交。`;
  return sendTrackedEmail({
    category: input.confirmed ? 'order_confirmed' : 'order_rejected',
    userId: input.userId,
    to: input.email,
    subject,
    text: [message, input.adminNote ? `管理员说明：${input.adminNote}` : ''].filter(Boolean).join('\n'),
    html: `<div style="margin:0;padding:28px 16px;background:#f2ead9;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#2d251b;line-height:1.75"><main style="max-width:620px;margin:0 auto;background:#fffdf7;border:1px solid #dfcfad;border-radius:14px;padding:26px"><h1 style="margin:0 0 12px;font-size:22px">${escapeHtml(subject)}</h1><p style="margin:0">${escapeHtml(message)}</p>${input.adminNote ? `<p style="margin:16px 0 0;padding:12px;border-left:3px solid #b98c4c;background:#f8f0df">管理员说明：${escapeHtml(input.adminNote)}</p>` : ''}<p style="margin:20px 0 0"><a href="${appUrl('/account')}" style="display:inline-block;background:#7a4f22;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700">打开账号管理</a></p></main></div>`,
  });
}
