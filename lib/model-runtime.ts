import { safeOutboundRequest } from '@/lib/safe-outbound';
import type { PlatformModelProvider } from '@/lib/platform-model-core.mjs';

export type RuntimeSearchSource = {
  title: string;
  url: string;
  snippet?: string;
  provider: string;
};

export type RuntimeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  nativeSearchRequests: number;
};

export type ModelInvocationResult = {
  ok: boolean;
  status: number;
  message: string;
  errorCode?: string;
  usedTokenBudget: boolean;
  sources: RuntimeSearchSource[];
  usage: RuntimeUsage;
};

type InvokeModelParams = {
  provider: PlatformModelProvider;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  reasoningDepth?: string;
  system: string;
  userPrompt: string;
  timeoutMs: number;
  maxTokens?: number;
  jsonMode?: boolean;
  nativeSearch?: boolean;
  allowPrivateAddress?: boolean;
};

const EMPTY_USAGE: RuntimeUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  nativeSearchRequests: 0,
};

function int(value: unknown) {
  const parsed = Number.parseInt(String(value || 0), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function dedupeSources(sources: RuntimeSearchSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.trim().replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function openAiSources(payload: any) {
  const sources: RuntimeSearchSource[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type === 'web_search_call') {
      for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) {
        if (source?.url) sources.push({ title: String(source.title || source.url), url: String(source.url), provider: 'openai-native' });
      }
    }
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        const citation = annotation?.type === 'url_citation' ? annotation : annotation?.url_citation;
        if (citation?.url) sources.push({ title: String(citation.title || citation.url), url: String(citation.url), provider: 'openai-native' });
      }
    }
  }
  return dedupeSources(sources);
}

function openAiOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function openAiReasoning(reasoningDepth?: string) {
  if (reasoningDepth === 'none') return { effort: 'none' };
  if (reasoningDepth === 'low') return { effort: 'low' };
  if (reasoningDepth === 'medium') return { effort: 'medium' };
  if (reasoningDepth === 'high') return { effort: 'high' };
  if (reasoningDepth === 'extreme') return { effort: 'xhigh' };
  return undefined;
}

function geminiThinking(modelId: string, reasoningDepth?: string) {
  if (/gemini-3/i.test(modelId)) {
    const level = reasoningDepth === 'none'
      ? 'minimal'
      : reasoningDepth === 'low'
        ? 'low'
        : reasoningDepth === 'medium'
          ? 'medium'
          : 'high';
    return { thinkingConfig: { thinkingLevel: level } };
  }
  if (/gemini-2\.5/i.test(modelId)) {
    const budget = reasoningDepth === 'none'
      ? 0
      : reasoningDepth === 'low'
        ? 1024
        : reasoningDepth === 'medium'
          ? 4096
          : reasoningDepth === 'high'
            ? 8192
            : 16384;
    return { thinkingConfig: { thinkingBudget: budget } };
  }
  return {};
}

function anthropicThinking(reasoningDepth?: string) {
  if (!reasoningDepth || reasoningDepth === 'none') return undefined;
  const budgetTokens = reasoningDepth === 'low'
    ? 1024
    : reasoningDepth === 'medium'
      ? 4096
      : reasoningDepth === 'high'
        ? 8192
        : 16000;
  return { type: 'enabled', budget_tokens: budgetTokens };
}

async function invokeOpenAiCompatible(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const response = await safeOutboundRequest(`${params.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify({
      model: params.modelId,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.userPrompt },
      ],
      temperature: 0.1,
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    }),
    timeoutMs: params.timeoutMs,
    maxBytes: 8 * 1024 * 1024,
    requireHttps: process.env.NODE_ENV === 'production' && !params.allowPrivateAddress,
    allowPrivateAddress: params.allowPrivateAddress,
  });
  const payload = JSON.parse(response.body.toString('utf8') || '{}');
  const usage = payload?.usage || {};
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message: String(payload?.choices?.[0]?.message?.content || '').trim(),
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources: [],
    usage: {
      inputTokens: int(usage.prompt_tokens),
      outputTokens: int(usage.completion_tokens),
      cacheReadTokens: int(usage.prompt_tokens_details?.cached_tokens),
      nativeSearchRequests: 0,
    },
  };
}

async function invokeOpenAiResponses(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const reasoning = openAiReasoning(params.reasoningDepth);
  const response = await safeOutboundRequest(`${params.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify({
      model: params.modelId,
      input: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.userPrompt },
      ],
      store: false,
      ...(params.nativeSearch ? { tools: [{ type: 'web_search', search_context_size: 'high' }] } : {}),
      ...(params.maxTokens ? { max_output_tokens: params.maxTokens } : {}),
      ...(reasoning ? { reasoning } : {}),
    }),
    timeoutMs: params.timeoutMs,
    maxBytes: 8 * 1024 * 1024,
    requireHttps: process.env.NODE_ENV === 'production' && !params.allowPrivateAddress,
    allowPrivateAddress: params.allowPrivateAddress,
  });
  const payload = JSON.parse(response.body.toString('utf8') || '{}');
  const usage = payload?.usage || {};
  const nativeSearchRequests = (Array.isArray(payload?.output) ? payload.output : []).filter((item: any) => item?.type === 'web_search_call').length;
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message: openAiOutputText(payload),
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources: openAiSources(payload),
    usage: {
      inputTokens: int(usage.input_tokens),
      outputTokens: int(usage.output_tokens),
      cacheReadTokens: int(usage.input_tokens_details?.cached_tokens),
      nativeSearchRequests,
    },
  };
}

