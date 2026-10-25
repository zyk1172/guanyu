export type NewsProvider = 'free' | 'deepseek';
export type NewsPeriod = 'any' | 'day' | 'week' | 'month';
export type NewsArticle = {
  title: string; url: string; snippet: string; source: string;
  publishedAt: string | null; provider: string;
};
export type NewsSearchResult = {
  articles: NewsArticle[]; requestedProvider: NewsProvider;
  providers: string[]; searchedAt: string; cached: boolean;
  timeFilterApplied: boolean; webFallback: boolean;
};
export type NewsCapabilities = {
  defaultProvider: NewsProvider; deepseekAvailable: boolean;
  deepseekSource: 'personal' | 'platform' | null; paidAllowed: boolean;
};
