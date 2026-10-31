'use client';

import { Button, Input, Panel } from '@/components/ui/controls';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';
import { useActiveModel } from './useActiveModel';
import type { FollowupResearch } from '@/lib/followup-types';

function safeMarkdownHref(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderMarkdownInline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = keyPrefix + '-inline-' + tokenIndex++;

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key} className="font-bold text-[var(--color-text)]">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key} className="rounded bg-[var(--color-surface)] px-1 py-0.5 font-mono text-[0.92em]">{token.slice(1, -1)}</code>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = linkMatch ? safeMarkdownHref(linkMatch[2].trim()) : null;
      nodes.push(href && linkMatch
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-link)] underline underline-offset-2 hover:text-[var(--color-link)]">{linkMatch[1]}</a>
        : token);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function isMarkdownBlockStart(line: string) {
  return /^(#{1,6})\s+/.test(line)
    || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || /^>\s?/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line)
    || /^```/.test(line);
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const key = 'md-' + blockIndex++;
    const fence = line.match(/^```\s*([^\s]*)\s*$/);
    if (fence) {
      const language = fence[1];
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs leading-relaxed text-[var(--color-text-subtle)]">
          <code data-language={language || undefined}>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const classes = level <= 2
        ? "text-sm font-bold text-[var(--color-text)] "
        : level === 3
          ? "text-[13px] font-bold text-[var(--color-text)] "
          : "text-xs font-bold text-[var(--color-text)] ";
      blocks.push(<div key={key} role="heading" aria-level={level} className={classes}>{renderMarkdownInline(heading[2], key)}</div>);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} className="border-[var(--color-border)]" />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quoteLines.push(lines[index++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={key} className="border-l-2 border-[var(--color-primary)] pl-3 text-[var(--color-text-muted)]">
          {quoteLines.map((quote, quoteIndex) => <React.Fragment key={key + '-quote-' + quoteIndex}>{quoteIndex > 0 && <br />}{renderMarkdownInline(quote, key + '-quote-' + quoteIndex)}</React.Fragment>)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ''));
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-5 marker:text-[var(--color-text-subtle)]">
          {items.map((item, itemIndex) => <li key={key + '-item-' + itemIndex}>{renderMarkdownInline(item, key + '-item-' + itemIndex)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(
        <ol key={key} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-[var(--color-text-muted)]">
          {items.map((item, itemIndex) => <li key={key + '-item-' + itemIndex}>{renderMarkdownInline(item, key + '-item-' + itemIndex)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) paragraphLines.push(lines[index++]);
    blocks.push(
      <p key={key} className="leading-6">
        {paragraphLines.map((paragraphLine, paragraphIndex) => (
          <React.Fragment key={key + '-line-' + paragraphIndex}>
            {paragraphIndex > 0 && <br />}
            {renderMarkdownInline(paragraphLine, key + '-line-' + paragraphIndex)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div className="space-y-2.5 break-words text-[var(--color-text)]">{blocks}</div>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  research?: FollowupResearch;
}

interface InteractiveQAProps {
  auditId: string;
  messages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

export default function InteractiveQA({ auditId, messages: controlledMessages, onMessagesChange }: InteractiveQAProps) {
  const { language, t } = useUiLanguage();
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webSearch, setWebSearch] = useState(true);
  const pending = useRef<{ question: string; requestId: string; history: ChatMessage[]; webSearch: boolean; language: string } | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const threadWidth = useRef(0);
  const activeModel = useActiveModel('followup');
  const messages = controlledMessages ?? localMessages;
  useLayoutEffect(() => {
    if (followLatest.current && thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [messages.length, isSending]);
  useLayoutEffect(() => {
    const element = thread.current;
    if (!element) return;
    threadWidth.current = element.clientWidth;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === threadWidth.current) return;
      threadWidth.current = element.clientWidth;
      if (followLatest.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const updateMessages = (nextMessages: ChatMessage[]) => {
    if (onMessagesChange) onMessagesChange(nextMessages);
    else setLocalMessages(nextMessages);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userQuestion = input.trim();
    const retry = pending.current?.question === userQuestion && pending.current.webSearch === webSearch && pending.current.language === language;
    const attempt = retry ? pending.current! : { question: userQuestion, requestId: crypto.randomUUID(), history: messages, webSearch, language };
    pending.current = attempt;
    followLatest.current = true;
    setInput('');
    setError(null);

    // 1. 本地立即追加用户消息
    const updatedMessages = [...attempt.history, { role: 'user' as const, content: userQuestion }];
    updateMessages(updatedMessages);
    setIsSaving(true);

    try {
      // 2. 调用交互式提问 API
      const res = await fetch('/api/audits/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditId,
          question: userQuestion,
          requestId: attempt.requestId,
          chatHistory: attempt.history.map(({ role, content }) => ({ role, content })),
          interfaceLanguage: language,
          webSearch,
        }),
      });

      const data = await res.json();
      if (res.status === 202) throw new Error(language.startsWith('zh') ? '这个问题仍在生成回答，请稍后再试。' : 'This answer is still being generated. Please try again shortly.');
      if (!res.ok) {
        throw new Error(data.error || '大模型未能做出解答，请重试');
      }

      // 3. 追加 AI 答复
      updateMessages([...updatedMessages, { role: 'assistant' as const, content: data.reply, research: data.research }]);
      pending.current = null;
    } catch (err: any) {
      setInput(current => current.trim() ? current : userQuestion);
      setError(err?.message || '提问交互失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel as="div" className="space-y-4">
      <div className="border-b border-[var(--color-border)] pb-2.5 flex justify-between items-center">
        <h3 className="ui-panel-title">
          <span>{t('qa.title')}</span>
        </h3>
        <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)]">
          {t('qa.badge')}
        </span>
      </div>

      {/* 追问历史对话框 */}
      <div ref={thread} className="space-y-3 max-h-72 overflow-y-auto pr-1" onScroll={event => {
        const element = event.currentTarget;
        // A responsive reflow is not the reader deliberately scrolling upward.
        if (element.clientWidth !== threadWidth.current) return;
        followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
      }}>
        {messages.length === 0 ? (
          <div className="text-center py-6 text-xxs text-[var(--color-text-subtle)] font-medium border border-dashed border-[var(--color-border)] rounded-lg">
            {t('qa.empty').split('\n').map((line, index) => <React.Fragment key={line}>{index > 0 && <br />}{line}</React.Fragment>)}
          </div>
        ) : (
          <div className="space-y-3 text-xs leading-relaxed">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg flex flex-col space-y-1 ${
                  m.role === 'user'
                    ? 'bg-[var(--color-primary-soft)]  border border-[var(--color-primary)] align-end ml-6'
                    : 'bg-[var(--color-surface-muted)]  border border-[var(--color-border)]  mr-6'
                }`}
             >
                <span className="text-xxs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {m.role === 'user' ? t('qa.user') : t('qa.assistant')}
                </span>
                {m.role === 'assistant'
                  ? <MarkdownMessage content={m.content} />
                  : <p className="whitespace-pre-wrap font-normal text-[var(--color-text)]">{m.content}</p>}
                {m.role === 'assistant' && m.research && <ResearchEvidence research={m.research} chinese={language.startsWith('zh')} />}
              </div>
            ))}
          </div>
        )}

        {isSending && (
          <div role="status" className="text-xxs font-bold text-[var(--color-text-subtle)] flex items-center gap-2 pl-2">
            <span className="animate-pulse h-1.5 w-1.5 bg-[var(--color-primary)] rounded-full" />
            <span>{t('qa.loading')}</span>
          </div>
        )}

        {error && (
          <div role="alert" className="p-2.5 rounded bg-[var(--color-danger-soft)] text-xxs font-bold text-[var(--color-danger)] border border-[var(--color-danger)]">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 提问表单输入 */}
      <label className="ui-label"><Input type="checkbox" checked={webSearch} disabled={isSending} onChange={event => setWebSearch(event.target.checked)} />{language.startsWith('zh') ? '联网查找事件资料' : 'Search online for event information'}</label>
      <p id="qa-research-help" className="text-xs text-[var(--color-text-muted)]">{language.startsWith('zh') ? '可追问背景、具体言论、官方回应和后续进展；涉及新事实时会尝试联网，并列出实际检索来源。' : 'Ask about background, exact remarks, official responses or developments. New factual questions can use web research with visible sources.'}</p>
      <form onSubmit={handleSend} className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3 sm:flex-row">
        <Input
          type="text"
          required
          maxLength={2000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label={t('qa.title')}
          aria-describedby="qa-research-help"
          placeholder={t('qa.placeholder')}
          className="min-w-0 flex-1"
       />
        <Button variant="primary"
          type="submit"
          disabled={isSending || !input.trim() || activeModel.loading}
          aria-busy={isSending}
          className="flex-shrink-0"
       >
          {t('qa.ask')} · {activeModel.source === 'custom' ? '0' : activeModel.estimatedCost} {t('modelSelector.credits', '点')}
        </Button>
      </form>
    </Panel>
  );
}

function ResearchEvidence({ research, chinese }: { research: FollowupResearch; chinese: boolean }) {
  const labels = chinese ? {
    searched: '已检索事件资料', empty: '本轮检索未返回可用资料', unavailable: '本轮搜索未成功，未核实新事实', disabled: '本次未联网，依据现有材料回答', not_needed: '本次依据现有材料解读',
  } : { searched: 'Event research completed', empty: 'No usable sources returned', unavailable: 'Search unavailable; new facts were not verified', disabled: 'Web research off; existing material only', not_needed: 'Explanation from existing material' };
  return <div className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
    <p role="status">{labels[research.status]}</p>
    {research.disabledReason === 'model_offline' && <p className="mt-1">{chinese ? '当前模型关闭了联网，请在账号设置中选择启用联网的模型。' : 'This model has web research disabled. Select a web-enabled model in account settings.'}</p>}
    {research.disabledReason === 'deployment_disabled' && <p className="mt-1">{chinese ? '当前站点未开放此模型的联网功能。' : 'Web research for this model is disabled on this site.'}</p>}
    {!!research.queries.length && <details className="mt-2"><summary className="cursor-pointer">{chinese ? '查看检索关键词' : 'Search keywords'}</summary><ul className="mt-2 list-disc space-y-1 pl-5">{research.queries.map(query => <li key={query}>{query}</li>)}</ul></details>}
    {!!research.sources.length && <details className="mt-2"><summary className="cursor-pointer">{chinese ? `实际检索来源（${research.sources.length}）` : `Retrieved sources (${research.sources.length})`}</summary><ul className="mt-3 space-y-3">{research.sources.map(source => {
      const href = safeMarkdownHref(source.url);
      return href ? <li key={source.url}><a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-[var(--color-link)] underline">{source.title}</a><p className="mt-1">{source.kind === 'page' ? (chinese ? '已读取正文' : 'Page text read') : (chinese ? '仅检索摘要，未读到全文' : 'Search snippet; full text not read')}{source.publishedAt ? ` · ${source.publishedAt}` : ''}</p></li> : null;
    })}</ul></details>}
  </div>;
}
