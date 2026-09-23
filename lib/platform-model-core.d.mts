export type PlatformModelProvider = 'openai_compatible' | 'openai' | 'gemini' | 'anthropic' | 'xiaomi_mimo' | 'qwen' | 'moonshot' | 'zhipu';
export type PlatformModelSearchMode = 'platform' | 'native' | 'none';
export type PlatformModelOperation = 'analysis' | 'completion' | 'followup';

export const PLATFORM_MODEL_PROVIDERS: readonly PlatformModelProvider[];
export const PLATFORM_MODEL_SEARCH_MODES: readonly PlatformModelSearchMode[];
export const PLATFORM_MODEL_OPERATIONS: readonly PlatformModelOperation[];
export const PLATFORM_OPERATION_BASE_COST_CENTS: Readonly<Record<PlatformModelOperation, number>>;

export function parseMultiplierToBps(value: unknown): number;
export function formatMultiplierBps(multiplierBps: number): string;
export function calculatePlatformOperationCostCents(baseCostCents: number, multiplierBps: number): number;
export function operationCostCents(operation: PlatformModelOperation, multiplierBps: number): number;
export function formatCreditCents(cents: number): string;
export function localizedModelText(fallback: unknown, translations: unknown, locale: string): string;
export function operationCapabilityField(operation: PlatformModelOperation): 'supportsAnalysis' | 'supportsCompletion' | 'supportsFollowup';
export function normalizeModelOperation(value: unknown): PlatformModelOperation;
export function estimateExternalCostMicros(config: {
  inputPriceMicrosPerMillion?: number;
  outputPriceMicrosPerMillion?: number;
  nativeSearchPriceMicrosPerRequest?: number;
}, usage?: {
  inputTokens?: number;
  outputTokens?: number;
  nativeSearchRequests?: number;
}): number;

export function isOfficialOpenAiApiBaseUrl(value: unknown): boolean;