async function invokeGemini(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const base = params.baseUrl.replace(/\/$/, '');
  const endpoint = `${base}/models/${encodeURIComponent(params.modelId)}:generateContent`;
  const response = await safeOutboundRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': params.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
      ...(params.nativeSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: 0.1,
        ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
        ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
        ...geminiThinking(params.modelId, params.reasoningDepth),
      },
    }),
    timeoutMs: params.timeoutMs,
    maxBytes: 8 * 1024 * 1024,
    requireHttps: process.env.NODE_ENV === 'production' && !params.allowPrivateAddress,
    allowPrivateAddress: params.allowPrivateAddress,
  });
  const payload = JSON.parse(response.body.toString('utf8') || '{}');
  const candidate = payload?.candidates?.[0] || {};
  const message = (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
  const grounding = candidate?.groundingMetadata || candidate?.grounding_metadata || {};
  const sources = (Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : Array.isArray(grounding?.grounding_chunks) ? grounding.grounding_chunks : [])
    .map((chunk: any) => chunk?.web || {})
    .filter((web: any) => web?.uri)
    .map((web: any) => ({ title: String(web.title || web.uri), url: String(web.uri), provider: 'gemini-native' }));
  const usage = payload?.usageMetadata || payload?.usage_metadata || {};
  const queries = grounding?.webSearchQueries || grounding?.web_search_queries || [];
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message,
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources: dedupeSources(sources),
    usage: {
      inputTokens: int(usage.promptTokenCount || usage.prompt_token_count),
      outputTokens: int(usage.candidatesTokenCount || usage.candidates_token_count),
      cacheReadTokens: int(usage.cachedContentTokenCount || usage.cached_content_token_count),
      nativeSearchRequests: Array.isArray(queries) ? queries.filter(Boolean).length : 0,
    },
  };
}

async function invokeAnthropic(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const thinking = anthropicThinking(params.reasoningDepth);
  const maxTokens = Math.max(params.maxTokens || 12_000, (thinking?.budget_tokens || 0) + 4096);
  const response = await safeOutboundRequest(`${params.baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.modelId,
      system: params.system,
      messages: [{ role: 'user', content: params.userPrompt }],
      max_tokens: maxTokens,
      ...(thinking ? { thinking } : { temperature: 0.1 }),
      ...(params.nativeSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }] } : {}),
    }),
    timeoutMs: params.timeoutMs,
    maxBytes: 8 * 1024 * 1024,
    requireHttps: process.env.NODE_ENV === 'production' && !params.allowPrivateAddress,
    allowPrivateAddress: params.allowPrivateAddress,
  });
  const payload = JSON.parse(response.body.toString('utf8') || '{}');
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const message = blocks.filter((block: any) => block?.type === 'text').map((block: any) => String(block.text || '')).join('\n').trim();
  const sources: RuntimeSearchSource[] = [];
  for (const block of blocks) {
    for (const citation of Array.isArray(block?.citations) ? block.citations : []) {
      if (citation?.url) sources.push({ title: String(citation.title || citation.url), url: String(citation.url), provider: 'anthropic-native' });
    }
    if (block?.type === 'web_search_tool_result') {
      for (const result of Array.isArray(block?.content) ? block.content : []) {
        if (result?.url) sources.push({ title: String(result.title || result.url), url: String(result.url), snippet: String(result.page_age || ''), provider: 'anthropic-native' });
      }
    }
  }
  const usage = payload?.usage || {};
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message,
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources: dedupeSources(sources),
    usage: {
      inputTokens: int(usage.input_tokens),
      outputTokens: int(usage.output_tokens),
      cacheReadTokens: int(usage.cache_read_input_tokens),
      nativeSearchRequests: int(usage.server_tool_use?.web_search_requests),
    },
  };
}

export async function invokeModel(params: InvokeModelParams): Promise<ModelInvocationResult> {
  try {
    if (params.provider === 'openai') return await invokeOpenAiResponses(params);
    if (params.provider === 'gemini') return await invokeGemini(params);
    if (params.provider === 'anthropic') return await invokeAnthropic(params);
    return await invokeOpenAiCompatible(params);
  } catch (error: any) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /超时|timeout/i.test(String(error?.message || ''));
    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      message: '',
      errorCode: isTimeout ? 'timeout' : 'network_error',
      usedTokenBudget: Boolean(params.maxTokens),
      sources: [],
      usage: { ...EMPTY_USAGE },
    };
  }
}

export async function testModelConnection(params: Omit<InvokeModelParams, 'system' | 'userPrompt' | 'timeoutMs' | 'maxTokens' | 'jsonMode' | 'nativeSearch'>) {
  const result = await invokeModel({
    ...params,
    system: 'You are a connectivity test. Do not use tools.',
    userPrompt: 'Reply with exactly GUANYU_MODEL_OK',
    timeoutMs: 45_000,
    maxTokens: 64,
    jsonMode: false,
    nativeSearch: false,
  });
  return { ...result, passed: result.ok && /GUANYU_MODEL_OK/i.test(result.message) };
}
