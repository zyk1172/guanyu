import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPublishedDate } from '../lib/publishedDate.mjs';
import { computeReadWorthCore } from '../lib/read-worth-core.mjs';

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
