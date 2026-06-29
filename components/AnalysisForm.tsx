import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { AnalysisMode } from '../lib/types';
import ModeSelector from './ModeSelector';

interface AnalysisFormProps {
  onSubmit: (data: {
    title: string;
    source: string;
    date: string;
    content: string;
    focus: string;
    mode: AnalysisMode;
  }) => void;
  isLoading: boolean;
}

export default function AnalysisForm({ onSubmit, isLoading }: AnalysisFormProps) {
  const { status } = useSession();
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [date, setDate] = useState('');
  const [content, setContent] = useState('');
  const [focus, setFocus] = useState('');
  const [mode, setMode] = useState<AnalysisMode>('quick');
  const [urlInput, setUrlInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const handleParseUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    try { new URL(trimmed); } catch {
      setParseError('URL 格式无效');
      return;
    }

    setIsParsing(true);
    setParseError('');

    try {
      const res = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error || '解析失败');
        return;
      }

      if (data.title) setTitle(data.title);
      if (data.source) setSource(data.source);
      if (data.date) setDate(data.date);
      if (data.content) setContent(data.content);
    } catch {
      setParseError('网络错误，请重试');
    } finally {
      setIsParsing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleParseUrl();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content.trim().length < 50) return;
    onSubmit({ title, source, date, content, focus, mode });
  };

  const isFormValid = content.trim().length >= 50;

  return (
    <div className="animated-panel space-y-4 bg-white dark:bg-gray-950 p-3 sm:p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-shadow duration-300">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-900 pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-gray-950 dark:text-white">新闻审视输入</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">输入新闻正文和关注点，系统会生成总结、评分和结构化审视记录。</p>
        </div>
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xxs font-bold text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
          {status === 'authenticated' ? '已登录' : '需登录'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
        {/* URL 自动解析区 */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            网页链接自动解析
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setParseError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="粘贴新闻链接，点击自动填充标题、来源、日期和正文..."
              className="interactive-lift min-w-0 flex-1 px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
            <button
              type="button"
              onClick={handleParseUrl}
              disabled={isParsing || !urlInput.trim()}
              className="interactive-lift justify-center px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {isParsing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  解析中
                </>
              ) : (
                '自动填充'
              )}
            </button>
          </div>
          {parseError && (
            <p className="text-xs text-red-500">{parseError}</p>
          )}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-800" /></div>
          <div className="relative flex justify-center"><span className="bg-white dark:bg-gray-950 px-3 text-xs text-gray-400">或手动输入</span></div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="title" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              新闻标题
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：某科技巨头发布全新 AI 芯片"
              className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="source" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              新闻来源
            </label>
            <input
              id="source"
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="例：环球时报 / 联合早报 / 自媒体"
              className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="date" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              发布时间
            </label>
            <input
              id="date"
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="例：2026-06-28 或 刚刚"
              className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="content" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            新闻正文 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            required
            placeholder="请粘贴完整新闻正文进行审视分析（最少 50 字符，超长内容会自动截断）..."
            className="interactive-lift w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed dark:text-white"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>最少 50 字符</span>
            <span>当前字数: {content.length}</span>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="focus" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            我的关注点（可选）
          </label>
          <input
            id="focus"
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="例：分析背后的地缘政治动机 / 利益输送嫌疑 / 科学数据是否有偏倚"
            className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
          />
        </div>

        <ModeSelector selectedMode={mode} onSelectMode={setMode} />

        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className={`interactive-lift w-full py-2.5 px-4 rounded-lg font-semibold text-sm shadow-sm transition duration-150 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:cursor-not-allowed disabled:hover:transform-none ${
            isFormValid
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-lg hover:shadow-indigo-500/20'
              : 'bg-gray-300 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
          }`}
        >
          {isLoading ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-white/90 step-pulse" />
              九镜审读中...
            </>
          ) : (
            '开始审视'
          )}
        </button>
      </form>
    </div>
  );
}
