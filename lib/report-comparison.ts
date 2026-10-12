import { z } from 'zod';
import { evidenceUrl, normalizeEvidenceReferences } from './report-evidence';

export const comparisonIdsSchema = z.array(z.string().trim().regex(/^[a-zA-Z0-9_-]{1,100}$/)).min(2).max(3).refine((ids) => new Set(ids).size === ids.length);
const text = (value: unknown, limit = 1200) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').slice(0, 6) : [];
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 6).map((item) => text(item)) : [];

export function comparisonReport(record: { id: string; title: string; source: string; publishedAt: string; reportVersion?: number; auditResultJson: string; originalContent?: string }) {
  let report: Record<string, any> = {};
  try { report = JSON.parse(record.auditResultJson); if (!report || typeof report !== 'object') report = {}; } catch {}
  const online = report.onlineVerification || report.web_verification || {};
  const sources = [...array(online.verifiedSources || online.verified_sources), ...array(online.backgroundSources || online.background_sources), ...array(online.pendingLeads || online.leads_to_verify)].flatMap((source) => {
    const url = evidenceUrl(source.url);
    return url ? [{ title: text(source.title, 300) || new URL(url).hostname, url, status: text(source.verificationStatus || source.verification_status, 60) }] : [];
  });
  const claims = strings(report.sourceInterpretation?.coreClaims);
  if (!claims.length && report.coreClaim) claims.push(text(report.coreClaim));
  if (!claims.length) claims.push(...array(report.nine_mirror_review?.atomic_claims).map((claim) => text(claim.claim)).filter(Boolean));
  return {
    id: record.id, title: text(record.title, 300), source: text(record.source, 300), publishedAt: text(record.publishedAt, 80), reportVersion: record.reportVersion || 1,
    conclusion: text(report.oneSentenceConclusion || report.oneSentenceJudgment || report.one_sentence_conclusion),
    claims,
    findings: array(report.keyFindings || report.key_findings).map((item) => ({ title: text(item.title, 300), content: text(item.content || item.detail), status: text(item.verificationStatus || item.verification_status, 60), ...normalizeEvidenceReferences(item, record.originalContent || '', sources) })),
    gaps: array(report.informationGaps || report.mainInformationGaps || report.information_gaps).map((item) => ({ title: text(item.title, 300), content: text(item.description || item.detail || item.missing_information), nextCheck: text(item.nextVerification || item.verification_method) })),
    nextChecks: array(report.verificationRoadmap || report.verification_roadmap).map((item) => text(item.question)).filter(Boolean),
    sources: [...new Map(sources.map((source) => [source.url, source])).values()].slice(0, 12),
  };
}

export type ComparisonReport = ReturnType<typeof comparisonReport>;

export function comparisonSchema(count: number) {
  const refs = z.array(z.number().int().min(1).max(count)).min(1).max(count).refine((values) => new Set(values).size === values.length);
  const finding = z.object({ text: z.string().trim().min(1).max(1600), reportRefs: refs }).strict();
  return z.object({ summary: finding, sharedClaims: z.array(finding.refine((item) => item.reportRefs.length >= 2)).max(6), differences: z.array(finding).max(6), gaps: z.array(finding).max(6), nextChecks: z.array(finding).max(6) }).strict();
}

export type ComparisonSynthesis = z.infer<ReturnType<typeof comparisonSchema>>;

/** Keep model context bounded; full comparison cards remain available to readers. */
export function comparisonModelContext(reports: ComparisonReport[]) {
  return reports.map((report, index) => ({
    number: index + 1, title: report.title.slice(0, 160), source: report.source.slice(0, 120),
    reportVersion: report.reportVersion, abridged: true, conclusion: report.conclusion.slice(0, 600),
    claims: report.claims.slice(0, 3).map((claim) => claim.slice(0, 400)),
    findings: report.findings.slice(0, 3).map((finding) => ({ title: finding.title.slice(0, 120), content: finding.content.slice(0, 350), status: finding.status, originalQuote: finding.originalQuote?.slice(0, 300) })),
    gaps: report.gaps.slice(0, 2).map((gap) => ({ title: gap.title.slice(0, 120), content: gap.content.slice(0, 350), nextCheck: gap.nextCheck.slice(0, 200) })),
    nextChecks: report.nextChecks.slice(0, 2).map((check) => check.slice(0, 200)),
  }));
}
