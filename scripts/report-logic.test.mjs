import assert from 'node:assert/strict';
import test from 'node:test';

import { extractPublishedDate } from '../lib/publishedDate.mjs';
import { computeReadWorthCore } from '../lib/read-worth-core.mjs';
import { isSuperAdminIdentity } from '../lib/admin-core.mjs';
import { AUDIENCE_THEME_OPTIONS, getAudienceThemeConfig, normalizeAudienceTheme } from '../lib/audience-theme-core.mjs';
import { buildTavilySearchRequest, normalizeTavilySearchResponse } from '../lib/tavily-core.mjs';
import { buildSerperSearchRequest, normalizeSerperSearchResponse } from '../lib/serper-core.mjs';
import { getUiText, normalizeUiLanguage, UI_LANGUAGE_OPTIONS } from '../lib/ui-language-core.mjs';
import { getPaymentMethodLabel, isSupportedPaymentMethod } from '../lib/payment-core.mjs';
import { buildPendingPaymentLines } from '../lib/payment-notification-core.mjs';
import { buildReportLanguageSystemGuard, hasUnexpectedChineseReportProse } from '../lib/report-language-core.mjs';
import { getPaymentPackageDefinition } from '../lib/payment-package-core.mjs';
import { mergeAdminRecipientEmails } from '../lib/admin-recipient-core.mjs';
import {
  getAnalysisTimeoutMs,
  getModelOutputTokenBudget,
  getReasoningDepthInstruction,
} from '../lib/reasoning-depth-core.mjs';
import { buildReportCompletionEmail } from '../lib/report-email-core.mjs';
import {
  DEFAULT_RSS_FEED_IDS,
  RSS_SOURCE_CATALOG,
  getEffectiveRssSourceConfig,
  normalizeRssSourceConfig,
  parseRssXml,
  validateCustomRssUrl,
} from '../lib/rss-core.mjs';
import {
  formatEvidenceGrade,
  formatJudgmentType,
  formatMaterialType,
  formatPriority,
  formatSpeculationRisk,
  formatUnconfirmedItem,
  formatVerificationStatus,
  getReadWorthAnimationTokens,
  getReportText,
} from '../lib/report-display-core.mjs';
import { getBrandIdentity } from '../lib/brand-core.mjs';
import {
  getLanguageRepairErrorMessage,
  hasUnexpectedReportProse,
} from '../lib/report-language-core.mjs';
import { createCaptchaText, isCaptchaTextSafe } from '../lib/captcha-core.mjs';
import { getEmailProviderPlan } from '../lib/email-delivery-core.mjs';
import { buildAiCompletionPrompt, validateCompletionMarkdown } from '../lib/ai-completion-core.mjs';

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

test('extracts publication dates from common US and European metadata formats', () => {
  const cases = [
    ['July 3, 2026', '2026-07-03'],
    ['3 July 2026', '2026-07-03'],
    ['3 juillet 2026', '2026-07-03'],
    ['3. Juli 2026', '2026-07-03'],
    ['3 de julio de 2026', '2026-07-03'],
    ['3 luglio 2026', '2026-07-03'],
  ];

  for (const [rawDate, expected] of cases) {
    const html = `<html><head><meta name="parsely-pub-date" content="${rawDate}"></head><body><article>Test article body.</article></body></html>`;
    const result = extractPublishedDate(html);
    assert.equal(result.publishedAt, expected, rawDate);
    assert.equal(result.publishedAtSource, 'meta_pubdate');
  }
});

