import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { extractWebpage, parseSearchHtml, WebResearchSession } from '../lib/web-research';
import { safeOutboundRequest } from '../lib/safe-outbound';
import { invokeModel } from '../lib/model-runtime';
import type { PlatformModelProvider } from '../lib/platform-model-core.mjs';
import { decodePlatformModelSnapshot } from '../lib/platform-models';

const PAGE = `<html><head><title>Primary evidence</title></head><body><nav>Navigation noise</nav><article><h1>Primary evidence</h1><p>${'The official report provides measured evidence and explains the methodology. '.repeat(12)}</p><a href="/method">Methodology</a><script>globalThis.researchScriptExecuted = true</script></article><footer>Footer noise</footer></body></html>`;
const reply = (body: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html' }) => ({ status, headers: new Headers(headers), body: Buffer.from(body) });

function fixtureSession() {
  const requested: string[] = [];
  const session = new WebResearchSession({
    searxngUrl: 'https://search.example',
    request: async (url) => {
      requested.push(url);
      return url.startsWith('https://search.example/')
        ? reply(JSON.stringify({ results: [{ title: 'Evidence', url: 'https://evidence.example/news', content: 'Measured evidence' }] }), 200, { 'content-type': 'application/json' })
        : reply(PAGE);
    },
  });
  return { session, requested };
}

test('Readability extracts evidence and relative links without running scripts or including navigation', () => {
  const page = extractWebpage(PAGE, 'https://evidence.example/news');
  assert.match(page.content, /official report/);
  assert.doesNotMatch(page.content, /Navigation noise|Footer noise|researchScriptExecuted/);
  assert.equal((globalThis as any).researchScriptExecuted, undefined);
  assert.deepEqual(page.links, [{ title: 'Methodology', url: 'https://evidence.example/method' }]);
});

test('search parser unwraps DuckDuckGo result URLs once and detects a bot challenge', () => {
  const results = parseSearchHtml('<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnews%3Fq%3D100%2525">News</a><div class="result__snippet">Relevant evidence</div></div>', 'https://html.duckduckgo.com/html/');
  assert.equal(results[0].url, 'https://example.com/news?q=100%25');
  assert.equal(results[0].snippet, 'Relevant evidence');
  assert.throws(() => parseSearchHtml('<form id="challenge-form"></form>', 'https://html.duckduckgo.com'), /search_challenge/);
});

test('webpage decoding respects the page charset and rejects challenge pages', () => {
  const html = `<html><head><meta charset="windows-1252"><title>Café report</title></head><body><article><p>${'Café evidence and methodology. '.repeat(30)}</p></article></body></html>`;
  const page = extractWebpage(Buffer.from(html, 'latin1'), 'https://evidence.example/news');
  assert.match(page.content, /Café evidence/);
  assert.doesNotMatch(page.content, /�/);
  assert.throws(() => extractWebpage('<html><head><title>Just a moment...</title></head><body>Verify you are human</body></html>', 'https://evidence.example'), /page_challenge/);
});

test('search then read updates source evidence, caches successful requests and caps calls', async () => {
  const { session, requested } = fixtureSession();
  assert.equal((await session.execute('web_search', { query: 'official report' })).ok, true);
  assert.equal((await session.execute('read_webpage', { url: 'https://evidence.example/news' })).ok, true);
  assert.equal(session.sources.length, 1);
  assert.equal(session.sources[0].provider, 'webpage');
  assert.match(session.sources[0].snippet, /official report/);
  for (let i = 0; i < 6; i++) await session.execute('read_webpage', { url: 'https://evidence.example/news' });
  assert.equal(requested.length, 2);
  assert.equal(session.searchRequests, 1);
  assert.equal(session.available, false);
  assert.equal((await session.execute('web_search', { query: 'more' })).error, 'research_budget_exhausted');
});

test('tool executor rejects malformed arguments and unknown tools without issuing requests', async () => {
  const { session, requested } = fixtureSession();
  for (const [name, args] of [['run_code', '{}'], ['web_search', '{bad'], ['web_search', { query: 'x', token: 'must-not-leak' }], ['read_webpage', { url: '' }], ['web_search', { query: 'x'.repeat(301) }]] as const) {
    const result = await session.execute(name, args);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /must-not-leak|token/);
  }
  assert.equal(requested.length, 0);
});

