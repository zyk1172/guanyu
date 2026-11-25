import { z } from 'zod';
import type { PlatformModelSnapshot } from '@/lib/platform-models';

export const analysisQuoteSchema = z.object({
  source: z.enum(['platform', 'custom']),
  costCents: z.number().int().nonnegative(),
  modelVersion: z.string().min(1).max(160),
}).strict();

export type AnalysisQuote = z.infer<typeof analysisQuoteSchema>;

export function platformAnalysisVersion(model: Pick<PlatformModelSnapshot, 'configId' | 'configVersion'>) {
  return `${model.configId}:${model.configVersion}`;
}
