function splitAllowList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminIdentity(user, env = {}) {
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'super_admin') return true;

  const email = String(user.email || '').trim().toLowerCase();
  const id = String(user.id || '').trim().toLowerCase();
  const allowedEmails = splitAllowList(env.SUPER_ADMIN_EMAILS);
  const allowedIds = splitAllowList(env.SUPER_ADMIN_IDS);

  return Boolean((email && allowedEmails.includes(email)) || (id && allowedIds.includes(id)));
}
