import { AnalysisResult, ReadWorthVerdict } from './types';
import { computeReadWorthCore } from './read-worth-core.mjs';

function toCoreInput(result: AnalysisResult) {
  return {
    scores: 'scores' in result ? result.scores : undefined,
    score_summary: (result as any).score_summary,
    readingUtility: (result as any).readingUtility || (result as any).reading_utility,
    readingValue: (result as any).readingValue || (result as any).reading_value,
    read_worth: (result as any).read_worth,
    hasSufficientMaterial: Boolean(
      (result as any).newsSummary ||
      (result as any).news_summary ||
      (result as any).originalReading ||
      (result as any).sourceInterpretation?.whatItSays ||
      (result as any).source_interpretation?.what_it_says
    ),
  };
}

export function computeReadWorth(result: AnalysisResult): ReadWorthVerdict {
  return computeReadWorthCore(toCoreInput(result)) as ReadWorthVerdict;
}
