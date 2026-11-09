'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { RefreshCw } from 'lucide-react';
import { Button, ButtonLink, Select } from '@/components/ui/controls';
import { useUiLanguage } from './LanguageProvider';
import { useSession } from 'next-auth/react';
import { formatCreditCents } from '@/lib/platform-model-core.mjs';
import type { HomeNewsPayload, HomeNewsStory } from '@/lib/home-news-types';
import type { NewsArticle } from '@/lib/news-search-types';
import { newsDate } from '@/lib/news-search-core';

function NewsPhoto({ src }: { src?: string }) {
  const [failed,setFailed]=useState(false);
  return src && !failed ? <Image className="news-card-photo" src={src} width={640} height={360} alt="" unoptimized loading="lazy" onError={()=>setFailed(true)} /> : null;
}
function NewsCard({ story, onAnalyze, disabled, active, cost, asOf }: { story:HomeNewsStory; onAnalyze:(story:HomeNewsStory)=>void; disabled:boolean; active:boolean; cost:number|null;asOf:string }) {
  const {language}=useUiLanguage(),zh=language.startsWith('zh');
  const headline=story.headline;
  const related=story.reports.filter((report,index,reports)=>reports.findIndex(item=>item.publisher===report.publisher)===index);
  const validTime=Number.isFinite(Date.parse(headline.publishedAt)) && Date.parse(headline.publishedAt)<=Date.parse(asOf)+5*60_000;
  return <article className="news-card">
    <NewsPhoto key={`${story.imageHref}:${asOf}`} src={story.imageHref}/>
    <div className="news-card-content">
      <p className="news-card-meta"><span>{headline.sourceName}</span>{validTime ? <time dateTime={headline.publishedAt}>{new Intl.DateTimeFormat(language,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(headline.publishedAt))}</time> : <span>{zh?'发布时间未知':'Date unknown'}</span>}</p>
      <h2><a href={headline.url} target="_blank" rel="noopener noreferrer">{headline.title}</a></h2>
      <p className="news-card-summary">{headline.summary || (zh?'订阅源未提供摘要，可查看原文了解详情。':'No excerpt was provided. Open the article for details.')}</p>
      <div className="news-card-evidence">
        {story.isHot ? <details><summary>{story.sourceCount>=2 ? (zh?`${story.sourceCount} 个来源关注`:`Covered by ${story.sourceCount} sources`) : (zh?'新闻头条收录':'In news headlines')}</summary><div>
          {related.map(report=><p key={report.id}><a href={report.url} target="_blank" rel="noopener noreferrer">{report.sourceName} · {report.title}</a></p>)}
          {story.index && <p><a href={story.index.url} target="_blank" rel="noopener noreferrer">{zh?'查看 Google 新闻头条依据':'View Google News headline reference'}</a></p>}
        </div></details> : <p>{zh?'最新报道':'Latest report'}</p>}
        {cost!==null&&<span className="news-card-price">{formatCreditCents(cost)}{zh?' 点/分析':' credits / analysis'}</span>}
      </div>
      <div className="news-card-actions"><Button variant="primary" disabled={disabled} aria-busy={active} aria-label={zh?`分析这篇：${headline.title}`:`Analyze article: ${headline.title}`} onClick={()=>onAnalyze(story)}>{active?(zh?'分析中…':'Analyzing…'):(zh?'分析这篇':'Analyze')}</Button><ButtonLink href={headline.url} target="_blank" rel="noopener noreferrer">{zh?'查看原文':'Original'}</ButtonLink></div>
    </div>
  </article>;
}
export default function HomeNewsFeed({ onSelect,busy,canAnalyze,cost }: { onSelect:(article:NewsArticle)=>Promise<void>|void; busy:boolean;canAnalyze:boolean;cost:number|null }) {
  const {language}=useUiLanguage(),zh=language.startsWith('zh');const {status}=useSession();
  const [data,setData]=useState<HomeNewsPayload|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [mode,setMode]=useState<'hot'|'latest'>('hot'),[source,setSource]=useState('all'),[limit,setLimit]=useState(6),[active,setActive]=useState('');
  const controller=useRef<AbortController|null>(null),version=useRef(0),choosing=useRef(false);
  const load=useCallback(async()=>{
    controller.current?.abort();const abort=new AbortController();controller.current=abort;const current=++version.current;
    setLoading(true);setError('');
    try{
      let response:Response|undefined;
      for(let attempt=0;attempt<10;attempt++){
        response=await fetch(`/api/news/home?locale=${encodeURIComponent(language)}`,{cache:'no-store',signal:abort.signal});
        if(response.status!==409)break;
        await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{abort.signal.removeEventListener('abort',onAbort);resolve()},2000);const onAbort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))};abort.signal.addEventListener('abort',onAbort,{once:true})});
      }
      const payload=await response!.json();if(!response!.ok)throw new Error('feed_unavailable');
      if(current!==version.current)return;
      setData(payload);setLimit(6);
      setMode(value=>payload.hotCount>0?value:'latest');
    }catch{if(!abort.signal.aborted&&current===version.current)setError(zh?'新闻暂时无法读取，请刷新或使用关键词搜索。':'News is unavailable. Refresh or search a topic.');}
    finally{if(current===version.current)setLoading(false);}
  },[language,zh]);
  useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},180000);return()=>{controller.current?.abort();clearInterval(timer)}},[load,status]);
  const base=mode==='hot'?(data?.stories||[]).filter(story=>story.isHot):(data?.stories||[]).flatMap(story=>story.reports.map(headline=>({...story,id:headline.id,headline,latestAt:headline.publishedAt,imageHref:headline.imageHref})));
  const stories=base.filter(story=>source==='all'||(mode==='latest'?story.headline.sourceId===source:story.reports.some(report=>report.sourceId===source))).map(story=>{
    const headline=mode==='hot'&&source!=='all'?story.reports.find(report=>report.sourceId===source):undefined;
    return headline?{...story,headline,imageHref:headline.imageHref}:story;
  });
  if(mode==='latest')stories.sort((a,b)=>(Date.parse(b.latestAt)||0)-(Date.parse(a.latestAt)||0));
  async function analyze(story:HomeNewsStory){if(choosing.current||busy)return;choosing.current=true;setActive(story.id);try{await onSelect({title:story.headline.title,url:story.headline.url,source:story.headline.sourceName,snippet:story.headline.summary||'',publishedAt:newsDate(story.headline.publishedAt),provider:'rss'})}finally{choosing.current=false;setActive('')}}
  return <section className="home-news" aria-label={zh?'RSS 新闻推荐':'RSS news recommendations'}>
    <div className="news-feed-toolbar">
      <div className="news-feed-tabs"><Button variant="tab" aria-pressed={mode==='hot'} onClick={()=>{setMode('hot');setLimit(6)}}>{zh?'热点':'Hot topics'}</Button><Button variant="tab" aria-pressed={mode==='latest'} onClick={()=>{setMode('latest');setLimit(6)}}>{zh?'最新':'Latest'}</Button></div>
      <Select aria-label={zh?'新闻源筛选':'News source'} className="news-source-filter" value={source} onChange={event=>{setSource(event.target.value);setLimit(6)}}><option value="all">{zh?'全部新闻源':'All sources'}</option>{data?.sources.map(item=><option key={item.id} value={item.id}>{zh?item.nameZh||item.name:item.name}</option>)}</Select>
      <Button variant="secondary" disabled={loading} aria-busy={loading} onClick={()=>void load()} aria-label={zh?'刷新新闻':'Refresh news'}><RefreshCw aria-hidden="true"/>{zh?'刷新':'Refresh'}</Button>
      <details className="news-ranking-help"><summary>{zh?'热点依据':'How topics are selected'}</summary><div><p>{zh?'热点取自近 48 小时的多源关注，或近 24 小时 Google 新闻头条收录，综合来源数量和更新时间排序。相同网站的不同订阅源不重复计数；这是报道关注度，不代表全网阅读量或事实已核实。':'Topics have coverage from multiple publishers within 48 hours or appear in Google News headlines within 24 hours. Ranking uses source diversity and recency, not site views or a verdict on truth. Feeds from the same publisher count once.'}</p><p>{cost!==null?(zh?`分析成功后按当前模型计费，每篇 ${formatCreditCents(cost)} 点。`:`Analysis costs ${formatCreditCents(cost)} credits after a report is saved.`):(zh?'浏览新闻免费，生成分析时确认当前模型费用。':'Browse for free. Analysis uses your current model rate.')}{zh?' 自定义 API 的调用费用由服务商收取。':' Custom API provider fees apply separately.'}</p></div></details>
    </div>
    <div className="news-feed-status">
      {data?.sourceErrors.length ? <p role="status">{zh?`${data.sources.length-data.sourceErrors.length}/${data.sources.length} 个订阅源已更新，其余暂不可用。`:`${data.sources.length-data.sourceErrors.length}/${data.sources.length} sources updated; others are temporarily unavailable.`}</p>:null}
      {data?.fetchedAt && <p>{data.stale?(zh?'显示上次成功同步的新闻':'Showing the last successful update'):(zh?'更新于':'Updated')} {new Intl.DateTimeFormat(language,{hour:'2-digit',minute:'2-digit'}).format(new Date(data.fetchedAt))}</p>}
    </div>
    {data&&!data.hotCount&&mode==='latest'&&<p role="status" className="news-feed-notice">{zh?'暂未发现有足够依据的热点，当前展示最新报道。':'No supported hot topics are available. Showing the latest reports.'}</p>}
    {error&&<div role="alert" className="news-feed-notice"><p>{error}</p><Button onClick={()=>void load()}>{zh?'重试':'Retry'}</Button></div>}
    {loading&&!data?<p role="status" className="news-feed-loading">{zh?'正在同步新闻与热点…':'Loading news and topic coverage…'}</p>:stories.length?<>
      <div className="news-card-grid">{stories.slice(0,limit).map(story=><NewsCard key={story.id} story={story} asOf={data?.fetchedAt||''} onAnalyze={story=>void analyze(story)} disabled={busy||!!active||status==='loading'||(status==='authenticated'&&!canAnalyze)} active={active===story.id} cost={cost}/>)}</div>
      {stories.length>limit&&<div className="news-feed-more"><Button onClick={()=>setLimit(limit+6)}>{zh?'查看更多报道':'More reports'}</Button></div>}
    </>:!loading&&!error?<p role="status" className="news-feed-notice">{zh?'当前筛选下暂无报道。可以切换“最新”、选择其他新闻源，或搜索关键词。':'No reports match these filters. Try Latest, another source, or a keyword search.'}</p>:null}
  </section>;
}
