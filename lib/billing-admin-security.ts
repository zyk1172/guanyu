const BILLING_ADMIN_STEP_UP_ACTIONS = new Set([
  'grant',
  'grantProAccess',
  'unlockByok',
  'setUserBanned',
  'deleteUser',
  'sendUserEmail',
]);

export function requiresBillingAdminStepUp(action: string) {
  return BILLING_ADMIN_STEP_UP_ACTIONS.has(action);
}
