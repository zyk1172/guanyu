import crypto from 'crypto';
import nodemailer from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
  if (smtpConfigured()) {
    await sendWithSmtp(input);
    return { delivered: true, provider: 'smtp' };
  }

  if (aliyunConfigured()) {
    await sendWithAliyunDirectMail(input);
    return { delivered: true, provider: 'aliyun' };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[dev-email]', JSON.stringify(input, null, 2));
    return { delivered: false, provider: 'dev-log' };
  }

  throw new Error('邮件服务未配置，请联系管理员设置阿里云邮件服务。');
}

export async function sendRegisterCodeEmail(email: string, code: string) {
  return sendEmail({
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

function adminNotifyRecipients() {
  return (process.env.ADMIN_NOTIFY_EMAILS || process.env.ALIYUN_DM_REPLY_TO || process.env.ALIYUN_DM_ACCOUNT_NAME || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function sendWelcomeEmail(email: string) {
  return sendEmail({
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
  points: number;
  paymentNote?: string | null;
}) {
  const recipients = adminNotifyRecipients();
  if (recipients.length === 0) return { delivered: false, provider: 'no-recipient' };

  const amount = (input.amountCents / 100).toFixed(2);
  return sendEmail({
    to: recipients.join(','),
    subject: `观隅待确认订单：${input.packageName} / ${amount} 元`,
    text: [
      '有新的观隅付款订单等待确认。',
      `订单 ID：${input.orderId}`,
      `用户：${input.userEmail || input.userId}`,
      `套餐：${input.packageName}`,
      `金额：${amount} 元`,
      `点数：${input.points}`,
      `付款备注：${input.paymentNote || '未填写'}`,
      `管理入口：${appUrl('/account')}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.7;color:#111827">
        <h2 style="margin:0 0 12px">观隅待确认订单</h2>
        <table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
          <tbody>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">订单 ID</td><td style="padding:8px;border:1px solid #e5e7eb">${input.orderId}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">用户</td><td style="padding:8px;border:1px solid #e5e7eb">${input.userEmail || input.userId}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">套餐</td><td style="padding:8px;border:1px solid #e5e7eb">${input.packageName}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">金额</td><td style="padding:8px;border:1px solid #e5e7eb">${amount} 元</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">点数</td><td style="padding:8px;border:1px solid #e5e7eb">${input.points}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700">付款备注</td><td style="padding:8px;border:1px solid #e5e7eb">${input.paymentNote || '未填写'}</td></tr>
          </tbody>
        </table>
        <p style="margin-top:16px"><a href="${appUrl('/account')}" style="background:#111827;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px;font-weight:700">进入账号管理确认</a></p>
      </div>
    `,
  });
}