test('prefers JSON-LD article publication dates over generic metadata', () => {
  const html = `
    <html><head>
      <meta name="parsely-pub-date" content="July 2, 2026">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","datePublished":"2026-07-03T10:30:00Z"}</script>
    </head><body><article>Test article body.</article></body></html>
  `;
  const result = extractPublishedDate(html);
  assert.equal(result.publishedAt, '2026-07-03');
  assert.equal(result.publishedAtSource, 'json_ld');
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

test('serper uses English locale for English report searches', () => {
  assert.deepEqual(buildSerperSearchRequest('news verification', 5, 'en-US'), {
    q: 'news verification',
    num: 5,
    gl: 'us',
    hl: 'en',
  });
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

test('UI language preferences expose the full supported locale set without Chinese fallback', () => {
  assert.deepEqual(UI_LANGUAGE_OPTIONS.map((item) => item.value), ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'de-DE', 'it-IT']);
  assert.equal(normalizeUiLanguage('en-US'), 'en-US');
  assert.equal(normalizeUiLanguage('de-DE'), 'de-DE');
  assert.equal(normalizeUiLanguage('ja-JP'), 'ja-JP');
  assert.equal(normalizeUiLanguage('unsupported'), 'zh-CN');
  assert.equal(getUiText('en-US', 'nav.home'), 'Home');
  assert.equal(getUiText('en-US', 'language.interfaceLanguage'), 'Interface language');
  assert.equal(getUiText('zh-TW', 'nav.home'), '首頁');
  assert.equal(getUiText('ja-JP', 'nav.home'), 'ホーム');
  assert.equal(getUiText('ko-KR', 'nav.home'), '홈');
  assert.equal(getUiText('de-DE', 'nav.home'), 'Startseite');
  assert.equal(getUiText('it-IT', 'nav.home'), 'Home');
  assert.match(getUiText('ja-JP', 'footer.rights', '').replace('{brand}', 'X'), /全著作権所有/);
  assert.match(getUiText('ko-KR', 'footer.rights', '').replace('{brand}', 'X'), /모든 권리 보유/);
  assert.equal(getUiText('zh-CN', 'nav.home'), '首页');
});

test('brand naming localizes outside Chinese while preserving the traditional Chinese name', () => {
  assert.equal(getBrandIdentity('zh-CN').name, '观隅');
  assert.equal(getBrandIdentity('zh-TW').name, '觀隅');
  assert.equal(getBrandIdentity('en-US').name, 'NewsLens');
  assert.equal(getBrandIdentity('ja-JP').name, 'ニュースの死角');
  assert.equal(getBrandIdentity('ko-KR').name, '뉴스의 사각');
  assert.equal(getBrandIdentity('de-DE').name, 'Nachrichtenwinkel');
  assert.equal(getBrandIdentity('it-IT').name, 'Angolo Notizie');
});

test('payment methods accept only the supported manual QR channels', () => {
  assert.equal(isSupportedPaymentMethod('alipay_qr'), true);
  assert.equal(isSupportedPaymentMethod('paypal_qr'), true);
  assert.equal(isSupportedPaymentMethod('bank_transfer'), false);
  assert.equal(getPaymentMethodLabel('paypal_qr', 'zh-CN'), 'PayPal 收款码');
  assert.equal(getPaymentMethodLabel('alipay_qr', 'en-US'), 'Alipay QR code');
});

test('pending payment notifications identify both manual payment channels', () => {
  const alipayLines = buildPendingPaymentLines({
    orderId: 'order_alipay',
    packageName: '30 点套餐',
    amountCents: 600,
    points: 30,
    paymentMethod: 'alipay_qr',
    paymentNote: '支付宝昵称 zyk',
  });
  const paypalLines = buildPendingPaymentLines({
    orderId: 'order_paypal',
    packageName: '买断套餐',
    amountCents: 3000,
    currency: 'USD',
    points: 0,
    paymentMethod: 'paypal_qr',
    paymentNote: 'PayPal transfer 10:30',
  });

  assert.equal(alipayLines.includes('付款方式：支付宝收款码'), true);
  assert.equal(paypalLines.includes('付款方式：PayPal 收款码'), true);
  assert.equal(paypalLines.includes('付款备注：PayPal transfer 10:30'), true);
  assert.equal(paypalLines.includes('金额：$30.00 USD'), true);
});

test('English report guard rejects Chinese prose while allowing fixed enum values', () => {
  const guard = buildReportLanguageSystemGuard('en-US');
  assert.match(guard, /All reader-facing JSON string values must be English/);
  assert.equal(hasUnexpectedChineseReportProse({
    readingValue: '值得细读',
    speculationRisk: '中',
    newsSummary: 'The report is written in English.',
  }), false);
  assert.equal(hasUnexpectedChineseReportProse({ newsSummary: '这段报告不应出现在英文输出中。' }), true);
});

test('all non-Chinese report languages have a strict target-language guard', () => {
  assert.match(buildReportLanguageSystemGuard('de-DE'), /German/);
  assert.match(buildReportLanguageSystemGuard('ja-JP'), /Japanese/);
  assert.match(buildReportLanguageSystemGuard('ko-KR'), /Korean/);
  assert.equal(hasUnexpectedReportProse({ newsSummary: '这段中文不应出现在德语报告中。' }, 'de-DE'), true);
  assert.equal(hasUnexpectedReportProse({ newsSummary: 'Dies ist ein deutscher Bericht.' }, 'de-DE'), false);
  assert.match(getLanguageRepairErrorMessage('it-IT'), /italiano/i);
});

test('Chinese four-character reading labels render in a two-by-two token layout', () => {
  assert.deepEqual(getReadWorthAnimationTokens('不值一读', 'zh-CN'), ['不值', '一读']);
  assert.deepEqual(getReadWorthAnimationTokens('值得细读', 'zh-CN'), ['值得', '细读']);
  assert.deepEqual(getReadWorthAnimationTokens('暂无法判断', 'zh-CN'), ['暂无', '法判', '断']);
  assert.deepEqual(getReadWorthAnimationTokens('Not Worth Reading', 'en-US'), ['Not', 'Worth', 'Reading']);
});

test('email delivery prefers SMTP but falls back to DirectMail and never marks no provider as delivered', () => {
  assert.deepEqual(getEmailProviderPlan({ smtpConfigured: true, aliyunConfigured: true }), ['smtp', 'aliyun']);
  assert.deepEqual(getEmailProviderPlan({ smtpConfigured: false, aliyunConfigured: true }), ['aliyun']);
  assert.deepEqual(getEmailProviderPlan({ smtpConfigured: false, aliyunConfigured: false }), []);
});

test('registration captcha uses a longer non-ambiguous visual code', () => {
  const value = createCaptchaText(() => 0.4);
  assert.equal(value.length, 6);
  assert.equal(isCaptchaTextSafe(value), true);
  assert.equal(isCaptchaTextSafe('O0I1L'), false);
});

test('AI completion prompt requires marked verified, contextual, and unresolved material', () => {
  const prompt = buildAiCompletionPrompt({
    title: 'Example report',
    source: 'Example source',
    originalContent: 'Original news body.',
    reportLanguage: 'en-US',
    report: {
      onlineVerification: { verifiedSources: [{ title: 'Verified source', url: 'https://example.com', note: 'Confirms the event.' }] },
      keyFindings: [{ title: 'Key finding', content: 'Needs context.' }],
    },
  });

  assert.match(prompt.system, /neutral, evidence-led news editor/i);
  assert.match(prompt.system, /green/i);
  assert.match(prompt.system, /red/i);
  assert.equal(validateCompletionMarkdown('## Revised article\n\n<span style="color:#047857">Verified fact</span>'), true);
  assert.equal(validateCompletionMarkdown(''), false);
});

test('payment package prices preserve CNY plans and define USD PayPal plans', () => {
  assert.deepEqual(getPaymentPackageDefinition('points_30', 'alipay_qr'), {
    packageType: 'points_30',
    packageName: '30 点套餐',
    amountCents: 600,
    currency: 'CNY',
    points: 30,
  });
  assert.deepEqual(getPaymentPackageDefinition('points_30', 'paypal_qr'), {
    packageType: 'points_30',
    packageName: '20 点套餐',
    amountCents: 100,
    currency: 'USD',
    points: 20,
  });
  assert.deepEqual(getPaymentPackageDefinition('byok_lifetime', 'paypal_qr'), {
    packageType: 'byok_lifetime',
    packageName: '高级功能解锁',
    amountCents: 500,
    currency: 'USD',
    points: 0,
  });
});

test('administrator recipients merge configured and database super-admin emails', () => {
  assert.deepEqual(
    mergeAdminRecipientEmails(['ops@example.com, root@example.com', 'root@example.com'], ['owner@example.com', 'OPS@example.com']),
    ['ops@example.com', 'root@example.com', 'owner@example.com']
  );
});

test('analysis timeout is configurable but remains within the background job budget', () => {
  assert.equal(getAnalysisTimeoutMs(undefined), 255_000);
  assert.equal(getAnalysisTimeoutMs('120000'), 120_000);
  assert.equal(getAnalysisTimeoutMs('999999'), 270_000);
  assert.equal(getAnalysisTimeoutMs('invalid'), 255_000);
});

test('thinking depth changes model output budget and explicit non-chain-of-thought instruction', () => {
  assert.equal(getModelOutputTokenBudget('none'), 8_000);
  assert.equal(getModelOutputTokenBudget('medium'), 14_000);
  assert.equal(getModelOutputTokenBudget('extreme'), 24_000);
  assert.match(getReasoningDepthInstruction('high', 'en-US'), /cross-check/i);
  assert.match(getReasoningDepthInstruction('extreme', 'zh-CN'), /不得输出隐藏推理过程/);
});

test('completion email contains a structured full report in the selected language', () => {
  const chinese = buildReportCompletionEmail({
    reportUrl: 'https://example.com/audits/a1',
    audit: {
      id: 'a1', title: '示例新闻', source: '示例来源', reportLanguage: 'zh-CN',
      modelName: 'test-model', reasoningDepth: 'high', createdAt: '2026-07-12T00:00:00.000Z',
    },
    report: {
      newsSummary: '这是一段新闻摘要。',
      oneSentenceConclusion: '应核验关键数据。',
      readingValue: '可以略读',
      readingValueReason: '信息尚不完整。',
      scores: { credibility: 60, informationCompleteness: 45, narrativeBias: 68, evidenceStrength: 50, speculationRisk: 63 },
      keyFindings: [{ title: '关键发现', content: '发现说明', evidenceGrade: 'C', verificationStatus: 'source_supported', speculationRisk: '低', nextVerification: '查阅原始数据' }],
      questionsToAsk: ['关键数据来自哪里？'],
      riskNotice: '结论受原文信息范围限制。',
    },
  });
  assert.match(chinese.subject, /观隅分析已完成/);
  assert.match(chinese.html, /新闻简要总结/);
  assert.match(chinese.html, /关键发现/);
  assert.match(chinese.text, /关键数据来自哪里/);

  const english = buildReportCompletionEmail({
    reportUrl: 'https://example.com/audits/a2',
    audit: { id: 'a2', title: 'Example news', source: 'Example source', reportLanguage: 'en-US', createdAt: '2026-07-12T00:00:00.000Z' },
    report: { newsSummary: 'An English summary.', oneSentenceConclusion: 'Check the source data.' },
  });
  assert.match(english.subject, /analysis complete/i);
  assert.match(english.html, /News summary/);
  assert.doesNotMatch(english.html, /新闻简要总结/);
});

test('English report chrome translates fixed Chinese schema enums and metadata labels', () => {
  assert.equal(getReportText('meta', 'en-US'), '17. Report metadata');
  assert.equal(formatJudgmentType('基于原文的合理推断', 'en-US'), 'Reasonable inference from the article');
  assert.equal(formatEvidenceGrade('D', 'en-US'), 'Evidence D');
  assert.equal(formatVerificationStatus('pending_verification', 'en-US'), 'Needs verification');
  assert.equal(formatSpeculationRisk('中', 'en-US'), 'Uncertainty: medium');
  assert.equal(formatMaterialType('多源报道', 'en-US'), 'Multiple-source reporting');
  assert.equal(formatPriority('高', 'en-US'), 'Priority: high');
});

test('report chrome localizes evidence labels for every newly supported locale', () => {
  assert.equal(getReportText('meta', 'zh-TW'), '17. 報告資訊');
  assert.equal(getReportText('meta', 'ja-JP'), '17. レポート情報');
  assert.equal(getReportText('meta', 'ko-KR'), '17. 보고서 정보');
  assert.equal(getReportText('meta', 'de-DE'), '17. Berichtsdaten');
  assert.equal(getReportText('meta', 'it-IT'), '17. Metadati del rapporto');
  assert.equal(formatEvidenceGrade('C', 'ja-JP'), '根拠 C');
  assert.equal(formatVerificationStatus('pending_verification', 'ko-KR'), '검증 필요');
  assert.equal(formatJudgmentType('待外部验证的假设', 'de-DE'), 'Hypothese mit externem Pruefbedarf');
  assert.equal(formatPriority('高', 'it-IT'), 'Priorita: alta');
});

test('unconfirmed verification entries are rendered as reader-facing text, never object coercion', () => {
  assert.equal(
    formatUnconfirmedItem({ title: 'Evacuation figures', reason: 'No independent source was provided.' }),
    'Evacuation figures: No independent source was provided.'
  );
  assert.equal(formatUnconfirmedItem({ claim: 'Death toll', note: 'No primary document found.' }), 'Death toll: No primary document found.');
  assert.equal(formatUnconfirmedItem({ unexpected: true }), '');
});

test('English reading-value animation keeps whole words together', () => {
  assert.deepEqual(getReadWorthAnimationTokens('Skimmable', 'en-US'), ['Skimmable']);
  assert.deepEqual(getReadWorthAnimationTokens('Not Worth Reading', 'en-US'), ['Not', 'Worth', 'Reading']);
  assert.deepEqual(getReadWorthAnimationTokens('可以略读', 'zh-CN'), ['可以', '略读']);
});

test('RSS catalog provides five international and three Chinese official headline feeds', () => {
  const international = RSS_SOURCE_CATALOG.filter((source) => source.region === 'international');
  const china = RSS_SOURCE_CATALOG.filter((source) => source.region !== 'international');

  assert.equal(international.length, 5);
  assert.equal(china.length, 3);
  assert.equal(DEFAULT_RSS_FEED_IDS.length, 8);
  assert.equal(international.every((source) => source.feedUrl.startsWith('https://')), true);
  assert.equal(china.every((source) => source.feedUrl.startsWith('https://')), true);
  assert.deepEqual(china.map((source) => source.id), ['china-news-service', 'people-daily', 'rthk-news']);
});

test('RSS parser normalizes RSS, RDF and Atom headlines without article body', () => {
  const rss = parseRssXml(`<?xml version="1.0"?><rss><channel><item><title>First headline</title><link>https://example.com/one</link><pubDate>Sun, 13 Jul 2026 08:00:00 GMT</pubDate><description>Do not expose full content.</description></item></channel></rss>`, {
    id: 'example',
    name: 'Example',
    feedUrl: 'https://example.com/feed.xml',
  });
  const rdf = parseRssXml(`<?xml version="1.0"?><rdf:RDF><item><title>Second headline</title><link>https://example.com/two</link><date>2026-07-13T09:00:00Z</date></item></rdf:RDF>`, {
    id: 'example',
    name: 'Example',
    feedUrl: 'https://example.com/feed.xml',
  });
  const atom = parseRssXml(`<?xml version="1.0"?><feed><entry><title>Third headline</title><link href="https://example.com/three"/><updated>2026-07-13T10:00:00Z</updated><content>Not returned</content></entry></feed>`, {
    id: 'example',
    name: 'Example',
    feedUrl: 'https://example.com/feed.xml',
  });

  assert.deepEqual(rss, [{ id: 'example:https://example.com/one', sourceId: 'example', sourceName: 'Example', title: 'First headline', url: 'https://example.com/one', publishedAt: '2026-07-13T08:00:00.000Z' }]);
  assert.deepEqual(rdf, [{ id: 'example:https://example.com/two', sourceId: 'example', sourceName: 'Example', title: 'Second headline', url: 'https://example.com/two', publishedAt: '2026-07-13T09:00:00.000Z' }]);
  assert.deepEqual(atom, [{ id: 'example:https://example.com/three', sourceId: 'example', sourceName: 'Example', title: 'Third headline', url: 'https://example.com/three', publishedAt: '2026-07-13T10:00:00.000Z' }]);
});

test('People Daily official headline source extracts current homepage titles instead of stale legacy RSS items', () => {
  const headlines = parseRssXml(`
    <html><body>
      <h1 id="rm_topline"><a href="http://edu.people.com.cn/n1/2026/0712/c1006-40758608.html">首页头条</a></h1>
      <div class="news-content"><a href="http://world.people.com.cn/n1/2026/0712/c1002-40758903.html">即时新闻</a></div>
      <ul class="blist1"><li><a href="http://politics.people.com.cn/n1/2026/0712/c1001-40758887.html">要闻播报</a></li></ul>
    </body></html>
  `, {
    id: 'people-daily',
    name: "People's Daily",
    feedUrl: 'https://www.people.com.cn/',
    feedFormat: 'html',
  });

  assert.deepEqual(headlines, [
    { id: 'people-daily:http://edu.people.com.cn/n1/2026/0712/c1006-40758608.html', sourceId: 'people-daily', sourceName: "People's Daily", title: '首页头条', url: 'http://edu.people.com.cn/n1/2026/0712/c1006-40758608.html', publishedAt: '2026-07-12T00:00:00.000Z' },
    { id: 'people-daily:http://world.people.com.cn/n1/2026/0712/c1002-40758903.html', sourceId: 'people-daily', sourceName: "People's Daily", title: '即时新闻', url: 'http://world.people.com.cn/n1/2026/0712/c1002-40758903.html', publishedAt: '2026-07-12T00:00:00.000Z' },
    { id: 'people-daily:http://politics.people.com.cn/n1/2026/0712/c1001-40758887.html', sourceId: 'people-daily', sourceName: "People's Daily", title: '要闻播报', url: 'http://politics.people.com.cn/n1/2026/0712/c1001-40758887.html', publishedAt: '2026-07-12T00:00:00.000Z' },
  ]);
});

test('RSS source config keeps catalog preferences and rejects unsafe custom feed URLs', () => {
  assert.deepEqual(
    normalizeRssSourceConfig({ catalogIds: ['bbc-news', 'unknown', 'bbc-news'], customFeeds: [] }),
    { catalogIds: ['bbc-news'], customFeeds: [] }
  );
  assert.equal(validateCustomRssUrl('https://feeds.example.org/news.xml'), 'https://feeds.example.org/news.xml');
  assert.equal(validateCustomRssUrl('http://127.0.0.1:8080/rss.xml'), '');
  assert.equal(validateCustomRssUrl('file:///etc/passwd'), '');
  assert.equal(validateCustomRssUrl('https://user:pass@example.com/feed.xml'), '');
  assert.deepEqual(
    normalizeRssSourceConfig({ catalogIds: ['south-china-morning-post', 'initium-media'], customFeeds: [] }).catalogIds,
    ['people-daily', 'rthk-news']
  );
});

test('RSS uses admin defaults until a buyout user saves a personal source configuration', () => {
  const admin = { catalogIds: ['bbc-news', 'people-daily'], customFeeds: [] };
  const personal = { catalogIds: ['dw-news'], customFeeds: [{ name: 'My feed', url: 'https://example.org/rss.xml' }] };

  assert.deepEqual(getEffectiveRssSourceConfig({ canUseOwnApi: false, adminConfig: admin, personalConfig: personal }), admin);
  assert.deepEqual(getEffectiveRssSourceConfig({ canUseOwnApi: true, adminConfig: admin, personalConfig: personal }), personal);
  assert.deepEqual(getEffectiveRssSourceConfig({ canUseOwnApi: true, adminConfig: admin, personalConfig: { catalogIds: [], customFeeds: [] } }), admin);
});
