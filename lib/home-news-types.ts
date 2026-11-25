import type { RssHeadline, RssSource } from './rss-core.mjs';

export const HOME_NEWS_REFRESH_MS = 60 * 60_000;
export const HOME_NEWS_RETENTION_MS = 7 * 24 * HOME_NEWS_REFRESH_MS;

export type HomeHeadline = RssHeadline & { publisher: string; feedRank: number; imageHref?: string };
export type NewsHeadlineIndex = { title: string; url: string; publishedAt: string; rank: number };
export type HomeNewsStory = {
  id: string;
  headline: HomeHeadline;
  reports: HomeHeadline[];
  sourceCount: number;
  latestAt: string;
  isHot: boolean;
  index?: NewsHeadlineIndex;
  imageHref?: string;
};
export type HomeNewsPayload = {
  sources: Pick<RssSource, 'id' | 'name' | 'nameZh'>[];
  stories: HomeNewsStory[];
  sourceHeadlines?: Record<string, HomeHeadline[]>;
  hotCount: number;
  fetchedAt: string;
  stale?: boolean;
  sourceErrors: Array<{ sourceId: string; message: string }>;
  indexAvailable: boolean;
};

export type HomeNewsResponse = HomeNewsPayload & {
  cacheKey: string;
  // The shared revision observed before this result was created.
  sharedVersion: string | null;
};
