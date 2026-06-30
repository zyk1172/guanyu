import { AnalysisResult, ReadWorthVerdict } from './types';
import { computeReadWorthCore } from './read-worth-core.mjs';

function toCoreInput(result: AnalysisResult) {
  if ('scores' in result && result.scores) {
    return { scores: result.scores };
  }

  return {
    score_summary: (result as any).score_summary,
  };
}

export function computeReadWorth(result: AnalysisResult): ReadWorthVerdict {
  return computeReadWorthCore(toCoreInput(result)) as ReadWorthVerdict;
}
