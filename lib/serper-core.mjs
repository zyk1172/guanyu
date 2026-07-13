export function buildSerperSearchRequest(query, limit = 5, locale = 'zh-CN') {
  const normalizedQuery = String(query || '').trim().replace(/\s+/g, ' ');
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 5, 1), 10);

  const localeConfig = {
    'zh-CN': { gl: 'cn', hl: 'zh-cn' },
    'zh-TW': { gl: 'tw', hl: 'zh-tw' },
    'en-US': { gl: 'us', hl: 'en' },
    'ja-JP': { gl: 'jp', hl: 'ja' },
    'ko-KR': { gl: 'kr', hl: 'ko' },
    'de-DE': { gl: 'de', hl: 'de' },
    'it-IT': { gl: 'it', hl: 'it' },
  }[locale] || { gl: 'cn', hl: 'zh-cn' };

  return {
    q: normalizedQuery,
    num: safeLimit,
    ...localeConfig,
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
