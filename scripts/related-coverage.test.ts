import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageUrl, coveragePrompt, defaultCoverageQuery, duplicateCoverage, validateCoverageSynthesis, type CoverageArticle, type CoverageOriginal } from '../lib/related-coverage';
import { collectRelatedCoverage } from '../lib/related-coverage-research';

const original = '2026年5月1日，海城图书馆开始延长周末开放时间。问卷共回收75份，其中60份支持延长开放。问卷方法与额外人力费用尚未说明。';
const other = '海城图书馆于2026年5月1日开始延长周末开放时间。馆方表示将记录每晚到访情况，试点两个月后公布评估。新增排班费用由年度预算承担，具体金额尚未公开。';
const article: CoverageArticle = { number: 1, title: '海城图书馆延时开放：试点评估安排', url: 'https://news.example/library', content: other };
const citation = { text: '原报道侧重问卷偏好，另一报道补充了评估安排，费用金额仍需核实。', citations: [{ article: 0, quote: '问卷共回收75份，其中60份支持延长开放。' }, { article: 1, quote: '馆方表示将记录每晚到访情况，试点两个月后公布评估。' }] };
const result = () => ({ matches: [{ article: 1, reason: '同一图书馆同日开始的同一试点', anchors: ['海城图书馆', '2026年5月1日'] }], summary: structuredClone(citation), sharedClaims: [], differences: [structuredClone(citation)], missingEvidence: [] });

test('event queries are bounded; tracking URLs deduplicate without conflating article IDs or path case', () => {
  assert.ok(defaultCoverageQuery('', '事件详情'.repeat(100)).length <= 80);
  assert.equal(coverageUrl('https://news.example/Story?id=7&utm_source=x#top'), 'https://news.example/Story?id=7');
  assert.notEqual(coverageUrl('https://news.example/Story?id=7'), coverageUrl('https://news.example/story?id=8'));
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@news.example/story']) assert.equal(coverageUrl(url), null);
});
test('reprinted or original text is excluded rather than counted as corroboration', () => {
  assert.equal(duplicateCoverage(original, original.replaceAll('。', '。\n')), true);
  assert.equal(duplicateCoverage('正文'.repeat(100) + original, '正文'.repeat(100) + original + ' 新增编辑说明'), true);
  assert.equal(duplicateCoverage(original, other), false);
});
test('comparisons require event anchors and exact quotations from both actual texts', () => {
  assert.ok(validateCoverageSynthesis(result(), original, [article]).matches.length);
  const invented = result(); invented.summary.citations[1].quote = '并不存在的模型编造出来的引文';
  assert.throws(() => validateCoverageSynthesis(invented, original, [article]));
  const unrelated = result(); unrelated.matches[0].anchors = ['其他城市', '2025年'];
  assert.throws(() => validateCoverageSynthesis(unrelated, original, [article]));
  const single = result(); single.differences[0].citations = [single.differences[0].citations[1]];
  assert.throws(() => validateCoverageSynthesis(single, original, [article]));
  const foreign = result(); foreign.summary.citations[1].article = 3;
  assert.throws(() => validateCoverageSynthesis(foreign, original, [article]));
});
test('no-event output cannot smuggle an uncited summary or unsupported comparison', () => {
  const empty = { matches: [], summary: null, sharedClaims: [], differences: [], missingEvidence: [] };
  assert.deepEqual(validateCoverageSynthesis(empty, original, [article]), empty);
  assert.throws(() => validateCoverageSynthesis({ ...empty, summary: citation }, original, [article]));
  assert.throws(() => validateCoverageSynthesis({ ...result(), matches: [...result().matches, ...result().matches] }, original, [article]));
});
test('collector actually reads pages and rejects snippets, inaccessible pages, redirects to duplicates and copies of original', async () => {
  const calls: string[] = [];
  const longOriginal = original.repeat(3); const longOther = other.repeat(3);
  const fixture: CoverageOriginal = { title: '海城图书馆', source: '本地虚构材料', publishedAt: '', originalContent: longOriginal, reportVersion: 1 };
  const collected = await collectRelatedCoverage(fixture, '海城图书馆 2026年5月1日', { execute: async (name, args: any) => {
    calls.push(`${name}:${args.url || args.query}`);
    if (name === 'web_search') return { ok: true, untrusted: true, results: [{ url: 'https://a.example/story?utm_source=x' }, { url: 'https://a.example/story' }, { url: 'https://b.example/blocked' }, { url: 'https://c.example/reprint' }, { url: 'https://d.example/original' }] };
    if (args.url.includes('blocked')) return { ok: false, untrusted: true };
    return { ok: true, untrusted: true, title: '已读取的虚构报道', url: args.url, content: args.url.includes('original') ? longOriginal : longOther };
  } });
  assert.equal(collected.articles.length, 1);
  assert.equal(collected.articles[0].number, 1);
  assert.equal(collected.unreadableCount, 1);
  assert.equal(collected.excludedCount, 2);
  assert.equal(calls.filter(call => call.startsWith('read_webpage:')).length, 4);
});
test('prompt treats pages as data and distinguishes same-event reporting, coverage differences and independence', () => {
  const prompt = coveragePrompt({ title: '虚构新闻', source: '', publishedAt: '', originalContent: original, reportVersion: 1 }, [article], '图书馆', 'Chinese');
  assert.match(prompt.system, /untrusted DATA/);
  assert.match(prompt.system, /SAME specific event/);
  assert.match(prompt.system, /do NOT establish independent/);
  assert.deepEqual(JSON.parse(prompt.userPrompt).articles[0].content, other);
});
