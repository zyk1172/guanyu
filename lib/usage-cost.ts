import type { RuntimeUsage } from './model-runtime';
import type { PlatformModelSnapshot } from './platform-models';

/** Optional USD millionths per request; the published DeepSeek rate is the sole paid default below. */
export function searchUnitRates(raw: string | undefined): Record<string, number> {
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const rates: Record<string, number> = {};
    for (const [key, rate] of Object.entries(value)) {
      if (/^[a-z_]+$/.test(key) && typeof rate === 'number' && Number.isSafeInteger(rate) && rate >= 0) rates[key] = rate;
    }
    return rates;
  } catch { return {}; }
}

export function usageCostBreakdown(params: {
  snapshot?: PlatformModelSnapshot | null;
  usage: RuntimeUsage;
  searchCounts?: Record<string, number>;
  fallbackSearchCount: number;
  rates: Record<string, number>;
  searchOnly?: boolean;
}) {
  const missing: string[] = [];
  const unitRatesMicros: Record<string, number> = {};
  const counts = Object.fromEntries(Object.entries(params.searchCounts || {}).filter(([, count]) => Number.isSafeInteger(count) && count > 0));
  let knownSearchMicros = 0;
  const count = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!params.searchCounts && params.fallbackSearchCount) missing.push('search_provider_usage');
  for (const [provider, requests] of Object.entries(counts)) {
    const rate = provider === 'deepseek_unbilled' ? 0 : params.rates[provider] ?? (provider === 'deepseek' ? 750 : ['searxng', 'bing', 'duckduckgo', 'brave'].includes(provider) ? 0 : undefined);
    if (!Number.isSafeInteger(rate) || rate < 0) missing.push(`search_price:${provider}`);
    else { unitRatesMicros[provider] = rate; knownSearchMicros += requests * rate; }
  }
  const snapshot = params.snapshot;
  const usage = params.usage;
  if (!params.searchOnly) {
    if (!snapshot) missing.push('external_model_pricing');
    else {
      if (usage.inputTokens > 0 && snapshot.inputPriceMicrosPerMillion <= 0) missing.push('input_token_pricing');
      if (usage.outputTokens > 0 && snapshot.outputPriceMicrosPerMillion <= 0) missing.push('output_token_pricing');
      if (usage.nativeSearchRequests > 0 && snapshot.nativeSearchPriceMicrosPerRequest <= 0) missing.push('native_search_pricing');
    }
    if (!usage.inputTokens && !usage.outputTokens) missing.push('token_usage');
  }
  if (usage.cacheReadTokens) missing.push('cache_token_pricing');
  const searchCostFits = Number.isSafeInteger(knownSearchMicros) && knownSearchMicros <= 2_147_483_647;
  if (!searchCostFits) missing.push('search_cost_out_of_range');
  return {
    searchRequestCount: params.searchCounts ? count : params.fallbackSearchCount,
    estimatedSearchCostMicros: searchCostFits ? knownSearchMicros : null,
    costCoverage: missing.length ? 'partial' : 'recorded_components',
    details: { version: 1, currency: 'USD', scope: params.searchOnly ? 'search_only_estimate' : 'model_and_search_estimate', counts, unitRatesMicros, knownSearchMicros: Number.isSafeInteger(knownSearchMicros) ? knownSearchMicros : null, modelRates: snapshot ? { input: snapshot.inputPriceMicrosPerMillion, output: snapshot.outputPriceMicrosPerMillion, nativeSearch: snapshot.nativeSearchPriceMicrosPerRequest } : null, missing },
  };
}
