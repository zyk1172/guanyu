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

function structuredSearchSources(payload: any, provider: string) {
  const sources: RuntimeSearchSource[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    const url = item.url || item.link || item.uri;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      sources.push({
        title: String(item.title || item.name || item.site_name || item.media || url),
        url,
        snippet: String(item.summary || item.snippet || item.content || '').slice(0, 800),
        provider,
      });
    }
    Object.entries(item).forEach(([key, nested]) => {
      if (/annotation|citation|source|search|result|ground/i.test(key)) visit(nested, depth + 1);
    });
  };
  visit(payload);
  return dedupeSources(sources);
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

function openAiSupportsReasoning(modelId: string) {
  return /^(?:gpt-(?:5|6)(?:[.-]|$)|o[134](?:[.-]|$))/i.test(modelId.trim());
}

function openAiReasoning(modelId: string, reasoningDepth?: string) {
  if (!openAiSupportsReasoning(modelId)) return undefined;
  if (reasoningDepth === 'none') return { effort: 'none' };
  if (reasoningDepth === 'low') return { effort: 'low' };
  if (reasoningDepth === 'medium') return { effort: 'medium' };
  if (reasoningDepth === 'high') return { effort: 'high' };
  if (reasoningDepth === 'extreme') return { effort: 'xhigh' };
  return undefined;
}

function reasoningBudget(reasoningDepth?: string) {
  if (reasoningDepth === 'none') return 0;
  if (reasoningDepth === 'low') return 1024;
  if (reasoningDepth === 'medium') return 4096;
  if (reasoningDepth === 'high') return 8192;
  return 16384;
}

function qwenThinking(reasoningDepth?: string) {
  return {
    enable_thinking: reasoningDepth !== 'none',
    ...(reasoningDepth !== 'none' ? { thinking_budget: reasoningBudget(reasoningDepth) } : {}),
  };
}

function kimiReasoning(reasoningDepth?: string) {
  if (reasoningDepth === 'none') return 'low';
  if (reasoningDepth === 'low' || reasoningDepth === 'medium') return 'low';
  if (reasoningDepth === 'high') return 'high';
  return 'max';
}

function zhipuThinking(reasoningDepth?: string) {
  return {
    thinking: { type: reasoningDepth === 'none' ? 'disabled' : 'enabled' },
    reasoning_effort: reasoningDepth === 'extreme' ? 'max' : reasoningDepth || 'medium',
  };
}

function chatUsage(payload: any, nativeSearchRequests = 0): RuntimeUsage {
  const usage = payload?.usage || {};
  return {
    inputTokens: int(usage.prompt_tokens || usage.input_tokens),
    outputTokens: int(usage.completion_tokens || usage.output_tokens),
    cacheReadTokens: int(usage.prompt_tokens_details?.cached_tokens || usage.input_tokens_details?.cached_tokens),
    nativeSearchRequests: Math.max(
      nativeSearchRequests,
      int(usage.web_search_usage?.tool_usage),
      Array.isArray(payload?.web_search) ? payload.web_search.length : 0,
    ),
  };
}

