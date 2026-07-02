import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPublishedDate } from '../lib/publishedDate.mjs';
import { computeReadWorthCore } from '../lib/read-worth-core.mjs';
import { isSuperAdminIdentity } from '../lib/admin-core.mjs';
import { AUDIENCE_THEME_OPTIONS, getAudienceThemeConfig, normalizeAudienceTheme } from '../lib/audience-theme-core.mjs';
import { buildTavilySearchRequest, normalizeTavilySearchResponse } from '../lib/tavily-core.mjs';
import { buildSerperSearchRequest, normalizeSerperSearchResponse } from '../lib/serper-core.mjs';

test('extracts People Daily body date before unrelated old dates', () => {
  const html = `
    <html>
      <head><meta name="date" content="2013-07-17"></head>
      <body>
        <div>《人民日报》（2026年06月29日 第 06 版）</div>
        <article>这是一篇新闻正文，包含足够文本用于测试。</article>
      </body>
    </html>
  `;

  const result = extractPublishedDate(html, '人民日报');

  assert.equal(result.publishedAt, '2026-06-29');
  assert.equal(result.publishedAtSource, 'body_people_daily_format');
  assert.equal(result.publishedAtConfidence, 'high');
});

test('manual published date has highest priority', () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">{"datePublished":"2026-06-29"}</script>
      </head>
      <body>《人民日报》（2026年06月29日 第 06 版）</body>
    </html>
  `;

  const result = extractPublishedDate(html, '人民日报', '2026-06-28');

  assert.equal(result.publishedAt, '2026-06-28');
  assert.equal(result.publishedAtSource, 'user_input');
  assert.equal(result.publishedAtConfidence, 'high');
});

test('read worth verdict uses only productized labels', () => {
  const labels = new Set(['值得细读', '可以略读', '不值一读', '暂无法判断']);
  const cases = [
    { credibility: 88, informationCompleteness: 82, narrativeBias: 35, evidenceStrength: 84, speculationRisk: 20 },
    { credibility: 62, informationCompleteness: 55, narrativeBias: 58, evidenceStrength: 52, speculationRisk: 48 },
    { credibility: 24, informationCompleteness: 28, narrativeBias: 86, evidenceStrength: 22, speculationRisk: 82 },
    { credibility: 52, informationCompleteness: 38, narrativeBias: 65, evidenceStrength: 30, speculationRisk: 72 },
  ];

  for (const scores of cases) {
    const verdict = computeReadWorthCore({ scores });
    assert.equal(labels.has(verdict.label), true);
  }
});

test('tavily request uses basic search by default to preserve free credits', () => {
  const request = buildTavilySearchRequest('  观隅 联网核验  ', 8);

  assert.deepEqual(request, {
    query: '观隅 联网核验',
    search_depth: 'basic',
    max_results: 8,
    include_answer: false,
    include_raw_content: false,
  });
});

test('tavily response normalizes official results without leaking raw payload shape', () => {
  const sources = normalizeTavilySearchResponse({
    results: [
      { title: '来源 A', url: 'https://example.com/a', content: '摘要 A', raw_content: '很长的原文' },
      { title: '', url: 'https://example.com/b', content: '摘要 B' },
      { title: '来源 C', url: '', content: '摘要 C' },
    ],
  });

  assert.deepEqual(sources, [
    { title: '来源 A', url: 'https://example.com/a', snippet: '摘要 A' },
  ]);
});

test('serper request and response normalize google-style results', () => {
  assert.deepEqual(buildSerperSearchRequest('  观隅  核验  ', 12), {
    q: '观隅 核验',
    num: 10,
    gl: 'cn',
    hl: 'zh-cn',
  });

  const sources = normalizeSerperSearchResponse({
    organic: [
      { title: '结果 A', link: 'https://example.com/a', snippet: '摘要 A' },
      { title: '', link: 'https://example.com/b', snippet: '摘要 B' },
    ],
    news: [
      { title: '新闻 C', link: 'https://example.com/c', snippet: '摘要 C' },
    ],
  });

  assert.deepEqual(sources, [
    { title: '结果 A', url: 'https://example.com/a', snippet: '摘要 A' },
    { title: '新闻 C', url: 'https://example.com/c', snippet: '摘要 C' },
  ]);
});

test('super admin identity supports role and scoped env allow-list', () => {
  assert.equal(isSuperAdminIdentity({ id: 'u1', email: 'owner@example.com', role: 'super_admin' }, {}), true);
  assert.equal(isSuperAdminIdentity({ id: 'u2', email: 'Root@Example.com' }, { SUPER_ADMIN_EMAILS: 'root@example.com, admin@example.com' }), true);
  assert.equal(isSuperAdminIdentity({ id: 'u3', email: 'user@example.com' }, { SUPER_ADMIN_IDS: 'u3' }), true);
  assert.equal(isSuperAdminIdentity({ id: 'u4', email: 'user@example.com' }, { SUPER_ADMIN_EMAILS: 'other@example.com' }), false);
});

test('audience themes normalize to productized age-group options', () => {
  assert.deepEqual(AUDIENCE_THEME_OPTIONS.map((item) => item.value), ['teen', 'youth', 'mature', 'senior']);
  assert.equal(normalizeAudienceTheme('senior'), 'senior');
  assert.equal(normalizeAudienceTheme('unknown'), 'youth');
  assert.equal(normalizeAudienceTheme(undefined), 'youth');
});

test('senior audience theme reduces visible report complexity', () => {
  const senior = getAudienceThemeConfig('senior');
  const youth = getAudienceThemeConfig('youth');

  assert.equal(senior.readingGuide, true);
  assert.equal(senior.detailLimit < youth.detailLimit, true);
  assert.equal(senior.motion, 'reduced');
});
