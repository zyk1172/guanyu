function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (value === null || value === undefined) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {{ status?: string, nextAttemptAt?: Date|string|number|null, leaseExpiresAt?: Date|string|number|null, now?: Date|string|number }} input
 */
export function shouldScheduleAnalyzeJobRecovery({ status, nextAttemptAt, leaseExpiresAt, now = new Date() } = {}) {
  const nowMs = timestamp(now);
  if (nowMs === null) return false;

  if (status === 'pending') {
    const nextAttemptMs = timestamp(nextAttemptAt);
    return nextAttemptAt === null || nextAttemptAt === undefined || (nextAttemptMs !== null && nextAttemptMs <= nowMs);
  }

  if (status === 'running') {
    const leaseExpiresMs = timestamp(leaseExpiresAt);
    return leaseExpiresMs !== null && leaseExpiresMs <= nowMs;
  }

  return false;
}
