export function buildTavilySearchRequest(query, limit = 5, searchDepth = 'basic') {
  const normalizedQuery = String(query || '').trim().replace(/\s+/g, ' ');
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 5, 1), 10);
  const safeDepth = searchDepth === 'advanced' ? 'advanced' : 'basic';

  return {
    query: normalizedQuery,
    search_depth: safeDepth,
    max_results: safeLimit,
    include_answer: false,
    include_raw_content: false,
  };
}

export function normalizeTavilySearchResponse(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return results
    .map((item) => ({
      title: String(item?.title || '').trim(),
      url: String(item?.url || '').trim(),
      snippet: String(item?.content || item?.snippet || '').trim(),
    }))
    .filter((item) => item.title && item.url);
}
