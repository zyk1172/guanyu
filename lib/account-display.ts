// Display labels only: persisted billing values and API contracts stay unchanged.
type Label = readonly [string, string];
const ORDER_STATUS: Record<string, Label> = {
  PENDING: ['待人工确认', 'Awaiting confirmation'],
  PAYMENT_SUBMITTED: ['付款待核对', 'Payment under review'],
  PAID: ['已确认付款，待到账', 'Payment confirmed, awaiting fulfillment'],
  FULFILLED: ['点数已到账', 'Credits delivered'],
  CANCELLED: ['已取消', 'Cancelled'],
  REJECTED: ['未通过核对', 'Rejected'],
  REFUNDED: ['已退款', 'Refunded'],
};
const EMAIL_CATEGORY: Record<string, Label> = {
  report_completed: ['报告生成通知', 'Report completed'],
  audit_created: ['报告生成通知', 'Report completed'],
  account_banned: ['账号封禁通知', 'Account suspended'],
  account_unbanned: ['账号解封通知', 'Account restored'],
  credits_granted: ['点数到账通知', 'Credits granted'],
  order_confirmed: ['订单确认通知', 'Order confirmed'],
  order_rejected: ['订单核对通知', 'Order rejected'],
  order_submitted: ['订单提交通知', 'Order submitted'],
  welcome: ['欢迎邮件', 'Welcome'],
  register_code: ['注册验证码', 'Registration code'],
  login_code: ['登录验证码', 'Login code'],
  password_reset: ['密码重置', 'Password reset'],
  password_changed: ['密码修改通知', 'Password changed'],
  admin_message: ['管理员通知', 'Administrator message'],
  feedback_submitted: ['用户反馈通知', 'User feedback'],
};

function label(value: Label, language: string) {
  return value[language.startsWith('zh') ? 0 : 1];
}

export function formatOrderStatus(status: string, language: string) {
  // Legacy orders used lower-case values and called fulfillment "confirmed".
  const normalized = status.toUpperCase();
  return label(ORDER_STATUS[normalized === 'CONFIRMED' ? 'FULFILLED' : normalized]
    || ['待核对状态', 'Status requires review'], language);
}

export function formatPlanType(plan: string, language: string) {
  const plans: Record<string, Label> = {
    free: ['平台账户', 'Platform account'],
    points: ['点数账户', 'Credit account'],
    byok: ['个人 API 账户', 'Personal API account'],
  };
  return label(plans[plan] || ['其他账户', 'Other account'], language);
}

export function formatEmailCategory(category: string, language: string) {
  return label(EMAIL_CATEGORY[category] || ['其他通知', 'Other notification'], language);
}
