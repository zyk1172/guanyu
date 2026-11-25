import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '../lib/prisma';
import { encryptSecret } from '../lib/secret';
import { getDemoReport } from '../lib/demo-report';
import { handleAnalyze } from '../lib/analyze-service';
import { createAnalyzeJob, runAnalyzeJob } from '../lib/analyze-job';
import { crawlRecentArticles, readCrawledArticle } from '../lib/article-crawl';
import { POST as completeArticle } from '../app/api/audits/[id]/completion/route';
import { readNewsArticle } from '../lib/article-extraction';
import { POST as createJob } from '../app/api/analyze/jobs/route';
import { POST as parseUrl } from '../app/api/parse-url/route';
import { privacyHmacHash } from '../lib/privacy-hash';
import { ANALYZE_ADMISSION_ACTION } from '../lib/rate-limit';

async function main() {
  if ((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || (process.env.ALIYUN_ACCESS_KEY_ID && process.env.ALIYUN_ACCESS_KEY_SECRET && process.env.ALIYUN_DM_ACCOUNT_NAME)) throw new Error('Run article-input fixtures without an external mail transport.');
  const log=console.log;
  console.log=(...args: unknown[])=>{ if(args[0] !== '[dev-email]') log(...args); };
  const {report,originalContent}=getDemoReport('zh-CN');
  let outputReport=report;
  let calls=0;
  let rejectTools=false;
  let rejectCredentials=false;
  let rewrite: unknown;
  let assessment: unknown = {status:'usable',evidence:originalContent.slice(0,50)};
  const server=createServer(async (request,response)=>{
    let body=''; for await(const chunk of request) body+=chunk;
    const requestBody = JSON.parse(body); calls++;
    if (rejectCredentials || (rejectTools && requestBody.tools?.length)) {
      response.writeHead(rejectCredentials ? 401 : 400, {'content-type':'application/json'});
      response.end(JSON.stringify({ error: { message: 'Fixture rejects this request' } }));
      return;
    }
    const result=rewrite ?? {...outputReport,inputAssessment:assessment};
    response.writeHead(200,{'content-type':'application/json'});
    response.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:50,completion_tokens:50}}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const previous={OPENAI_BASE_URL:process.env.OPENAI_BASE_URL,ALLOW_PRIVATE_ADMIN_LLM:process.env.ALLOW_PRIVATE_ADMIN_LLM};
  process.env.OPENAI_BASE_URL=baseUrl;process.env.ALLOW_PRIVATE_ADMIN_LLM='true';
  const suffix=crypto.randomUUID();
  const model=await prisma.platformModelConfig.create({data:{configKey:`article-input-${suffix}`,displayName:'Local fictional article-input fixture',baseUrl,modelId:'fixture',apiKeyEncrypted:encryptSecret('local-only'),searchMode:'none'}});
  const user=await prisma.user.create({data:{email:`article-input-${suffix}@example.test`,password:'!passwordless',creditBalance:100,creditBalanceCents:10000,creditBalanceAmount:100,settings:{create:{defaultPlatformModelConfigId:model.id,modelSource:'platform',defaultIsPublic:false}}}});
  const input={title:'虚构教学新闻：图书馆延长开放时间',source:'本地虚构测试，不是真实新闻',content:originalContent,sourceUrl:'https://example.com/library',reportLanguage:'zh-CN' as const};
  const balance=async()=>(await prisma.user.findUniqueOrThrow({where:{id:user.id}})).creditBalanceCents;
  const audits=()=>prisma.audit.count({where:{userId:user.id}});
  try {
    const errorInput={...input,content:'Access Denied\n'+'We could not display the requested page. '.repeat(20)};
    const before=calls;
    assert.equal((await handleAnalyze(user.id,errorInput)).status,422);
    await assert.rejects(createAnalyzeJob(user.id,errorInput));
    assert.equal(calls,before);assert.equal(await audits(),0);assert.equal(await balance(),10000);
    assert.equal(await prisma.auditJob.count({where:{userId:user.id}}),0);
    await assert.rejects(readNewsArticle(`${baseUrl}/private`));
    assert.equal(calls,before,'article extraction must not inherit the local model endpoint exception');

    const parseIp = `2001:db8::${suffix.split('-')[0].slice(0, 4)}`;
    const parseRequest = () => new NextRequest('http://localhost/api/parse-url', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'x-forwarded-for': parseIp, 'content-type': 'application/json' },
      body: '{}',
    });
    const previousProxyTrust = process.env.TRUST_PROXY_HEADERS;
    try {
      process.env.TRUST_PROXY_HEADERS = 'true';
      for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await parseUrl(parseRequest())).status, 400);
      const limited = await parseUrl(parseRequest());
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).code, 'RATE_LIMITED');
    } finally {
      if (previousProxyTrust === undefined) delete process.env.TRUST_PROXY_HEADERS;
      else process.env.TRUST_PROXY_HEADERS = previousProxyTrust;
      await prisma.verificationCode.deleteMany({ where: { purpose: 'parse_url_attempt', email: `parse-url:${privacyHmacHash(parseIp)}` } });
    }

    const token=await encode({secret:process.env.NEXTAUTH_SECRET!,token:{id:user.id,sessionVersion:1}});
    const request=(authenticated:boolean,origin='http://localhost')=>new NextRequest('http://localhost/api/analyze/jobs',{method:'POST',headers:{origin,'content-type':'application/json',...(authenticated?{cookie:`next-auth.session-token=${token}`}:{})},body:JSON.stringify(errorInput)});
    assert.equal((await createJob(request(false))).status,401);
    assert.equal((await createJob(request(true,'https://foreign.example'))).status,403);
    const invalidJob=await createJob(request(true));assert.equal(invalidJob.status,422);assert.equal((await invalidJob.json()).code,'ARTICLE_ACCESS_BLOCKED');

    for (const [status,code] of [['unavailable','ARTICLE_BODY_MISSING'],['not_news','NOT_NEWS_ARTICLE'],['title_mismatch','ARTICLE_TITLE_MISMATCH']]) {
      assessment={status,evidence:''};
      const response=await handleAnalyze(user.id,input),data=await response.json();
      assert.equal(response.status,422,JSON.stringify(data));assert.equal(data.code,code);assert.ok(!data.auditId && !data.result);
      assert.equal(await audits(),0);assert.equal(await balance(),10000);
    }
    for(const invalid of [undefined,{status:'usable',evidence:'不存在于正文中的虚构事实引文，这不是一份有效证据。'}]) {
      assessment=invalid;
      const response=await handleAnalyze(user.id,input);assert.equal(response.status,502);assert.equal((await response.json()).code,'ARTICLE_ASSESSMENT_FAILED');
      assert.equal(await audits(),0);assert.equal(await balance(),10000);
    }
    assessment={status:'title_mismatch',evidence:''};
    const job=await createAnalyzeJob(user.id,input);
    await runAnalyzeJob(job.id);
    const failed=await prisma.auditJob.findUniqueOrThrow({where:{id:job.id}});
    assert.equal(failed.status,'failed');assert.equal(failed.attemptCount,1);assert.equal(failed.auditId,null);assert.equal(failed.nextAttemptAt,null);
    assert.ok(failed.error?.includes('所选新闻明显不符'));
    const failedCalls=calls;await runAnalyzeJob(job.id);assert.equal(calls,failedCalls,'permanent article failure must not be retried');
    assert.equal(await audits(),0);assert.equal(await balance(),10000);
    assert.equal(await prisma.rateLimitEvent.count({where:{userId:user.id,action:ANALYZE_ADMISSION_ACTION}}),0);

    assessment={status:'usable',evidence:originalContent.slice(0,50)};
    const success=await handleAnalyze(user.id,input),data=await success.json();
    assert.equal(success.status,200,JSON.stringify(data));assert.ok(data.auditId && data.result);assert.equal(await audits(),1);assert.equal(await balance(),9700);
    await prisma.platformModelConfig.update({ where: { id: model.id }, data: { searchMode: 'agent' } });
    rejectTools = true;
    const beforeFallback = calls;
    const validJob=await createAnalyzeJob(user.id,input);await runAnalyzeJob(validJob.id);
    assert.equal(calls - beforeFallback, 2, 'tool rejection falls back to a plain report in the same job');
    await prisma.platformModelConfig.update({ where: { id: model.id }, data: { searchMode: 'none' } });
    const complete=await prisma.auditJob.findUniqueOrThrow({where:{id:validJob.id}});assert.equal(complete.status,'completed');assert.ok(complete.auditId);
    const completedCalls=calls;await runAnalyzeJob(validJob.id);assert.equal(calls,completedCalls);assert.equal(await balance(),9400);assert.equal(await audits(),2);
    rejectCredentials = true;
    const unauthorized = await createAnalyzeJob(user.id,input);
    await runAnalyzeJob(unauthorized.id);
    const unauthorizedJob = await prisma.auditJob.findUniqueOrThrow({ where: { id: unauthorized.id } });
    assert.equal(unauthorizedJob.status, 'failed');
    assert.equal(unauthorizedJob.attemptCount, 1);
    assert.match(unauthorizedJob.error || '', /API Key/);
    assert.equal(await balance(), 9400);
    rejectCredentials = false;
    outputReport=getDemoReport('en-US').report;
    const english=await handleAnalyze(user.id,{...input,reportLanguage:'en-US'});
    assert.equal(english.status,200,JSON.stringify(await english.json()));
    assert.equal(await balance(),9100);assert.equal(await audits(),3);
    assert.equal(await prisma.pointTransaction.count({where:{userId:user.id,transactionType:'NEWS_ANALYSIS'}}),3);
    const rewriteRequest = (requestId: string) => new NextRequest('http://localhost/api/audits/' + data.auditId + '/completion', {
      method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', cookie: `next-auth.session-token=${token}` },
      body: JSON.stringify({ requestId }),
    });
    const ctx = { params: Promise.resolve({ id: data.auditId as string }) };
    const title = '市图书馆将试行延长周末开放时间';
    const paragraphs = ['市图书馆宣布从下周起试行延长周末开放时间。馆方表示，将记录新增时段的到访人数，并在试点结束后公布评估。', '市图书馆尚未公布人手安排和额外费用。按照馆方目前公开的安排，试点期间原有服务和借阅规则继续执行。'];
    rewrite = { title, paragraphs: [...paragraphs, '## 审视评分细则'] };
    assert.equal((await completeArticle(rewriteRequest(crypto.randomUUID()), ctx)).status, 502);
    assert.equal(await balance(), 9100);
    rewrite = { title, paragraphs };
    const result = await completeArticle(rewriteRequest(crypto.randomUUID()), ctx);
    assert.equal(result.status, 200);
    const published = ['# ' + title, ...paragraphs].join('\n\n');
    assert.equal((await result.json()).markdown, published);
    assert.equal((await prisma.audit.findUniqueOrThrow({ where: { id: data.auditId } })).completionMarkdown, published);

    const originalHosts = process.env.GUANYU_ARTICLE_CRAWL_HOSTS;
    const host = `news-${suffix}.example`;
    const crawlAddress = `https://${host}/public-library`;
    const slot = `article-crawl:slot:${Math.floor(Date.now() / 3600000)}`;
    const cache = `article-crawl:${privacyHmacHash(crawlAddress)}`;
    const date = new Date().toISOString();
    const image = `https://${host}/library.jpg`;
    let articles = 0;
    try {
      process.env.GUANYU_ARTICLE_CRAWL_HOSTS = host;
      await crawlRecentArticles([
        { id: 'fixture-blocked', url: `https://${host}/members-only`, title, publishedAt: date, publisher: host, sourceId: 'fixture', sourceName: 'Fixture', feedRank: 0 },
        { id: 'fixture-open', url: crawlAddress, title, publishedAt: date, publisher: host, sourceId: 'fixture', sourceName: 'Fixture', feedRank: 1 },
      ], {
        request: async (target) => {
          assert.equal(String(target), `https://${host}/robots.txt`);
          return { status: 200, headers: new Headers(), body: Buffer.from('User-agent: *\nDisallow: /members-only') };
        },
        read: async (target, options) => {
          articles++;
          assert.equal(target, crawlAddress);
          assert.equal(options?.permits(new URL(target)), true);
          return { title, source: 'Fixture', content: paragraphs.join('\n'), imageUrl: image, url: target,
            date: '', publishedAt: date, publishedAtSource: '', publishedAtConfidence: '' };
        },
      });
      assert.equal(articles, 1);
      assert.equal((await readCrawledArticle(crawlAddress))?.imageUrl, image);
      await prisma.newsSearchCache.update({ where: { cacheKey: cache }, data: { expiresAt: new Date(0) } });
      assert.equal(await readCrawledArticle(crawlAddress), null);
    } finally {
      if (originalHosts === undefined) delete process.env.GUANYU_ARTICLE_CRAWL_HOSTS;
      else process.env.GUANYU_ARTICLE_CRAWL_HOSTS = originalHosts;
      await prisma.newsSearchCache.deleteMany({ where: { cacheKey: { in: [cache, slot] } } });
    }
    console.log('Article input smoke passed: auth/CSRF/SSRF, invalid text rejected before job/model usage, unavailable/non-news/mismatched/missing or invented assessments never save or charge, terminal job failure, and valid direct/job analysis with single billing.');
  } finally {
    await prisma.modelUsageEvent.deleteMany({where:{userId:user.id}});
    await prisma.user.delete({where:{id:user.id}});
    await prisma.platformModelConfig.delete({where:{id:model.id}});
    for(const [key,value] of Object.entries(previous)) if(value===undefined) delete process.env[key];else process.env[key]=value;
    console.log=log;
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
