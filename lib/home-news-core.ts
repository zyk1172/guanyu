import { XMLParser } from 'fast-xml-parser';
import type { HomeHeadline, HomeNewsStory, NewsHeadlineIndex } from './home-news-types';

const HOUR = 3600_000;
const stop = new Set('the and for with from into amid after before over under about says said this that have has are was were will would could news live updates latest report reports world more what why how who not new all out now its his her their they than been being also just 中国新闻 最新消息 新闻 报道 记者 表示 今天 目前'.split(/\s+/));
const aliases: Array<[RegExp, string]> = [
  [/united states|\bu\.?s\.?\b|美国|美國/gi, ' qcountryus '], [/ukraine|ukrainian|乌克兰|烏克蘭/gi, ' qukraine '],
  [/russia|russian|俄罗斯|俄羅斯/gi, ' qrussia '], [/china|chinese|中国|中國/gi, ' qcountrychina '],
  [/donald trump|\btrump\b|特朗普|川普/gi, ' qtrump '], [/\bvance\b|万斯|萬斯/gi, ' qvance '],
  [/\biran(?:ian)?\b|伊朗/gi, ' qiran '], [/\bisrael(?:i)?\b|以色列/gi, ' qisrael '], [/\bgaza\b|加沙|加薩/gi, ' qgaza '],
  [/\bebola\b|埃博拉|伊波拉/gi, ' qebola '], [/\bfederal reserve\b|\bfed\b|美联储|美聯儲/gi, ' qfed '],
  [/\bmidterms?\b|中期选举|中期選舉/gi, ' qmidterm qvote '], [/\belections?\b|选举|選舉/gi, ' qvote '],
  [/\bdemocrats?\b|民主党|民主黨/gi, ' qdemocrat '], [/\brepublicans?\b|共和党|共和黨/gi, ' qrepublican '],
  [/\binterest rates?\b|利率/gi, ' qrate '], [/\bearthquake\b|地震/gi, ' qquake '], [/\bceasefire\b|停火/gi, ' qceasefire '],
  [/中国国际进口博览会|中國國際進口博覽會|进博会|進博會|\bciie\b/gi, ' qexpo '],
  [/joshua wong|黄之锋|黃之鋒/gi, ' qwong '], [/sentenc(?:e|ed|ing)|\bjailed\b|\bimprisoned\b|判刑|判囚|获刑|獲刑/gi, ' qsentence '],
];
const generic = new Set(['qcountryus', 'qcountrychina', 'qvote', 'qtrump', 'qrussia', 'qukraine', 'qiran', 'qisrael', 'qgaza']);

function normalizedTitle(title: string) {
  return title.toLowerCase().replace(/\s+-\s+[^-]{2,50}$/, '').replace(/[^\p{L}\p{N}]/gu, '');
}
function tokens(title: string) {
  let value = title.normalize('NFKC').toLowerCase();
  for (const [pattern, replacement] of aliases) value = value.replace(pattern, replacement);
  const result = new Set<string>();
  for (const word of value.match(/[a-z][a-z0-9]{2,}/g) || []) {
    if (!stop.has(word)) result.add(word.length > 5 ? word.replace(/s$/, '') : word);
  }
  for (const phrase of value.match(/[\p{Script=Han}]{2,}/gu) || []) {
    for (let i = 0; i < phrase.length - 1; i++) {
      const part = phrase.slice(i, i + 2);
      if (!stop.has(part)) result.add(part);
    }
  }
  return result;
}
type TopicProfile = { normalized: string; titleTokens: Set<string>; contextTokens: Set<string> };
function similar(a: TopicProfile, b: TopicProfile) {
  const left = a.normalized, right = b.normalized;
  if (Math.min(left.length, right.length) >= 12 && (left.includes(right) || right.includes(left))) return true;
  const ta = a.titleTokens, tb = b.titleTokens, common = [...ta].filter(token => tb.has(token));
  // A shared person/country alone is not a topic match.
  const specific = common.filter(token => !generic.has(token));
  return specific.length >= 2 && common.length >= 3 && (2 * common.length) / Math.max(ta.size + tb.size, 1) >= 0.36;
}
function topicMatch(a: TopicProfile, b: TopicProfile) {
  if (similar(a,b)) return true;
  const left=a.contextTokens,right=b.contextTokens;
  // Specific named events may have different headlines across languages. Do
  // not apply this shortcut to generic countries, actors, wars or elections.
  if(left.has('qmidterm')&&right.has('qmidterm')&&!left.has('qcountrychina')&&!right.has('qcountrychina'))return true;
  if(left.has('qexpo')&&right.has('qexpo'))return true;
  return ['qwong','qsentence'].every(token=>left.has(token)&&right.has(token));
}
function timestamp(value: string, now: number) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 5 * 60_000 ? time : 0;
}
function storyUrl(value: string) {
  try {
    const url = new URL(value);url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|at_|fbclid$|gclid$|maca$)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, '');
  } catch { return value; }
}
export function publisherKey(websiteUrl: string) {
  try {
    const host = new URL(websiteUrl).hostname.replace(/^(?:www|m)\./, '').toLowerCase();
    if (/(?:^|\.)bbc(?:i\.co\.uk|\.co\.uk|\.com)$/.test(host)) return 'bbc';
    if (/(?:^|\.)chinanews\.com(?:\.cn)?$/.test(host)) return 'chinanews';
    const parts = host.split('.');
    return parts.slice(/\.(?:com|co|org|net)\.(?:cn|uk|hk|au|jp|sg)$/.test(host) ? -3 : -2).join('.');
  } catch { return websiteUrl; }
}

