'use client';

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
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^\)\n]+\))/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = keyPrefix + '-inline-' + tokenIndex++;

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key} className="font-bold text-gray-900 dark:text-gray-100">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key} className="rounded bg-gray-200/70 px-1 py-0.5 font-mono text-[0.92em] dark:bg-gray-800">{token.slice(1, -1)}</code>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = linkMatch ? safeMarkdownHref(linkMatch[2].trim()) : null;
      nodes.push(href && linkMatch
        ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 underline underline-offset-2 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">{linkMatch[1]}</a>
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
        <pre key={key} className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-950 p-3 text-[11px] leading-relaxed text-gray-100 dark:border-gray-800">
          <code data-language={language || undefined}>{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const classes = level <= 2
        ? 'text-sm font-black text-gray-950 dark:text-white'
        : level === 3
          ? 'text-[13px] font-extrabold text-gray-900 dark:text-gray-100'
          : 'text-xs font-bold text-gray-900 dark:text-gray-100';
      blocks.push(<div key={key} role="heading" aria-level={level} className={classes}>{renderMarkdownInline(heading[2], key)}</div>);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} className="border-gray-200 dark:border-gray-800" />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quoteLines.push(lines[index++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={key} className="border-l-2 border-indigo-300 pl-3 text-gray-600 dark:border-indigo-700 dark:text-gray-300">
          {quoteLines.map((quote, quoteIndex) => <React.Fragment key={key + '-quote-' + quoteIndex}>{quoteIndex > 0 && <br />}{renderMarkdownInline(quote, key + '-quote-' + quoteIndex)}</React.Fragment>)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ''));
      blocks.push(
        <ul key={key} className="list-disc space-y-1 pl-5 marker:text-gray-400">
          {items.map((item, itemIndex) => <li key={key + '-item-' + itemIndex}>{renderMarkdownInline(item, key + '-item-' + itemIndex)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(
        <ol key={key} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-gray-500">
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

  return <div className="space-y-2.5 break-words text-gray-700 dark:text-gray-300">{blocks}</div>;
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
    <div className="bg-white dark:bg-gray-950 p-5 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-4">
      <div className="border-b border-gray-100 dark:border-gray-900 pb-2.5 flex justify-between items-center">
        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
          <span>💬 {t('qa.title')}</span>
        </h3>
        <span className="text-xxs font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
          {t('qa.badge')}
        </span>
      </div>

      {/* 追问历史对话框 */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="text-center py-6 text-xxs text-gray-400 dark:text-gray-500 font-medium border border-dashed border-gray-100 dark:border-gray-900 rounded-lg">
            {t('qa.empty').split('\n').map((line, index) => <React.Fragment key={line}>{index > 0 && <br />}{line}</React.Fragment>)}
          </div>
        ) : (
          <div className="space-y-3 text-xs leading-relaxed">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg flex flex-col space-y-1 ${
                  m.role === 'user'
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/15 border border-indigo-100/30 align-end ml-6'
                    : 'bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 mr-6'
                }`}
              >
                <span className="text-xxs font-bold uppercase tracking-wider text-gray-400">
                  {m.role === 'user' ? `👤 ${t('qa.user')}` : `🤖 ${t('qa.assistant')}`}
                </span>
                {m.role === 'assistant'
                  ? <MarkdownMessage content={m.content} />
                  : <p className="whitespace-pre-wrap font-normal text-gray-700 dark:text-gray-300">{m.content}</p>}
              </div>
            ))}
          </div>
        )}

        {isSending && (
          <div className="text-xxs font-bold text-gray-400 flex items-center gap-2 pl-2">
            <span className="animate-pulse h-1.5 w-1.5 bg-indigo-500 rounded-full" />
            <span>{t('qa.loading')}</span>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded bg-red-50 dark:bg-red-950/10 text-xxs font-bold text-red-600 border border-red-100 dark:border-red-900/30">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 提问表单输入 */}
      <form onSubmit={handleSend} className="flex gap-2 border-t border-gray-100 dark:border-gray-900 pt-3">
        <input
          type="text"
          required
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('qa.placeholder')}
          className="flex-1 px-3 py-2 border border-gray-250 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 dark:text-white"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim() || activeModel.loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-850 text-white rounded-lg font-bold text-xs shadow-sm transition flex-shrink-0"
        >
          {t('qa.ask')} · {activeModel.source === 'custom' ? '0' : activeModel.estimatedCost} {t('modelSelector.credits', '点')}
        </button>
      </form>
    </div>
  );
}
