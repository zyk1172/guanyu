export type ManualVerificationOutcome = 'verified' | 'unverified';

export interface ManualVerificationCoreResult {
  report: Record<string, unknown>;
  scores: {
    credibility: number;
    informationCompleteness: number;
    narrativeBias: number;
    evidenceStrength: number;
    speculationRisk: number;
  };
  readingValue: string;
  records: Array<{
    index: number;
    question: string;
    outcome: ManualVerificationOutcome;
    updatedAt: string;
  }>;
}

export function applyManualVerification(
  report: unknown,
  input: { index: number; outcome: ManualVerificationOutcome; updatedAt?: string }
): ManualVerificationCoreResult;