export function parseHeadlineIndex(xml: string): NewsHeadlineIndex[] {
  try {
    const document = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false }).parse(xml);
    const items = document?.rss?.channel?.item;
    return (Array.isArray(items) ? items : items ? [items] : []).slice(0, 20).flatMap((item: Record<string, unknown>, rank: number) => {
      if (typeof item.title !== 'string' || typeof item.link !== 'string' || !/^https:\/\/news\.google\.com\//.test(item.link)) return [];
      return [{ title: item.title.slice(0, 500), url: item.link, publishedAt: String(item.pubDate || ''), rank }];
    });
  } catch { return []; }
}

export function rankHomeNews(headlines: HomeHeadline[], index: NewsHeadlineIndex[] = [], options: { now?: number; language?: string } = {}) {
  const now = options.now ?? Date.now(), language = options.language || 'zh-CN';
  // Tokenize each bounded article/index item once, not on every pairwise
  // comparison. This cache lives only for this ranking request.
  const profiles = new Map<Pick<HomeHeadline,'title'|'summary'>, TopicProfile>();
  const profile = (item: Pick<HomeHeadline,'title'|'summary'>) => {
    let value=profiles.get(item);
    if(!value){value={normalized:normalizedTitle(item.title),titleTokens:tokens(item.title),contextTokens:tokens(`${item.title} ${item.summary||''}`)};profiles.set(item,value)}
    return value;
  };
  const seen = new Set<string>();
  const items = headlines.filter(item => {
    const key = storyUrl(item.url), time = timestamp(item.publishedAt, now);
    if (seen.has(key) || (time && now - time > 7 * 24 * HOUR)) return false;
    seen.add(key);return true;
  }).slice(0, 240).sort((a, b) => timestamp(b.publishedAt, now) - timestamp(a.publishedAt, now));
  const groups: HomeHeadline[][] = [];
  for (const item of items) {
    const time = timestamp(item.publishedAt, now);
    const group = time && now - time <= 48 * HOUR ? groups.find(group => group.every(other => {
      const otherTime = timestamp(other.publishedAt, now);
      return otherTime && Math.abs(otherTime - time) <= 36 * HOUR && topicMatch(profile(item), profile(other));
    })) : undefined;
    if (group) group.push(item);else groups.push([item]);
  }
  const scored = groups.map(reports => {
    const recent = reports.filter(report => timestamp(report.publishedAt, now) && now - timestamp(report.publishedAt, now) <= 48 * HOUR);
    const sourceCount = new Set(recent.map(report => report.publisher)).size;
    const latestTime = Math.max(...reports.map(report => timestamp(report.publishedAt, now)));
    const headlineIndex = index.find(entry => timestamp(entry.publishedAt, now) && now - timestamp(entry.publishedAt, now) <= 24 * HOUR && recent.some(report => topicMatch(profile(report),profile(entry))));
    const primaryScore = (report: HomeHeadline) => (language.startsWith('zh') && /[\p{Script=Han}]/u.test(report.title) ? 4 : 0) + (report.imageUrl ? 1 : 0) + 1 / (report.feedRank + 1);
    const headline = [...reports].sort((a, b) => primaryScore(b) - primaryScore(a))[0];
    const isHot = recent.length > 0 && (sourceCount >= 2 || Boolean(headlineIndex));
    const age = latestTime ? Math.max(0, now - latestTime) / HOUR : 168;
    const score = (1 + Math.log2(Math.max(sourceCount, 1)) + (headlineIndex ? 2 + 1 / (headlineIndex.rank + 1) : 0)) * Math.pow(0.5, age / 18);
    const story: HomeNewsStory = {
      id: headline.id, headline, reports, sourceCount: Math.max(sourceCount, 1),
      latestAt: latestTime ? new Date(latestTime).toISOString() : '', isHot, ...(headlineIndex ? { index: headlineIndex } : {}),
    };
    return { story, score, latestTime };
  });
  return scored.sort((a, b) => Number(b.story.isHot) - Number(a.story.isHot) || (a.story.isHot ? b.score - a.score : b.latestTime - a.latestTime) || a.story.id.localeCompare(b.story.id)).map(item => item.story).slice(0, 80);
}
