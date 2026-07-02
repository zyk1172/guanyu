export function buildSerperSearchRequest(query, limit = 5) {
  const normalizedQuery = String(query || '').trim().replace(/\s+/g, ' ');
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 5, 1), 10);

  return {
    q: normalizedQuery,
    num: safeLimit,
    gl: 'cn',
    hl: 'zh-cn',
  };
}

export function normalizeSerperSearchResponse(payload) {
  const organic = Array.isArray(payload?.organic) ? payload.organic : [];
  const news = Array.isArray(payload?.news) ? payload.news : [];

  return [...organic, ...news]
    .map((item) => ({
      title: String(item?.title || '').trim(),
      url: String(item?.link || '').trim(),
      snippet: String(item?.snippet || item?.date || '').trim(),
    }))
    .filter((item) => item.title && item.url);
}