test('configured SearXNG takes precedence over existing paid API settings', async () => {
  const requests: string[] = [];
  const session = new WebResearchSession({ searxngUrl: 'https://search.example', searchOptions: { provider: 'multi', tavilyApiKey: 'fixture', serperApiKey: 'fixture' }, request: async (url) => {
    requests.push(url);
    return reply('{"results":[]}', 200, { 'content-type': 'application/json' });
  } });
  assert.equal((await session.execute('web_search', { query: 'evidence' })).ok, true);
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/search\.example\/search\?/);
  assert.equal(session.searchRequests, 1);
});

test('private destinations and credentials are blocked for model-selected URLs', async () => {
  const session = new WebResearchSession();
  for (const url of ['http://127.0.0.1:5432/', 'http://169.254.169.254/latest/meta-data/', 'http://user:password@example.com/', 'file:///etc/passwd']) {
    const result = await session.execute('read_webpage', { url });
    assert.equal(result.error, 'unsafe_url', url);
  }
});

test('private SearXNG allowance never propagates to a page or redirect target', async () => {
  const requested: Array<{ url: string; private: boolean | undefined }> = [];
  const session = new WebResearchSession({ searxngUrl: 'http://searxng:8080', allowPrivateSearxng: true, request: async (url, options) => {
    requested.push({ url, private: options?.allowPrivateAddress });
    if (url.startsWith('http://searxng:8080/search')) return reply('{"results":[]}');
    if (url === 'https://public.example/news') return reply('', 302, { location: 'http://127.0.0.1/private' });
    return safeOutboundRequest(url, options);
  } });
  await session.execute('web_search', { query: 'evidence' });
  const read = await session.execute('read_webpage', { url: 'https://public.example/news' });
  assert.equal(read.error, 'unsafe_url');
  assert.equal(requested[0].private, true);
  assert.equal(requested[1].private, false);
  assert.equal(requested[2].private, false);
});

test('unsupported binary responses, CAPTCHA and redirect loops return errors instead of evidence', async () => {
  const binary = new WebResearchSession({ request: async () => reply('binary', 200, { 'content-type': 'application/octet-stream' }) });
  assert.equal((await binary.execute('read_webpage', { url: 'https://example.com/file' })).error, 'unsupported_page_type');
  assert.deepEqual(binary.sources, []);
  const challenge = new WebResearchSession({ searxngUrl: '', request: async () => reply('<form id="challenge-form"></form>') });
  assert.equal((await challenge.execute('web_search', { query: 'news' })).error, 'search_challenge');
  let redirects = 0;
  const loop = new WebResearchSession({ request: async () => { redirects++; return reply('', 302, { location: '/next' }); } });
  assert.equal((await loop.execute('read_webpage', { url: 'https://example.com/start' })).error, 'page_redirect_limit');
  assert.equal(redirects, 5);
});

test('expired sessions and per-action budgets prevent extra outbound work', async () => {
  const expired = new WebResearchSession({ timeoutMs: -1, request: async () => { throw new Error('must not run'); } });
  assert.equal((await expired.execute('web_search', { query: 'news' })).error, 'research_budget_exhausted');
  const { session, requested } = fixtureSession();
  for (let i = 0; i < 4; i++) assert.equal((await session.execute('web_search', { query: `report ${i}` })).ok, true);
  assert.equal((await session.execute('web_search', { query: 'report 5' })).error, 'search_budget_exhausted');
  assert.equal(requested.length, 4);
});

test('agent search mode survives queued model snapshots without changing existing modes', () => {
  for (const searchMode of ['agent', 'platform', 'native', 'none']) {
    const snapshot = decodePlatformModelSnapshot(JSON.stringify({ configId: 'model1', modelId: 'test', provider: 'openai_compatible', baseUrl: 'https://model.example', searchMode }));
    assert.equal(snapshot?.searchMode, searchMode);
  }
});

