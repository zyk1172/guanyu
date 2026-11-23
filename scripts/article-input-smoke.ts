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
import { readNewsArticle } from '../lib/article-extraction';
import { POST as createJob } from '../app/api/analyze/jobs/route';
import { ANALYZE_ADMISSION_ACTION } from '../lib/rate-limit';

async function main() {
  if ((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || (process.env.ALIYUN_ACCESS_KEY_ID && process.env.ALIYUN_ACCESS_KEY_SECRET && process.env.ALIYUN_DM_ACCOUNT_NAME)) throw new Error('Run article-input fixtures without an external mail transport.');
  const log=console.log;
  console.log=(...args: unknown[])=>{ if(args[0] !== '[dev-email]') log(...args); };
  const {report,originalContent}=getDemoReport('zh-CN');
  let outputReport=report;
  let calls=0;
  let assessment: unknown = {status:'usable',evidence:originalContent.slice(0,50)};
  const server=createServer(async (request,response)=>{
    let body=''; for await(const chunk of request) body+=chunk;
    JSON.parse(body); calls++;
    const result={...outputReport,inputAssessment:assessment};
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
    const validJob=await createAnalyzeJob(user.id,input);await runAnalyzeJob(validJob.id);
    const complete=await prisma.auditJob.findUniqueOrThrow({where:{id:validJob.id}});assert.equal(complete.status,'completed');assert.ok(complete.auditId);
    const completedCalls=calls;await runAnalyzeJob(validJob.id);assert.equal(calls,completedCalls);assert.equal(await balance(),9400);assert.equal(await audits(),2);
    outputReport=getDemoReport('en-US').report;
    const english=await handleAnalyze(user.id,{...input,reportLanguage:'en-US'});
    assert.equal(english.status,200,JSON.stringify(await english.json()));
    assert.equal(await balance(),9100);assert.equal(await audits(),3);
    assert.equal(await prisma.pointTransaction.count({where:{userId:user.id,transactionType:'NEWS_ANALYSIS'}}),3);
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
