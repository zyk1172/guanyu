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

export function smtpDeliveryFailure(error) {
  const code = Number(error?.responseCode);
  const enhanced = String(error?.response || '').match(/\b[245]\.\d{1,2}\.\d{1,3}\b/)?.[0];
  if (code >= 400 && code <= 599) {
    return {
      status: code >= 500 ? 'failed' : 'temporary_failure',
      detail: `SMTP ${code}${enhanced ? ` ${enhanced}` : ''}`,
    };
  }
  const transport = ['ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND', 'EAUTH', 'ETLS', 'ESOCKET']
    .find(value => value === error?.code);
  if (transport === 'EAUTH' || transport === 'ETLS') return { status: 'failed', detail: `SMTP ${transport}` };
  if (transport && error?.command === 'CONN') return { status: 'temporary_failure', detail: `SMTP ${transport}` };
  return { status: 'unknown', detail: transport ? `SMTP ${transport}，上游接受状态不明。` : '上游接受状态不明。' };
}

export function directMailReceipt(value) {
  const clean = (item) => /^[a-z\d_.:-]{1,160}$/i.test(String(item || '')) ? String(item) : undefined;
  return { requestId: clean(value?.RequestId), messageId: clean(value?.EnvId), code: clean(value?.Code) };
}
