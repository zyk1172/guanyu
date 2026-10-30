'use client';

import { Button, Input, Panel } from '@/components/ui/controls';
import React, { useState } from 'react';
import { useUiLanguage } from './LanguageProvider';
import { useActiveModel } from './useActiveModel';

function safeMarkdownHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
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
  const activeModel = useActiveModel('followup');
  const messages = controlledMessages ?? localMessages;
  const updateMessages = (nextMessages: ChatMessage[]) => {
    if (onMessagesChange) onMessagesChange(nextMessages);
    else setLocalMessages(nextMessages);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userQuestion = input.trim();
    setInput('');
    setError(null);

    // 1. 本地立即追加用户消息
    const updatedMessages = [...messages, { role: 'user' as const, content: userQuestion }];
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
          requestId: crypto.randomUUID(),
          chatHistory: messages,
          interfaceLanguage: language,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '大模型未能做出解答，请重试');
      }

      // 3. 追加 AI 答复
      updateMessages([...updatedMessages, { role: 'assistant' as const, content: data.reply }]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '提问交互失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel as="div" className="space-y-4">
      <div className="border-b border-[var(--color-border)] pb-2.5 flex justify-between items-center">
        <h3 className="text-xs font-bold text-[var(--color-text)] uppercase tracking-wider flex items-center gap-1.5">
          <span>💬 {t('qa.title')}</span>
        </h3>
        <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)]">
          {t('qa.badge')}
        </span>
      </div>

      {/* 追问历史对话框 */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
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
                  {m.role === 'user' ? `👤 ${t('qa.user')}` : `🤖 ${t('qa.assistant')}`}
                </span>
                {m.role === 'assistant'
                  ? <MarkdownMessage content={m.content} />
                  : <p className="whitespace-pre-wrap font-normal text-[var(--color-text)]">{m.content}</p>}
              </div>
            ))}
          </div>
        )}

        {isSending && (
          <div className="text-xxs font-bold text-[var(--color-text-subtle)] flex items-center gap-2 pl-2">
            <span className="animate-pulse h-1.5 w-1.5 bg-[var(--color-primary)] rounded-full" />
            <span>{t('qa.loading')}</span>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded bg-[var(--color-danger-soft)] text-xxs font-bold text-[var(--color-danger)] border border-[var(--color-danger)]">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 提问表单输入 */}
      <form onSubmit={handleSend} className="flex gap-2 border-t border-[var(--color-border)] pt-3">
        <Input
          type="text"
          required
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label={t('qa.title')}
          placeholder={t('qa.placeholder')}
          className="flex-1"
       />
        <Button variant="primary"
          type="submit"
          disabled={isSending || !input.trim() || activeModel.loading}
          className="flex-shrink-0"
       >
          {t('qa.ask')} · {activeModel.source === 'custom' ? '0' : activeModel.estimatedCost} {t('modelSelector.credits', '点')}
        </Button>
      </form>
    </Panel>
  );
}
