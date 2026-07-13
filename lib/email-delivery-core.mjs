export function getEmailProviderPlan({ smtpConfigured, aliyunConfigured }) {
  const providers = [];
  if (smtpConfigured) providers.push('smtp');
  if (aliyunConfigured) providers.push('aliyun');
  return providers;
}

export function normalizeEmailError(error) {
  const message = String(error?.message || error || '邮件投递失败').replace(/\s+/g, ' ').trim();
  return message.slice(0, 500) || '邮件投递失败';
}
