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
