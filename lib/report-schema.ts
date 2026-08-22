import { z } from 'zod';

const score = z.number().int().min(0).max(100);

const scoresSchema = z.object({
  credibility: score,
  informationCompleteness: score,
  narrativeBias: score,
  evidenceStrength: score,
  speculationRisk: score,
}).strict();

const readingUtilitySchema = z.object({
  publicImportance: score,
  informationGain: score,
  uniqueness: score,
  explanatoryDepth: score,
  actionability: score,
  informationDensity: score,
}).strict();

const scoreReasonsSchema = z.object({
  credibility: z.string().trim().min(1),
  informationCompleteness: z.string().trim().min(1),
  narrativeBias: z.string().trim().min(1),
  evidenceStrength: z.string().trim().min(1),
  speculationRisk: z.string().trim().min(1),
}).strict();

/**
 * The rest of the report is normalized for backwards-compatible field aliases,
 * but these fields are the model-owned numeric and explanatory contract. They
 * must be present and valid before a new report can be persisted.
 */
export const ReportSchema = z.object({
  reportType: z.literal('deep'),
  newsSummary: z.string().trim().min(1),
  oneSentenceConclusion: z.string().trim().min(1),
  readingValueReason: z.string().trim().min(1),
  readingUtility: readingUtilitySchema,
  scores: scoresSchema,
  scoreReasons: scoreReasonsSchema,
}).passthrough();

export type ValidatedReport = z.infer<typeof ReportSchema>;

export function reportSchemaErrorPaths(error: z.ZodError) {
  return error.issues.map((issue) => issue.path.join('.') || '<root>').slice(0, 20);
}
