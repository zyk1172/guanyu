import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { parseRssXml } from '../lib/rss-core.mjs';
import { newsImageUrl } from '../lib/news-image-core.mjs';
import { parseHeadlineIndex, publisherKey, rankHomeNews } from '../lib/home-news-core';
import { coverFromHtml, fetchNewsThumbnail, newsImageHref, readImageTicket } from '../lib/news-media';
import { loadHomeSnapshot } from '../lib/home-news-service';
import type { HomeHeadline } from '../lib/home-news-types';
const now=Date.parse('2026-11-05T08:00:00Z');
const source={id:'fixture',name:'虚构新闻源',feedUrl:'https://news.example/feed.xml'};
function item(title:string,publisher='one.example',age=1,extra:Partial<HomeHeadline>={}):HomeHeadline {
 return {id:publisher+':'+title,sourceId:publisher,sourceName:publisher,url:'https://'+publisher+'/news/'+encodeURIComponent(title),title,publishedAt:new Date(now-age*3600000).toISOString(),publisher,feedRank:0,...extra};
}

test('RSS supplies bounded plain-text excerpts, real media variants and encoded-content photos, excluding tracking pixels',()=>{
 const headline=parseRssXml(`<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>Library &amp; readers</title><link>https://news.example/story?section=world&amp;article=1</link><description><![CDATA[<p>${'虚构新闻摘要。'.repeat(100)}</p><script>malicious()</script>]]></description><media:content url="https://images.example/preview.jpg?width=700&amp;token=signature" width="700" medium="image"/><media:thumbnail url="https://images.example/small.jpg" width="140"/><content:encoded><![CDATA[<img src="https://images.example/tracking-pixel.png" width="1" height="1"/>]]></content:encoded></item></channel></rss>`,source)[0];
 assert.equal(headline.title,'Library & readers');assert.equal(headline.summary?.length,360);assert.ok(!headline.summary?.includes('malicious'));assert.ok(!headline.summary?.includes('<p>'));
 assert.equal(headline.imageUrl,'https://images.example/preview.jpg?width=700&token=signature');
 assert.equal(headline.url,'https://news.example/story?section=world&article=1');
 const html=parseRssXml('<rss><channel><item><title>Fixture</title><link>https://news.example/story</link><description>A short excerpt.</description><content:encoded>&lt;div&gt;&lt;img src="https://images.example/photo.webp"/&gt;&lt;img src="https://images.example/rss-pixel.png" width="1"/&gt;&lt;/div&gt;</content:encoded></item></channel></rss>',source)[0];
 assert.equal(html.imageUrl,'https://images.example/photo.webp');assert.equal(html.summary,'A short excerpt.');
});
test('news candidates reject private, credential-bearing, non-web, logo and tracking image URLs',()=>{
 for(const value of ['file:///x','javascript:alert(1)','data:image/png;base64,AAAA','http://127.0.0.1/a.jpg','http://2130706433/a.jpg','http://[::1]/a.jpg','http://user:pass@images.example/a.jpg','http://10.0.0.1/a.jpg','http://172.20.0.1/a.jpg','http://100.64.0.1/a.jpg','https://images.example/logo.png','https://images.example/rss-pixel.png','https://images.example/a.svg'])assert.equal(newsImageUrl(value),'',value);
 assert.equal(newsImageUrl('/photo.jpg','https://news.example/article'),'https://news.example/photo.jpg');
});
test('recent coverage from distinct publishers qualifies as hot; aliases, duplicates and one person alone do not inflate it',()=>{
 const a=item('城市图书馆延长开放时间 三个月试点开始'),b=item('城市图书馆延长开放时间 三个月试点启动','two.example');
 const ranked=rankHomeNews([a,b,{...a,id:'copy',url:a.url+'?utm_source=feed'}],[],{now});
 assert.equal(ranked.length,1);assert.equal(ranked[0].sourceCount,2);assert.equal(ranked[0].isHot,true);assert.equal(ranked[0].reports.length,2);
 assert.equal(rankHomeNews([a,{...b,publisher:a.publisher}],[],{now})[0].isHot,false);
 assert.equal(publisherKey('https://feeds.bbci.co.uk/news'),publisherKey('https://www.bbc.com'));
 const unrelated=rankHomeNews([item('特朗普出席新的科技公司产品发布会'),item('特朗普与外国领导人讨论边境军事问题','two.example')],[],{now});assert.equal(unrelated.filter(s=>s.isHot).length,0);
});
test('old, future and undated items never receive hot status or recency boosts',()=>{
 for(const extra of [{publishedAt:new Date(now-50*3600000).toISOString()},{publishedAt:new Date(now+2*3600000).toISOString()},{publishedAt:''}]) {
  const stories=rankHomeNews([item('图书馆公布开放时间试点评估结果','one.example',1,extra),item('图书馆公布开放时间试点评估结果','two.example',1,extra)],[],{now});assert.ok(stories.every(s=>!s.isHot));
 }
 assert.equal(rankHomeNews([item('十天之前的旧闻','one.example',240)],[],{now}).length,0);
});
test('current headline-index evidence can qualify a story, while stale index entries and unrelated titles cannot',()=>{
 const article=item('城市图书馆延长开放时间 三个月试点开始');
 const entry={title:article.title+' - 虚构媒体',url:'https://news.google.com/rss/articles/fixture',publishedAt:new Date(now-3600000).toISOString(),rank:0};
 const valid=rankHomeNews([article],[entry],{now})[0];assert.equal(valid.isHot,true);assert.equal(valid.sourceCount,1);assert.deepEqual(valid.index,entry);
 assert.equal(rankHomeNews([article],[{...entry,publishedAt:new Date(now-30*3600000).toISOString()}],{now})[0].isHot,false);
 assert.equal(rankHomeNews([article],[{...entry,title:'其他地区讨论地震应急方案'}],{now})[0].isHot,false);
 const index=parseHeadlineIndex(`<rss><channel><item><title>${article.title}</title><link>${entry.url}</link><pubDate>Thu, 05 Nov 2026 07:00:00 GMT</pubDate></item></channel></rss>`);assert.equal(index.length,1);
});
test('specific multilingual events cluster conservatively and Chinese representatives do not borrow another article photo',()=>{
 const en=item('Democrats win the US midterm elections','one.example');
 const zh=item('美国中期选举结果出炉 民主党夺回两院','two.example');
 const stories=rankHomeNews([{...en,imageUrl:'https://images.example/en.jpg'},zh],[],{now,language:'zh-CN'});
 assert.equal(stories.length,1);assert.equal(stories[0].sourceCount,2);assert.equal(stories[0].headline.title,zh.title);assert.equal(stories[0].headline.imageUrl,undefined);
});
test('source loading tolerates the unavailable headline index and never invents news when every feed is empty',async()=>{
 const sources=[{...source,nameZh:'虚构来源',region:'custom',country:'',websiteUrl:'https://news.example',rssAvailability:'user_configured',termsNote:''}];
 const snapshot=await loadHomeSnapshot(sources,'zh-CN',{feeds:async()=>({headlines:[item('虚构报道','news.example',1,{sourceId:'fixture'})],sourceErrors:[],fetchedAt:new Date(now).toISOString()}),index:async()=>{throw new Error('unavailable')}});
 assert.equal(snapshot.indexAvailable,false);assert.equal(snapshot.headlines.length,1);
 await assert.rejects(loadHomeSnapshot(sources,'zh-CN',{feeds:async()=>({headlines:[],sourceErrors:[],fetchedAt:new Date(now).toISOString()}),index:async()=>'<rss/>'}));
});
test('different feed proxies cannot inflate the number of actual article publishers',async()=>{
 const sources=['proxy-one','proxy-two'].map(id=>({...source,id,nameZh:'虚构代理来源',region:'custom',country:'',websiteUrl:`https://${id}.example`,rssAvailability:'user_configured',termsNote:''}));
 const snapshot=await loadHomeSnapshot(sources,'zh-CN',{feeds:async()=>({headlines:sources.map((source,index)=>item('城市图书馆延长开放时间 三个月试点开始','unused.example',1,{sourceId:source.id,url:`https://${index?'www.bbc.com':'www.bbc.co.uk'}/news/library-${index}`})),sourceErrors:[],fetchedAt:new Date(now).toISOString()}),index:async()=>'<rss/>'});
 assert.deepEqual(snapshot.headlines.map(item=>item.publisher),['bbc','bbc']);
 const stories=rankHomeNews(snapshot.headlines,[],{now});assert.equal(stories[0].sourceCount,1);assert.equal(stories[0].isHot,false);
});
test('signed thumbnail tickets expire, reject tampering, and do not allow a caller-chosen open proxy',()=>{
 const previous=process.env.HASH_PEPPER;process.env.HASH_PEPPER='home-news-test-only';
 try{
  const href=newsImageHref('https://news.example/article','https://images.example/photo.jpg',now)!;
  const ticket=new URL(href,'https://local.example').searchParams.get('ticket')!;
  const data=readImageTicket(ticket,now);assert.equal(data.article,'https://news.example/article');
  assert.throws(()=>readImageTicket(ticket+'x',now));assert.throws(()=>readImageTicket(ticket,data.expires));
  assert.equal(newsImageHref('http://127.0.0.1/article','',now),undefined);
 }finally{if(previous===undefined)delete process.env.HASH_PEPPER;else process.env.HASH_PEPPER=previous}
});
test('image loading validates raster type, limits redirects and preserves same-article cover fallback',async()=>{
 const image=await sharp({create:{width:800,height:500,channels:3,background:'#445566'}}).jpeg().toBuffer();
 const ticket={article:'https://news.example/article',image:'https://images.example/old.jpg',expires:now+60000};
 const visits:string[]=[];
 const request=async(url:string|URL,options:any)=>{
  visits.push(String(url));assert.equal(options.allowPrivateAddress,undefined);assert.ok(options.maxBytes<=2500000);
  if(String(url)===ticket.image)return{status:404,headers:new Headers(),body:Buffer.alloc(0)};
  if(String(url)===ticket.article)return{status:200,headers:new Headers({'content-type':'text/html'}),body:Buffer.from('<meta property="og:image" content="https://images.example/real.jpg">')};
  return{status:200,headers:new Headers({'content-type':'image/jpeg'}),body:image};
 };
 const result=await fetchNewsThumbnail(ticket,{request});assert.equal((await sharp(result).metadata()).format,'webp');assert.deepEqual(visits,[ticket.image,ticket.article,'https://images.example/real.jpg']);
 await assert.rejects(fetchNewsThumbnail(ticket,{request:async()=>({status:302,headers:new Headers({location:'http://127.0.0.1/private'}),body:Buffer.alloc(0)})}));
 await assert.rejects(fetchNewsThumbnail({...ticket,image:''},{request:async()=>({status:200,headers:new Headers({'content-type':'text/html'}),body:Buffer.from('<meta property="og:image" content="http://127.0.0.1/a.jpg">')})}));
 await assert.rejects(fetchNewsThumbnail(ticket,{request:async()=>({status:200,headers:new Headers({'content-type':'image/png'}),body:Buffer.from('<svg><script>alert(1)</script></svg>')})}));
 assert.deepEqual(coverFromHtml('<meta property="og:image" content="/photo.jpg"><meta name="twitter:image" content="/logo.png">','https://news.example/article'),['https://news.example/photo.jpg']);
});
