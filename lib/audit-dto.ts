export function publicAuditDto(audit: any) {
  return {
    id: audit.id,
    title: audit.title,
    source: audit.source,
    publishedAt: audit.publishedAt,
    publishedAtSource: audit.publishedAtSource,
    publishedAtConfidence: audit.publishedAtConfidence,
    reportType: audit.reportType,
    readingValue: audit.readingValue,
    analysisMode: audit.analysisMode,
    reportLanguage: audit.reportLanguage,
    reasoningDepth: audit.reasoningDepth,
    modelName: audit.modelName,
    modelDisplayNameSnapshot: audit.modelDisplayNameSnapshot,
    newsSummary: audit.newsSummary,
    originalContent: audit.originalContent,
    auditResultJson: audit.auditResultJson,
    credibilityScore: audit.credibilityScore,
    informationCompletenessScore: audit.informationCompletenessScore,
    narrativeBiasScore: audit.narrativeBiasScore,
    evidenceStrengthScore: audit.evidenceStrengthScore,
    speculationRiskScore: audit.speculationRiskScore,
    isPublic: audit.isPublic,
    indexable: audit.indexable,
    viewCount: audit.viewCount,
    heatScore: audit.heatScore,
    completionMarkdown: audit.completionMarkdown,
    completionGeneratedAt: audit.completionGeneratedAt,
    reportVersion: audit.reportVersion,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  };
}

export function ownerAuditDto(audit: any) {
  return {
    ...publicAuditDto(audit),
    focus: audit.focus,
  };
}

export function adminAuditDto(audit: any) {
  return { ...audit };
}

export function auditDtoForAccess(audit: any, canManage: boolean, isSuperAdmin: boolean) {
  if (isSuperAdmin) return adminAuditDto(audit);
  if (canManage) return ownerAuditDto(audit);
  return publicAuditDto(audit);
}