async function withModelServer(provider: PlatformModelProvider, run: (baseUrl: string, captured: any[]) => Promise<void>, endless = false, failAfterFirst = false) {
  const captured: any[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      captured.push(body);
      const round = captured.length;
      const tool = round === 1 || endless ? 'web_search' : 'read_webpage';
      const args = tool === 'web_search' ? { query: 'official report' } : { url: 'https://evidence.example/news' };
      const final = endless ? !body.tools : round > 2;
      response.setHeader('content-type', 'application/json');
      if (failAfterFirst && round > 1) { response.statusCode = 503; response.end('{"error":"unavailable"}'); return; }
      if (provider === 'openai') response.end(JSON.stringify({ output: final ? [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":"evidence inspected"}' }] }] : [{ type: 'reasoning', id: `r${round}`, encrypted_content: 'opaque-signature' }, { type: 'function_call', call_id: `call${round}`, name: tool, arguments: JSON.stringify(args) }], usage: { input_tokens: 10, output_tokens: 3 } }));
      else if (provider === 'anthropic') response.end(JSON.stringify({ content: final ? [{ type: 'text', text: '{"answer":"evidence inspected"}' }] : [{ type: 'thinking', thinking: 'opaque', signature: 'signature' }, { type: 'tool_use', id: `call${round}`, name: tool, input: args }], usage: { input_tokens: 10, output_tokens: 3 } }));
      else if (provider === 'gemini') response.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: final ? [{ text: '{"answer":"evidence inspected"}' }] : [{ thoughtSignature: 'signature', functionCall: { id: `call${round}`, name: tool, args } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } }));
      else response.end(JSON.stringify({ choices: [{ message: final ? { role: 'assistant', content: '{"answer":"evidence inspected"}' } : { role: 'assistant', content: null, reasoning_content: 'opaque', tool_calls: [{ id: `call${round}`, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}/v1`, captured); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const PARAMS = { apiKey: 'test-only', modelId: 'gpt-5', reasoningDepth: 'medium', system: 'Return a JSON report.', userPrompt: 'Investigate the news.', timeoutMs: 10_000, maxTokens: 1000, jsonMode: true, allowPrivateAddress: true };

for (const provider of ['openai_compatible', 'openai', 'anthropic', 'gemini', 'qwen', 'moonshot', 'zhipu', 'xiaomi_mimo'] as const) {
  test(`${provider}: model chooses search and read tools, gets evidence, and usage includes every round`, async () => {
    await withModelServer(provider, async (baseUrl, captured) => {
      const { session, requested } = fixtureSession();
      const result = await invokeModel({ ...PARAMS, provider, baseUrl, webResearch: session });
      assert.equal(result.ok, true, result.errorCode);
      assert.deepEqual(JSON.parse(result.message), { answer: 'evidence inspected' });
      assert.equal(captured.length, 3);
      assert.equal(requested.length, 2);
      assert.equal(result.sources[0].provider, 'webpage');
      assert.equal(result.usage.inputTokens, 30);
      assert.equal(result.usage.outputTokens, 9);
      assert.equal(result.usage.webSearchRequests, 1);
      assert.equal(result.usage.nativeSearchRequests, 0);
      const history = JSON.stringify(captured[1]);
      assert.match(history, /call1/);
      assert.match(history, /untrusted/);
      if (provider === 'gemini' || provider === 'anthropic') assert.match(history, /signature/);
      if (provider === 'openai') assert.match(history, /opaque-signature/);
      if (['qwen', 'moonshot', 'zhipu', 'xiaomi_mimo', 'openai_compatible'].includes(provider)) assert.match(history, /reasoning_content/);
    });
  });
}

test('model tool loop ends with tools disabled, enables JSON format and reuses cached search', async () => {
  await withModelServer('openai_compatible', async (baseUrl, captured) => {
    const { session, requested } = fixtureSession();
    const result = await invokeModel({ ...PARAMS, provider: 'openai_compatible', baseUrl, webResearch: session });
    assert.equal(result.ok, true);
    assert.equal(captured.length, 5);
    assert.equal(captured[4].tools, undefined);
    assert.deepEqual(captured[4].response_format, { type: 'json_object' });
    assert.equal(requested.length, 1);
  }, true);
});

test('upstream failures retain charged tokens and acquired evidence', async () => {
  await withModelServer('openai_compatible', async (baseUrl) => {
    const { session } = fixtureSession();
    const result = await invokeModel({ ...PARAMS, provider: 'openai_compatible', baseUrl, webResearch: session });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upstream_503');
    assert.equal(result.usage.inputTokens, 10);
    assert.equal(result.usage.webSearchRequests, 1);
    assert.equal(result.sources.length, 1);
  }, false, true);
});
