import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {NextRequest} from 'next/server';
import {encode} from 'next-auth/jwt';
import {prisma} from '../lib/prisma';
import {RSS_SOURCE_CATALOG} from '../lib/rss-core.mjs';
import {getRssContext} from '../lib/rss-service';
import {FeedRefreshingError,homeNewsCacheKey,homeNewsPayload,readHomeSnapshot,refreshHomeSnapshot,type Snapshot} from '../lib/home-news-service';
import {GET as home} from '../app/api/news/home/route';
import {GET as image} from '../app/api/news/image/route';

async function main(){
 const users:string[]=[],keys:string[]=[],suffix=crypto.randomUUID();
 const originalDw=RSS_SOURCE_CATALOG.find(source=>source.id==='dw-news')!.feedUrl;
 try{
  for(const name of ['one','two']){
   const user=await prisma.user.create({data:{email:`home-news-${name}-${suffix}@example.test`,password:'!passwordless',proAccessExpiresAt:new Date(Date.now()+86400000),creditBalanceCents:10000,settings:{create:{rssFeedUrlsJson:JSON.stringify({catalogIds:['dw-news'],customFeeds:[{name:`Fixture ${name} ${suffix}`,url:'https://news.example/feed.xml'}]})}}}});users.push(user.id);
  }
  async function request(id?:string,locale='zh-CN'){
   return new NextRequest('http://localhost/api/news/home?locale='+locale,{headers:id?{cookie:'next-auth.session-token='+await encode({secret:process.env.NEXTAUTH_SECRET!,token:{id,sessionVersion:1}})}:{}});
  }
  const contexts=await Promise.all(users.map(async id=>getRssContext(await request(id))));
  assert.equal(RSS_SOURCE_CATALOG.find(source=>source.id==='dw-news')!.feedUrl,originalDw,'localization must not mutate the global source catalog');
  assert.ok(contexts[0].sources.find(source=>source.id==='dw-news')?.feedUrl.includes('rss-chi-all'));
  const english=await getRssContext(await request(users[0],'en-US'));assert.equal(english.sources.find(source=>source.id==='dw-news')?.feedUrl,originalDw);
  for(const context of contexts)keys.push(homeNewsCacheKey(context.sources,'zh-CN'));
  assert.notEqual(keys[0],keys[1],'same custom feed URL with different private source names must not share response snapshots');
  const anonymous=await getRssContext(await request());assert.ok(!keys.includes(homeNewsCacheKey(anonymous.sources,'zh-CN')));
  const now=Date.now();
  for(let index=0;index<contexts.length;index++){
   const context=contexts[index],source=context.sources.find(source=>source.id!=='dw-news')!;
   const snapshot:Snapshot={headlines:[{id:'fixture-'+index,title:`【虚构测试】${index}号图书馆试行延长开放时间`,sourceId:source.id,sourceName:source.name,url:`https://news.example/article-${index}`,publishedAt:new Date(now-3600000).toISOString(),summary:'仅供本地接口验证的虚构新闻摘要。',publisher:'news.example',feedRank:0}],index:[],indexAvailable:false,sourceErrors:[],fetchedAt:new Date().toISOString()};
   await prisma.newsSearchCache.create({data:{cacheKey:keys[index],status:'COMPLETED',leaseUntil:new Date(0),expiresAt:new Date(now+120000),resultJson:JSON.stringify(snapshot)}});
   const response=await home(await request(users[index])),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.stories.length,1);assert.equal(data.stories[0].headline.sourceName,source.name);assert.ok(!JSON.stringify(data).includes(contexts[1-index].sources.find(item=>item.id!=='dw-news')!.name));
   assert.equal(data.hotCount,0);assert.equal(data.stories[0].isHot,false);assert.ok(data.stories[0].imageHref.startsWith('/api/news/image?ticket='));
   assert.equal((await prisma.user.findUniqueOrThrow({where:{id:users[index]}})).creditBalanceCents,10000);
   assert.equal(await prisma.modelUsageEvent.count({where:{userId:users[index]}}),0);
  }
  const row=await prisma.newsSearchCache.findUniqueOrThrow({where:{cacheKey:keys[0]}}),snapshot=JSON.parse(row.resultJson!) as Snapshot;
  assert.equal((await readHomeSnapshot(keys[0]))?.stale,false);
  await prisma.newsSearchCache.update({where:{id:row.id},data:{resultJson:JSON.stringify({...snapshot,fetchedAt:new Date(now-3*60000).toISOString()}),expiresAt:new Date(now+3600000)}});assert.equal((await readHomeSnapshot(keys[0]))?.stale,true,'two-minute freshness must not depend on the longer cleanup retention');
  await prisma.newsSearchCache.update({where:{id:row.id},data:{expiresAt:new Date(0)}});assert.equal((await readHomeSnapshot(keys[0]))?.stale,true);
  await prisma.newsSearchCache.update({where:{id:row.id},data:{resultJson:JSON.stringify({...snapshot,fetchedAt:new Date(now-61*60000).toISOString()})}});assert.equal(await readHomeSnapshot(keys[0]),null,'retry lease updates cannot make an hour-old snapshot fresh');
  const future={...snapshot,headlines:snapshot.headlines.map(item=>({...item,publishedAt:new Date(now+86400000).toISOString()}))};
  assert.equal(homeNewsPayload(future,contexts[0].sources,'zh-CN').stories[0].headline.publishedAt,'');
  assert.equal((await image(new Request('http://localhost/api/news/image?ticket=bad'))).status,400);
  // A slow worker must not overwrite a newer lease owner or discard a good
  // snapshot while other readers are waiting for the refresh.
  const leaseKey=homeNewsCacheKey(contexts[0].sources,`lease-${suffix}`);keys.push(leaseKey);
  await prisma.newsSearchCache.create({data:{cacheKey:leaseKey,status:'COMPLETED',leaseUntil:new Date(0),expiresAt:new Date(now+3600000),resultJson:JSON.stringify({...snapshot,fetchedAt:new Date(now-3*60000).toISOString()})}});
  let release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve}),began=new Promise<void>(resolve=>{started=resolve});
  const first=refreshHomeSnapshot(leaseKey,contexts[0].sources,'zh-CN',async()=>{started();await gate;return snapshot});
  await began;
  try{
   await assert.rejects(refreshHomeSnapshot(leaseKey,contexts[0].sources,'zh-CN',async()=>snapshot),FeedRefreshingError);
   assert.equal((await readHomeSnapshot(leaseKey))?.stale,true);
   await prisma.newsSearchCache.update({where:{cacheKey:leaseKey},data:{leaseUntil:new Date(0)}});
   const newer={...snapshot,headlines:snapshot.headlines.map(item=>({...item,title:'【虚构测试】新租约同步结果'}))};
   await refreshHomeSnapshot(leaseKey,contexts[0].sources,'zh-CN',async()=>newer);
  }finally{release();await first}
  const saved=await prisma.newsSearchCache.findUniqueOrThrow({where:{cacheKey:leaseKey}});
  assert.equal(JSON.parse(saved.resultJson!).headlines[0].title,'【虚构测试】新租约同步结果');
  assert.ok(saved.expiresAt.getTime()>Date.now()+59*60000,'cleanup retains snapshots through the one-hour fallback window');
  assert.equal(await prisma.audit.count({where:{userId:{in:users}}}),0);assert.equal(await prisma.pointTransaction.count({where:{userId:{in:users}}}),0);
  console.log('Home news smoke passed: personal-source isolation, anonymous scope, locale-safe catalog, two-minute freshness/one-hour retention, concurrent refresh and superseded lease protection, future dates, signed image boundary and no model/report/credit side effects.');
 }finally{await prisma.newsSearchCache.deleteMany({where:{cacheKey:{in:keys}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