async function postChatCompletion(params: InvokeModelParams, body: Record<string, unknown>, headers?: Record<string, string>) {
  const response = await safeOutboundRequest(`${params.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: headers || { 'Content-Type': 'application/json', Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify(body),
    timeoutMs: params.timeoutMs,
    maxBytes: 8 * 1024 * 1024,
    requireHttps: process.env.NODE_ENV === 'production' && !params.allowPrivateAddress,
    allowPrivateAddress: params.allowPrivateAddress,
  });
  return { response, payload: JSON.parse(response.body.toString('utf8') || '{}') };
}

function standardChatBody(params: InvokeModelParams) {
  return {
    model: params.modelId,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.userPrompt },
    ],
    temperature: 0.1,
    stream: false,
    ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
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
  const reasoning = openAiReasoning(params.modelId, params.reasoningDepth);
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
      ...(params.jsonMode ? { text: { format: { type: 'json_object' } } } : {}),
      ...(params.nativeSearch ? {
        tools: [{ type: 'web_search', search_context_size: 'high' }],
        tool_choice: 'auto',
        include: ['web_search_call.action.sources'],
      } : {}),
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

async function invokeXiaomiMimo(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const body = {
    ...standardChatBody(params),
    ...(params.maxTokens ? { max_completion_tokens: params.maxTokens } : {}),
    thinking: { type: params.reasoningDepth === 'none' ? 'disabled' : 'enabled' },
    ...(params.nativeSearch ? {
      tools: [{ type: 'web_search', max_keyword: 3, force_search: true, limit: 5 }],
      tool_choice: 'auto',
    } : {}),
  };
  const { response, payload } = await postChatCompletion(params, body, {
    'Content-Type': 'application/json',
    'api-key': params.apiKey,
    Authorization: `Bearer ${params.apiKey}`,
  });
  const message = payload?.choices?.[0]?.message || {};
  const sources = structuredSearchSources(message?.annotations || payload?.web_search || [], 'xiaomi-mimo-native');
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message: String(message?.content || '').trim(),
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources,
    usage: chatUsage(payload, sources.length ? Math.max(1, int(payload?.usage?.web_search_usage?.tool_usage)) : 0),
  };
}

async function invokeQwen(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const body = {
    ...standardChatBody(params),
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    ...qwenThinking(params.reasoningDepth),
    ...(params.nativeSearch ? {
      enable_search: true,
      search_options: { forced_search: true, search_strategy: params.reasoningDepth === 'extreme' ? 'max' : 'turbo', enable_source: true },
    } : {}),
  };
  const { response, payload } = await postChatCompletion(params, body);
  const sources = structuredSearchSources(payload?.search_info || payload?.web_search || payload?.choices?.[0]?.message?.annotations || [], 'qwen-native');
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message: String(payload?.choices?.[0]?.message?.content || '').trim(),
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources,
    usage: chatUsage(payload, params.nativeSearch ? Math.max(1, sources.length ? 1 : 0) : 0),
  };
}

async function invokeZhipu(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const body = {
    ...standardChatBody(params),
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
    ...zhipuThinking(params.reasoningDepth),
    ...(params.nativeSearch ? {
      tools: [{ type: 'web_search', web_search: { enable: true, search_engine: 'search_pro', search_result: true, count: 8, content_size: 'high' } }],
      tool_choice: 'auto',
    } : {}),
  };
  const { response, payload } = await postChatCompletion(params, body);
  const sources = structuredSearchSources(payload?.web_search || payload?.choices?.[0]?.message?.annotations || [], 'zhipu-native');
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    message: String(payload?.choices?.[0]?.message?.content || '').trim(),
    errorCode: response.status >= 400 ? `upstream_${response.status}` : undefined,
    usedTokenBudget: Boolean(params.maxTokens),
    sources,
    usage: chatUsage(payload, params.nativeSearch ? Math.max(1, sources.length ? 1 : 0) : 0),
  };
}

async function invokeMoonshot(params: InvokeModelParams): Promise<ModelInvocationResult> {
  const messages: any[] = [
    { role: 'system', content: params.system },
    { role: 'user', content: params.userPrompt },
  ];
  const tools = params.nativeSearch ? [{ type: 'builtin_function', function: { name: '$web_search' } }] : undefined;
  let lastPayload: any = {};
  let lastStatus = 502;
  const gatheredSources: RuntimeSearchSource[] = [];
  let searchRequests = 0;
  let usage: RuntimeUsage = { ...EMPTY_USAGE };

  for (let attempt = 0; attempt < (params.nativeSearch ? 4 : 1); attempt += 1) {
    const { response, payload } = await postChatCompletion(params, {
      model: params.modelId,
      messages,
      stream: false,
      temperature: 0.1,
      reasoning_effort: kimiReasoning(params.reasoningDepth),
      ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(tools ? { tools } : {}),
    });
    lastPayload = payload;
    lastStatus = response.status;
    const currentUsage = chatUsage(payload);
    usage = {
      inputTokens: usage.inputTokens + currentUsage.inputTokens,
      outputTokens: usage.outputTokens + currentUsage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens + currentUsage.cacheReadTokens,
      nativeSearchRequests: searchRequests,
    };
    if (response.status < 200 || response.status >= 300) break;
    const choice = payload?.choices?.[0] || {};
    const message = choice?.message || {};
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (choice?.finish_reason !== 'tool_calls' || !toolCalls.length) {
      return {
        ok: true,
        status: response.status,
        message: String(message?.content || '').trim(),
        usedTokenBudget: Boolean(params.maxTokens),
        sources: dedupeSources(gatheredSources),
        usage: { ...usage, nativeSearchRequests: searchRequests },
      };
    }
    messages.push(message);
    for (const toolCall of toolCalls) {
      if (toolCall?.function?.name !== '$web_search') continue;
      searchRequests += 1;
      let argumentsObject: unknown = {};
      try { argumentsObject = JSON.parse(String(toolCall.function.arguments || '{}')); } catch {}
      gatheredSources.push(...structuredSearchSources(argumentsObject, 'moonshot-native'));
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: '$web_search',
        content: JSON.stringify(argumentsObject),
      });
    }
  }
  return {
    ok: false,
    status: lastStatus,
    message: String(lastPayload?.choices?.[0]?.message?.content || '').trim(),
    errorCode: lastStatus >= 400 ? `upstream_${lastStatus}` : 'native_search_loop_exceeded',
    usedTokenBudget: Boolean(params.maxTokens),
    sources: dedupeSources(gatheredSources),
    usage: { ...usage, nativeSearchRequests: searchRequests },
  };
}

export async function invokeModel(params: InvokeModelParams): Promise<ModelInvocationResult> {
  try {
    if (params.provider === 'openai') return await invokeOpenAiResponses(params);
    if (params.provider === 'gemini') return await invokeGemini(params);
    if (params.provider === 'anthropic') return await invokeAnthropic(params);
    if (params.provider === 'xiaomi_mimo') return await invokeXiaomiMimo(params);
    if (params.provider === 'qwen') return await invokeQwen(params);
    if (params.provider === 'moonshot') return await invokeMoonshot(params);
    if (params.provider === 'zhipu') return await invokeZhipu(params);
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

export async function testModelConnection(params: Omit<InvokeModelParams, 'system' | 'userPrompt' | 'timeoutMs' | 'maxTokens' | 'jsonMode' | 'nativeSearch'> & { nativeSearch?: boolean }) {
  const startedAt = Date.now();
  const result = await invokeModel({
    ...params,
    system: params.nativeSearch
      ? 'You are a connectivity and native web-search test. Use the configured web-search tool once, then include GUANYU_MODEL_OK in the final answer.'
      : 'You are a connectivity test. Do not use tools.',
    userPrompt: params.nativeSearch
      ? 'Search the web for the official homepage of the configured model provider. Reply with GUANYU_MODEL_OK and one source URL.'
      : 'Reply with exactly GUANYU_MODEL_OK',
    timeoutMs: 90_000,
    maxTokens: 512,
    jsonMode: false,
    nativeSearch: Boolean(params.nativeSearch),
  });
  const nativeSearchPassed = !params.nativeSearch || result.usage.nativeSearchRequests > 0 || result.sources.length > 0;
  return {
    ...result,
    durationMs: Date.now() - startedAt,
    nativeSearchPassed,
    passed: result.ok && /GUANYU_MODEL_OK/i.test(result.message) && nativeSearchPassed,
  };
}
