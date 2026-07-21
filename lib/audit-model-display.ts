export type AuditModelFields = {
  modelName: string;
  modelDisplayNameSnapshot?: string | null;
};

export function historicalAuditModelName(audit: AuditModelFields) {
  return String(audit.modelDisplayNameSnapshot || audit.modelName || '').trim();
}

export function withHistoricalAuditModelName<T extends AuditModelFields>(audit: T): T {
  return { ...audit, modelName: historicalAuditModelName(audit) };
}
