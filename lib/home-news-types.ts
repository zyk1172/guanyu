import type { RssHeadline, RssSource } from './rss-core.mjs';

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
  hotCount: number;
  fetchedAt: string;
  stale?: boolean;
  sourceErrors: Array<{ sourceId: string; message: string }>;
  indexAvailable: boolean;
};
