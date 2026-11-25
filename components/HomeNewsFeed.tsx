'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { RefreshCw } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { Button, ButtonLink, Select } from '@/components/ui/controls';
import { useUiLanguage } from './LanguageProvider';
import { useSession } from 'next-auth/react';
import { formatCreditCents } from '@/lib/platform-model-core.mjs';
import { adoptSharedNews, readBrowserNews, saveBrowserNews, type BrowserNewsSnapshot } from '@/lib/home-news-client';
import { HOME_NEWS_REFRESH_MS, type HomeNewsResponse, type HomeNewsStory } from '@/lib/home-news-types';
import type { NewsArticle } from '@/lib/news-search-types';
import { newsDate } from '@/lib/news-search-core';

function NewsPhoto({ src }: { src?: string }) {
  const [failed,setFailed]=useState(false);
  return src && !failed ? <Image className="news-card-photo" src={src} width={640} height={360} alt="" unoptimized loading="lazy" onError={()=>setFailed(true)} /> : null;
}
function NewsDetail({ story, close, analyze, disabled, active, cost, asOf, signedIn }: {
  story: HomeNewsStory; close: () => void; analyze: () => void;
  disabled: boolean; active: boolean; cost: number | null; asOf: string; signedIn: boolean;
}) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const { headline } = story;
  const related = story.reports.filter((report, index, reports) =>
    reports.findIndex(item => item.publisher === report.publisher) === index);
  const validTime = Number.isFinite(Date.parse(headline.publishedAt))
    && Date.parse(headline.publishedAt) <= Date.parse(asOf) + 5 * 60_000;
  return <Dialog open onClose={close} title={headline.title} closeLabel={zh ? '关闭' : 'Close'}>
    <div className="space-y-4">
      <p className="news-detail-meta">
        {headline.sourceName}
        {' · '}
        {validTime ? <time dateTime={headline.publishedAt}>
          {new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(headline.publishedAt))}
        </time> : zh ? '发布时间未知' : 'Date unknown'}
      </p>
      {headline.summary && <p>{headline.summary}</p>}
      {story.isHot && <div className="news-detail-evidence">
        <p>{zh ? `${story.sourceCount} 个来源关注` : `Covered by ${story.sourceCount} sources`}</p>
        <ul>
          {related.map(report => <li key={report.id}><a href={report.url} target="_blank" rel="noopener noreferrer">{report.sourceName} · {report.title}</a></li>)}
          {story.index && <li><a href={story.index.url} target="_blank" rel="noopener noreferrer">{zh ? 'Google 新闻头条' : 'Google News headline'}</a></li>}
        </ul>
      </div>}
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={headline.url} target="_blank" rel="noopener noreferrer">{zh ? '查看原文' : 'Open original'}</ButtonLink>
        <Button variant="primary" disabled={disabled} busy={active} onClick={analyze}>
          {active ? (zh ? '分析中…' : 'Analyzing…') : (signedIn ? (zh ? '确认分析' : 'Confirm analysis') : (zh ? '登录后继续' : 'Sign in to continue'))}
          {signedIn && cost !== null && !active ? ` · ${formatCreditCents(cost)} ${zh ? '点' : 'credits'}` : ''}
        </Button>
      </div>
    </div>
  </Dialog>;
}

type FeedProps = {
  onSelect: (article: NewsArticle) => Promise<void> | void;
  busy: boolean;
  canAnalyze: boolean;
  cost: number | null;
};

export default function HomeNewsFeed(props: FeedProps) {
  const { language } = useUiLanguage();
  const { data: session, status } = useSession();
  const identity = status === 'authenticated' ? session.user?.id : status === 'unauthenticated' ? 'guest' : undefined;
  return <NewsFeed key={JSON.stringify([language, identity])} {...props} identity={identity} signedIn={status === 'authenticated'} />;
}

