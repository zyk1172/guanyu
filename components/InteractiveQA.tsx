'use client';

import React, { useState } from 'react';

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
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          chatHistory: messages,
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
          <span>💬 对本篇报告进行交互式深入追问</span>
        </h3>
        <span className="text-xxs font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
          多轮推敲
        </span>
      </div>

      {/* 追问历史对话框 */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="text-center py-6 text-xxs text-gray-400 dark:text-gray-500 font-medium border border-dashed border-gray-100 dark:border-gray-900 rounded-lg">
            对替代解释有疑问？想追问证据链？
            <br />
            在下方输入框直接提问，AI 助手将基于原文、审视报告和联网线索为您解答。
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
                  {m.role === 'user' ? '👤 我的问题' : '🤖 审视助手解答'}
                </span>
                <p className="text-gray-700 dark:text-gray-300 font-normal whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
        )}

        {isSending && (
          <div className="text-xxs font-bold text-gray-400 flex items-center gap-2 pl-2">
            <span className="animate-pulse h-1.5 w-1.5 bg-indigo-500 rounded-full" />
            <span>AI 正在研判博弈事实、核对关联线索并撰写深度答复中...</span>
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
          placeholder="例：为什么这个替代解释只有 45% 置信度？原文里哪些信息支持或削弱它？"
          className="flex-1 px-3 py-2 border border-gray-250 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 dark:text-white"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-850 text-white rounded-lg font-bold text-xs shadow-sm transition flex-shrink-0"
        >
          追问
        </button>
      </form>
    </div>
  );
}
