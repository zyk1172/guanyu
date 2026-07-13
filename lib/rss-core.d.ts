export type RssRegion = 'international' | 'china' | 'chinese-language' | 'custom';

export interface RssSource {
  id: string;
  name: string;
  nameZh: string;
  region: RssRegion;
  country: string;
  feedUrl: string;
  websiteUrl: string;
  feedFormat?: 'rss' | 'html';
  rssAvailability: 'official_public' | 'official_with_terms' | 'official_headline_fallback' | 'user_configured';
  termsNote: string;
  termsNoteZh?: string;
}

export interface RssCustomFeed {
  name: string;
  url: string;
}

export interface RssSourceConfig {
  catalogIds: string[];
  customFeeds: RssCustomFeed[];
}

export interface RssHeadline {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  publishedAt: string;
}

export const RSS_SOURCE_CATALOG: RssSource[];
export const DEFAULT_RSS_FEED_IDS: string[];
export function parseRssXml(xml: string, source: Pick<RssSource, 'id' | 'name' | 'feedUrl' | 'feedFormat'>): RssHeadline[];
export function isPrivateIpAddress(value: string): boolean;
export function validateCustomRssUrl(value: unknown): string;
export function normalizeRssSourceConfig(input: unknown): RssSourceConfig;
export function parseRssSourceConfig(value: unknown, fallbackCatalogIds?: string[]): RssSourceConfig;
export function getEffectiveRssSourceConfig(input: { canUseOwnApi: boolean; adminConfig: unknown; personalConfig: unknown }): RssSourceConfig;
export function resolveRssSources(config: RssSourceConfig): RssSource[];
export function getRssSourceCatalog(): RssSource[];