function NewsFeed({ onSelect, busy, canAnalyze, cost, identity, signedIn }: FeedProps & { identity?: string; signedIn: boolean }) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const storageKey = `guanyu:home-news:v1:${language}:${signedIn ? 'account' : 'guest'}`;
  const [data, setData] = useState<HomeNewsResponse | null>(null);
  const [initialLoad, setInitialLoad] = useState<'restoring' | 'loading' | 'ready'>('restoring');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'hot' | 'latest'>('hot');
  const [source, setSource] = useState('all');
  const [limit, setLimit] = useState(6);
  const [active, setActive] = useState('');
  const [selected, setSelected] = useState<HomeNewsStory | null>(null);
  const snapshot = useRef<BrowserNewsSnapshot | null>(null);
  const controller = useRef<AbortController | null>(null);
  const followup = useRef<number | undefined>(undefined);
  const lastCheck = useRef(0);
  const choosing = useRef(false);

  const show = useCallback((next: BrowserNewsSnapshot) => {
    snapshot.current = next;
    setData(next.data);
    if (!next.data.hotCount) setMode('latest');
  }, []);

  const load = useCallback(async function sync(manual = false, checkStale = true) {
    if (!identity || (!manual && controller.current)) return;
    controller.current?.abort();
    window.clearTimeout(followup.current);
    const abort = new AbortController();
    controller.current = abort;
    if (manual) {
      setRefreshing(true);
      setError('');
    } else {
      lastCheck.current = Date.now();
    }
    try {
      const url = `/api/news/home?locale=${encodeURIComponent(language)}`;
      const etag = snapshot.current?.etag;
      const options: RequestInit = {
        method: manual ? 'POST' : 'GET',
        cache: 'no-store',
        signal: abort.signal,
        headers: !manual && etag ? { 'If-None-Match': etag } : undefined,
      };
      let response = await fetch(url, options);
      for (let attempt = 0; !manual && response.status === 409 && attempt < 8; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        abort.signal.throwIfAborted();
        response = await fetch(url, options);
      }
      if (response.status === 304) return;
      if (!response.ok) {
        if (response.status === 429) throw new Error('rate_limit');
        throw new Error('feed_unavailable');
      }
      const payload = await response.json() as HomeNewsResponse;
      if (abort.signal.aborted) return;
      const previous = snapshot.current;
      const next = manual
        ? { data: payload, etag: null, manual: true }
        : adoptSharedNews(previous, payload, response.headers.get('etag'));
      if (previous?.data !== next.data) show(next);
      else snapshot.current = next;
      saveBrowserNews(storageKey, identity, next);
      setError('');
      if (payload.stale && checkStale) {
        followup.current = window.setTimeout(() => void sync(false, false), 15_000);
      }
    } catch (failure) {
      if (abort.signal.aborted || (!manual && snapshot.current)) return;
      const limited = failure instanceof Error && failure.message === 'rate_limit';
      setError(limited
        ? (zh ? '刷新过于频繁，请稍后再试。' : 'Too many refreshes. Try again in a few minutes.')
        : (zh ? '新闻暂时无法读取，请刷新或使用关键词搜索。' : 'News is unavailable. Refresh or search a topic.'));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setInitialLoad('ready');
        if (manual) setRefreshing(false);
      }
    }
  }, [identity, language, show, storageKey, zh]);

  useEffect(() => {
    if (!identity) return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      const cached = readBrowserNews(storageKey, identity);
      if (cached) show(cached);
      else setInitialLoad('loading');
      void load();
    });

    function checkWhenVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current >= 60_000) void load();
    }
    function scheduleNextHour() {
      return window.setTimeout(() => {
        if (document.visibilityState === 'visible') void load();
        hourly = scheduleNextHour();
      }, HOME_NEWS_REFRESH_MS - Date.now() % HOME_NEWS_REFRESH_MS + 1000);
    }

    let hourly = scheduleNextHour();
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      mounted = false;
      controller.current?.abort();
      controller.current = null;
      window.clearTimeout(followup.current);
      window.clearTimeout(hourly);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [identity, load, show, storageKey]);

  const selectedSource = data?.sources.some(item => item.id === source) ? source : 'all';
  const base=mode==='hot'?(data?.stories||[]).filter(story=>story.isHot):(data?.stories||[]).flatMap(story=>story.reports.map(headline=>({...story,id:headline.id,headline,latestAt:headline.publishedAt,imageHref:headline.imageHref})));
  const stories=base.filter(story=>selectedSource==='all'||(mode==='latest'?story.headline.sourceId===selectedSource:story.reports.some(report=>report.sourceId===selectedSource))).map(story=>{
    const headline=mode==='hot'&&selectedSource!=='all'?story.reports.find(report=>report.sourceId===selectedSource):undefined;
    return headline?{...story,headline,imageHref:headline.imageHref}:story;
  });
  if(mode==='latest')stories.sort((a,b)=>(Date.parse(b.latestAt)||0)-(Date.parse(a.latestAt)||0));
  async function analyze(story:HomeNewsStory){if(choosing.current||busy)return;choosing.current=true;setActive(story.id);try{await onSelect({title:story.headline.title,url:story.headline.url,source:story.headline.sourceName,snippet:story.headline.summary||'',publishedAt:newsDate(story.headline.publishedAt),provider:'rss'})}finally{choosing.current=false;setActive('')}}
  return <section className="home-news" aria-label={zh?'RSS 新闻推荐':'RSS news recommendations'}>
    <div className="news-feed-toolbar">
      <div className="news-feed-tabs"><Button variant="tab" aria-pressed={mode==='hot'} onClick={()=>{setMode('hot');setLimit(6)}}>{zh?'热点':'Hot topics'}</Button><Button variant="tab" aria-pressed={mode==='latest'} onClick={()=>{setMode('latest');setLimit(6)}}>{zh?'最新':'Latest'}</Button></div>
      <Select aria-label={zh?'新闻源筛选':'News source'} className="news-source-filter" value={selectedSource} onChange={event=>{setSource(event.target.value);setLimit(6)}}><option value="all">{zh?'全部新闻源':'All sources'}</option>{data?.sources.map(item=><option key={item.id} value={item.id}>{zh?item.nameZh||item.name:item.name}</option>)}</Select>
      <Button variant="secondary" disabled={!identity} busy={refreshing} onClick={() => void load(true)} aria-label={zh?'刷新新闻':'Refresh news'}><RefreshCw aria-hidden="true"/>{refreshing ? (zh ? '刷新中…' : 'Refreshing…') : (zh ? '刷新' : 'Refresh')}</Button>
      <details className="news-ranking-help"><summary>{zh?'热点依据':'How topics are selected'}</summary><div><p>{zh?'热点取自近 48 小时的多源关注，或近 24 小时 Google 新闻头条收录，综合来源数量和更新时间排序。相同网站的不同订阅源不重复计数；这是报道关注度，不代表全网阅读量或事实已核实。':'Topics have coverage from multiple publishers within 48 hours or appear in Google News headlines within 24 hours. Ranking uses source diversity and recency, not site views or a verdict on truth. Feeds from the same publisher count once.'}</p><p>{cost!==null?(zh?`分析成功后按当前模型计费，每篇 ${formatCreditCents(cost)} 点。`:`Analysis costs ${formatCreditCents(cost)} credits after a report is saved.`):(zh?'浏览新闻免费，生成分析时确认当前模型费用。':'Browse for free. Analysis uses your current model rate.')}{zh?' 自定义 API 的调用费用由服务商收取。':' Custom API provider fees apply separately.'}</p></div></details>
    </div>
    <div className="news-feed-status">
      {data?.sourceErrors.length ? <p role="status">{zh?`${data.sources.length-data.sourceErrors.length}/${data.sources.length} 个订阅源已更新，其余暂不可用。`:`${data.sources.length-data.sourceErrors.length}/${data.sources.length} sources updated; others are temporarily unavailable.`}</p>:null}
      {data?.fetchedAt && <p>{data.stale?(zh?'显示上次成功同步的新闻':'Showing the last successful update'):(zh?'更新于':'Updated')} {new Intl.DateTimeFormat(language,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(data.fetchedAt))}</p>}
    </div>
    {data&&!data.hotCount&&mode==='latest'&&<p role="status" className="news-feed-notice">{zh?'暂未发现有足够依据的热点，当前展示最新报道。':'No supported hot topics are available. Showing the latest reports.'}</p>}
    {error&&<div role="alert" className="news-feed-notice"><p>{error}</p><Button busy={refreshing} onClick={() => void load(true)}>{zh?'重试':'Retry'}</Button></div>}
    {initialLoad==='loading'&&!data?<p role="status" className="news-feed-loading">{zh?'正在同步新闻与热点…':'Loading news and topic coverage…'}</p>:stories.length?<>
      <div className="news-card-grid">
        {stories.slice(0, limit).map(story => <article className="news-card" key={story.id}>
          <NewsPhoto key={story.imageHref} src={story.imageHref} />
          <Button variant="ghost" className="news-card-trigger" onClick={() => setSelected(story)}>
            <span className="news-card-title">{story.headline.title}</span>
          </Button>
        </article>)}
      </div>
      {selected && <NewsDetail story={selected} asOf={data?.fetchedAt || ''} cost={cost} signedIn={signedIn}
        close={() => setSelected(null)} active={active === selected.id}
        disabled={busy || !!active || !identity || (signedIn && !canAnalyze)}
        analyze={() => {
          const story = selected;
          setSelected(null);
          void analyze(story);
        }} />}
      {stories.length>limit&&<div className="news-feed-more"><Button onClick={()=>setLimit(limit+6)}>{zh?'查看更多报道':'More reports'}</Button></div>}
    </>:initialLoad==='ready'&&!error?<p role="status" className="news-feed-notice">{zh?'当前筛选下暂无报道。可以切换“最新”、选择其他新闻源，或搜索关键词。':'No reports match these filters. Try Latest, another source, or a keyword search.'}</p>:null}
  </section>;
}
