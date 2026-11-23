import assert from 'node:assert/strict';
import test from 'node:test';
import { ArticleInputError, assertArticleText, assertModelArticleAssessment } from '../lib/article-input';
import { parseArticleHtml } from '../lib/article-extraction';
import { buildPrompt, buildCompactFallbackPrompt } from '../lib/prompts';
import { hasUnexpectedReportProse, buildReportLanguageJsonRepairPrompt } from '../lib/report-language-core.mjs';

const body = '【虚构测试新闻】市图书馆宣布下周起试行延长开放时间，新增开放时段为周五晚间。馆方表示，试点持续三个月，将收集读者反馈，并在试点结束后公布评估。现有材料未提供具体经费与人员安排，不能据此判断实际效果。';
const url = 'https://example.com/library';
const page = (content: string, title = '图书馆试行延长开放时间', extra = '') => `<html><head><title>${title}</title>${extra}</head><body>${content}</body></html>`;
const fails = (fn: () => unknown, code: string) => assert.throws(fn, (error: unknown) => error instanceof ArticleInputError && error.code === code);

test('visible Chinese and English news remains readable, with metadata and without navigation', () => {
  const html = page(`<nav>${'首页 导航'.repeat(30)}</nav><article><h1>图书馆试行延长开放时间</h1><p>${body}</p></article><aside>${'相关推荐'.repeat(60)}</aside>`, '图书馆试行延长开放时间 | Local News', '<meta property="article:published_time" content="2026-11-05T08:00:00Z"><meta property="og:site_name" content="本地虚构来源">');
  const result = parseArticleHtml(html, url);
  assert.ok(result.content.includes(body));
  assert.ok(!result.content.includes('相关推荐'));
  assert.ok(!result.content.includes('首页 导航'));
  assert.equal(result.source, '本地虚构来源');
  assert.equal(result.publishedAt, '2026-11-05');
  const english = 'The city library announced a three-month trial of extended opening hours on Friday evenings. Officials said reader feedback would be collected before the trial is evaluated. Staffing and budget details have not been disclosed.';
  assert.ok(parseArticleHtml(page(`<article><p>${english}</p></article>`, 'Library announces extended hours'), url).content.includes(english));
});

test('HTTP-200 error, challenge, sign-in and subscription pages cannot pass merely by being long', () => {
  for (const title of ['404 Not Found', '503 Service Unavailable', 'Access Denied | Local Site', 'Just a moment...', 'Attention Required!']) {
    fails(() => parseArticleHtml(page(`<main><p>${'We are unable to display the page. Please try again later. '.repeat(8)}</p></main>`, title), url), 'ARTICLE_ACCESS_BLOCKED');
  }
  fails(() => parseArticleHtml(page(`<form id="captcha-form"></form><main><p>${body}</p></main>`), url), 'ARTICLE_ACCESS_BLOCKED');
  for (const text of ['Please sign in to continue reading this article. ', 'Subscribe to read the full article. ', '请登录后继续阅读这篇报道。']) {
    fails(() => parseArticleHtml(page(`<main><p>${text.repeat(20)}</p></main>`), url), 'ARTICLE_ACCESS_BLOCKED');
  }
});

test('hidden or structured-only bodies, placeholders, lists and punctuation do not become news', () => {
  const structured = `<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',headline:'图书馆试行延长开放时间',articleBody:body.repeat(8)})}</script>`;
  fails(() => parseArticleHtml(page('<main><p>请订阅后继续阅读。</p></main>', undefined, structured), url), 'ARTICLE_BODY_MISSING');
  fails(() => parseArticleHtml(page(`<article hidden>${body.repeat(8)}</article><main>Loading...</main>`), url), 'ARTICLE_BODY_MISSING');
  fails(() => parseArticleHtml(page(`<article aria-hidden="true">${body.repeat(8)}</article><main>Loading...</main>`), url), 'ARTICLE_BODY_MISSING');
  fails(() => parseArticleHtml(page(`<article><p>${body}</p></article><div class="paywall">Subscribe to read the full article</div>`, undefined, structured), url), 'ARTICLE_ACCESS_BLOCKED');
  fails(() => parseArticleHtml(page(`<main>${Array.from({length:10},(_,i)=>`<a href="/news/${i}">本地新闻标题${i}，点击查看具体报道</a>`).join('')}</main>`), url), 'NOT_NEWS_ARTICLE');
  fails(() => assertArticleText('。'.repeat(100)), 'ARTICLE_BODY_MISSING');
  fails(() => assertArticleText(null), 'ARTICLE_BODY_MISSING');
});

test('source evidence is not translated when the report language differs from the article', () => {
  const assessment={status:'usable',evidence:body.slice(0,45)};
  assert.equal(hasUnexpectedReportProse({newsSummary:'A library trial was announced.',inputAssessment:assessment},'en-US'),false);
  assert.equal(hasUnexpectedReportProse({newsSummary:body,inputAssessment:assessment},'en-US'),true);
  assert.equal(hasUnexpectedReportProse({materialType:'原始文件'},'en-US'),false);
  assert.ok(buildReportLanguageJsonRepairPrompt({inputAssessment:assessment},'en-US').includes('inputAssessment object verbatim'));
});

test('legitimate reporting about errors, logins, subscribers or the Forbidden City is allowed', () => {
  for (const title of ['Forbidden City announces a new exhibition', '网站登录故障影响读者访问', '404 errors disrupt the city news website']) {
    const text = 'The newspaper reported that visitors saw "Access Denied" and "Please sign in to continue" during an outage. Engineers said the issue was resolved at noon. The investigation is continuing and the cause remains unconfirmed.';
    assert.doesNotThrow(() => parseArticleHtml(page(`<article><p>${text}</p></article>`, title), url));
  }
  assert.doesNotThrow(() => assertArticleText(body));
});

test('the model must accept actual article text with an exact source excerpt; invalid or absent checks fail closed', () => {
  assert.doesNotThrow(() => assertModelArticleAssessment({status:'usable',evidence:body.slice(0,45)}, body));
  for (const value of [undefined, {}, {status:'usable'}, {status:'usable',evidence:'这是一段并不存在于输入正文中的虚构引文。'}, {status:'usable',evidence:'试点'}]) {
    fails(() => assertModelArticleAssessment(value, body), 'ARTICLE_ASSESSMENT_FAILED');
  }
  for (const [status,code] of [['unavailable','ARTICLE_BODY_MISSING'],['not_news','NOT_NEWS_ARTICLE'],['title_mismatch','ARTICLE_TITLE_MISMATCH']]) {
    fails(() => assertModelArticleAssessment({status,evidence:''}, body), code);
  }
});

test('normal and compact prompts both require input validation and prohibit filling a missing article from search', () => {
  const input = { title:'图书馆试点',source:'本地虚构来源',content:body,mode:'deep' as const,reasoningDepth:'none',reportLanguage:'zh-CN' as const,sourceUrl:url };
  for (const prompt of [buildPrompt(input),buildCompactFallbackPrompt(input)]) {
    assert.ok(prompt.system.includes('联网结果不能替代缺失或错配的原文'));
    assert.ok(prompt.system.includes('停止打分，不填写报告'));
    assert.ok(prompt.user.includes('"inputAssessment"'));
    assert.ok(prompt.user.includes('[L1]'));
  }
});
