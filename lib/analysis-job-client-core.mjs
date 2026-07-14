export const ACTIVE_ANALYSIS_JOB_STORAGE_KEY = 'guanyu.active-analysis-job-id';

export function normalizeActiveAnalysisJobId(value) {
  const jobId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(jobId) ? jobId : null;
}

export function getAnalysisJobResolution(payload = {}) {
  const auditId = String(payload.auditId || '').trim();
  if (auditId) return { kind: 'completed', auditId };

  if (payload.status === 'failed') {
    return {
      kind: 'failed',
      error: String(payload.error || '审视任务生成失败。'),
    };
  }

  return { kind: 'pending' };
}

export function getVerificationRoadmapStorageKey(auditId, index) {
  const normalizedAuditId = String(auditId || '').trim();
  if (!normalizedAuditId || !Number.isInteger(index) || index < 0) return null;
  return `guanyu.verification-roadmap.${normalizedAuditId}.${index}`;
}
