import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { historicalAuditModelName, withHistoricalAuditModelName } from '../lib/audit-model-display';
import { invokeModel } from '../lib/model-runtime';

type CapturedRequest = { path: string; body: any };

async function withModelServer(run: (baseUrl: string, captured: CapturedRequest[]) => Promise<void>) {
  const captured: CapturedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      captured.push({ path: request.url || '', body });
      response.setHeader('content-type', 'application/json');
      if (request.url?.endsWith('/responses')) {
        response.end(JSON.stringify({ output_text: 'OPENAI_OK', output: [], usage: { input_tokens: 10, output_tokens: 2 } }));
      } else if (request.url?.includes(':generateContent')) {
        response.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'GEMINI_OK' }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 } }));
      } else if (request.url?.endsWith('/messages')) {
        response.end(JSON.stringify({ content: [{ type: 'text', text: 'CLAUDE_OK' }], usage: { input_tokens: 7, output_tokens: 2 } }));
      } else {
        response.end(JSON.stringify({ choices: [{ message: { content: 'COMPATIBLE_OK' } }], usage: { prompt_tokens: 6, completion_tokens: 2 } }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`, captured);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const BASE = {
  apiKey: 'test-only',
  system: 'system',
  userPrompt: 'user',
  timeoutMs: 5_000,
  maxTokens: 5_000,
  jsonMode: true,
  allowPrivateAddress: true,
};

test('provider adapters map reasoning and native search without changing compatible baseline requests', async () => {
  await withModelServer(async (baseUrl, captured) => {
    const openai = await invokeModel({ ...BASE, provider: 'openai', baseUrl: `${baseUrl}/v1`, modelId: 'gpt-5.4', reasoningDepth: 'extreme', nativeSearch: true });
    const gemini = await invokeModel({ ...BASE, provider: 'gemini', baseUrl: `${baseUrl}/v1beta`, modelId: 'gemini-3.1-pro-preview', reasoningDepth: 'high', nativeSearch: true });
    const anthropic = await invokeModel({ ...BASE, provider: 'anthropic', baseUrl: `${baseUrl}/v1`, modelId: 'claude-sonnet-4', reasoningDepth: 'medium', nativeSearch: true });
    const compatible = await invokeModel({ ...BASE, provider: 'openai_compatible', baseUrl: `${baseUrl}/v1`, modelId: 'deepseek-v4-pro', reasoningDepth: 'extreme', nativeSearch: false });

    assert.equal(openai.message, 'OPENAI_OK');
    assert.equal(gemini.message, 'GEMINI_OK');
    assert.equal(anthropic.message, 'CLAUDE_OK');
    assert.equal(compatible.message, 'COMPATIBLE_OK');

    assert.equal(captured[0].path, '/v1/responses');
    assert.deepEqual(captured[0].body.reasoning, { effort: 'xhigh' });
    assert.equal(captured[0].body.tools[0].type, 'web_search');

    assert.match(captured[1].path, /gemini-3\.1-pro-preview:generateContent$/);
    assert.deepEqual(captured[1].body.generationConfig.thinkingConfig, { thinkingLevel: 'high' });
    assert.deepEqual(captured[1].body.tools, [{ google_search: {} }]);

    assert.equal(captured[2].path, '/v1/messages');
    assert.deepEqual(captured[2].body.thinking, { type: 'enabled', budget_tokens: 4096 });
    assert.equal(captured[2].body.temperature, undefined);
    assert.equal(captured[2].body.tools[0].type, 'web_search_20250305');

    assert.equal(captured[3].path, '/v1/chat/completions');
    assert.equal(captured[3].body.reasoning, undefined);
    assert.equal(captured[3].body.thinking, undefined);
    assert.equal(captured[3].body.model, 'deepseek-v4-pro');
  });
});

test('historical reports prefer their immutable model display snapshot', () => {
  const audit = {
    modelName: 'current-provider-model-id',
    modelDisplayNameSnapshot: 'DeepSeek V4 Pro 历史名称',
    title: '历史报告',
  };
  assert.equal(historicalAuditModelName(audit), 'DeepSeek V4 Pro 历史名称');
  assert.deepEqual(withHistoricalAuditModelName(audit), {
    ...audit,
    modelName: 'DeepSeek V4 Pro 历史名称',
  });
  assert.equal(historicalAuditModelName({ modelName: 'legacy-model' }), 'legacy-model');
});
