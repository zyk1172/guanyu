import { HOME_NEWS_RETENTION_MS, type HomeNewsResponse } from './home-news-types';

export type BrowserNewsSnapshot = {
  data: HomeNewsResponse;
  etag: string | null;
  manual: boolean;
};

export function readBrowserNews(key: string, identity: string): BrowserNewsSnapshot | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (stored?.identity !== identity) return null;
    const age = Date.now() - Date.parse(stored.data?.fetchedAt);
    if (!Number.isFinite(age) || age >= HOME_NEWS_RETENTION_MS) return null;
    if (!Array.isArray(stored.data?.stories) || !Array.isArray(stored.data.sources) || !Array.isArray(stored.data.sourceErrors)) return null;
    return stored;
  } catch {
    return null;
  }
}

export function saveBrowserNews(key: string, identity: string, snapshot: BrowserNewsSnapshot) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...snapshot, identity }));
  } catch {
    // The page can still use its in-memory snapshot if storage is unavailable.
  }
}

export function adoptSharedNews(
  current: BrowserNewsSnapshot | null,
  data: HomeNewsResponse,
  etag: string | null,
): BrowserNewsSnapshot {
  if (current && current.data.cacheKey === data.cacheKey) {
    const currentVersion = current.data.sharedVersion ?? '';
    const nextVersion = data.sharedVersion ?? '';
    if (nextVersion < currentVersion || (current.manual && nextVersion === currentVersion)) {
      return { ...current, etag };
    }
  }
  return { data, etag, manual: false };
}
