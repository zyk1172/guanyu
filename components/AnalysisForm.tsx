import React, { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AnalysisMode, REPORT_LANGUAGE_OPTIONS, ReportLanguage, normalizeReportLanguage } from '../lib/types';

interface AnalysisFormProps {
  onSubmit: (data: {
    title: string;
    source: string;
    content: string;
    focus: string;
    mode: AnalysisMode;
    reportLanguage: ReportLanguage;
  }) => void;
  isLoading: boolean;
}

function explainParseFailure(message: string) {
  const error = String(message || '').trim();
  if (/URL 格式|缺少 URL/.test(error)) {
    return {
      reason: '链接格式无效',
      explanation: '链接可能不完整，或并非标准的 http/https 新闻地址。',
    };
  }
  if (/内网|localhost|协议/.test(error)) {
    return {
      reason: '链接因安全限制未被抓取',
      explanation: '为保护你的网络安全，系统不会访问内网、设备地址或非网页协议。',
    };
  }
  if (/状态码 401|状态码 403|状态码 429|登录墙|访问被拒/.test(error)) {
    return {
      reason: '该网站拒绝了自动访问',
      explanation: '该页面可能要求登录、限制自动抓取，或临时触发了访问频率限制。',
    };
  }
  if (/状态码 404|状态码 410/.test(error)) {
    return {
      reason: '新闻链接已失效或无法找到',
      explanation: '原页面可能被删除、迁移，或链接地址不再有效。',
    };
  }
  if (/超时|Timeout|Abort/.test(error)) {
    return {
      reason: '网站响应超时',
      explanation: '新闻站点响应较慢、网络不稳定或页面内容过大，导致系统未能在限定时间内完成抓取。',
    };
  }
  if (/网络错误|网络连接|Failed to fetch/.test(error)) {
    return {
      reason: '网络连接未完成',
      explanation: '浏览器暂时无法连接到解析服务，或目标网站的网络连接中断。',
    };
  }
  if (/状态码 5\d\d|服务器/.test(error)) {
    return {
      reason: '解析服务暂时不可用',
      explanation: '服务端或目标网站出现临时异常，稍后重试通常可以恢复。',
    };
  }
  if (/内容过少|无法提取正文|动态渲染|不是网页|体积过大/.test(error)) {
    return {
      reason: '未识别到可用的新闻正文',
      explanation: '该页面可能依赖浏览器脚本渲染、包含付费墙，或主要内容不是可直接读取的文字新闻。',
    };
  }
  return {
    reason: '自动解析暂时未完成',
    explanation: error || '网站页面结构或网络响应暂时不适合自动抓取。',
  };
}

export default function AnalysisForm({ onSubmit, isLoading }: AnalysisFormProps) {
  const { status } = useSession();
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [focus, setFocus] = useState('');
  const [reportLanguage, setReportLanguage] = useState<ReportLanguage>('zh-CN');
  const mode: AnalysisMode = 'deep';
  const [urlInput, setUrlInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseFailure, setParseFailure] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/account/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.defaultReportLanguage) {
          setReportLanguage(normalizeReportLanguage(data.defaultReportLanguage));
        }
      })
      .catch(() => undefined);
  }, [status]);

  const handleParseUrl = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    try { new URL(trimmed); } catch {
      setParseFailure('URL 格式无效');
      return;
    }

    setIsParsing(true);
    setParseFailure(null);

    try {
      const res = await fetch('/api/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setParseFailure(data.error || '解析失败');
        return;
      }

      if (data.title) setTitle(data.title);
      if (data.source) setSource(data.source);
      if (data.content) setContent(data.content);
    } catch {
      setParseFailure('网络错误，请重试');
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
    onSubmit({ title, source, content, focus, mode, reportLanguage });
  };

  const isFormValid = content.trim().length >= 50;
  const parseFailureInfo = parseFailure ? explainParseFailure(parseFailure) : null;

  const focusManualContent = () => {
    setParseFailure(null);
    requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      contentRef.current?.focus();
    });
  };

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
              onChange={(e) => { setUrlInput(e.target.value); setParseFailure(null); }}
              onKeyDown={handleKeyDown}
              placeholder="粘贴新闻链接，点击自动填充标题、来源和正文..."
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
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200 dark:border-gray-800" /></div>
          <div className="relative flex justify-center"><span className="bg-white dark:bg-gray-950 px-3 text-xs text-gray-400">或手动输入</span></div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        </div>

        <div className="space-y-1">
          <label htmlFor="content" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            新闻正文 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="content"
            ref={contentRef}
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="report-language" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              报告输出语言
            </label>
            <select
              id="report-language"
              value={reportLanguage}
              onChange={(e) => setReportLanguage(normalizeReportLanguage(e.target.value))}
              className="interactive-lift w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            >
              {REPORT_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xxs text-gray-400">影响本次报告、摘要、核验说明和后续追问；不会改变原始新闻正文。</p>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold leading-relaxed text-[var(--color-text)]">
          每个账号每天 3 次免费审视；免费额度用完后，每次观隅分析消耗 3 点。5 分钟内最多生成 3 份报告。
        </div>

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
              观隅分析中...
            </>
          ) : (
            '开始观隅分析'
          )}
        </button>
      </form>

      {parseFailure && parseFailureInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="parse-failure-title"
          aria-describedby="parse-failure-description"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setParseFailure(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-warning)]" aria-hidden="true">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 id="parse-failure-title" className="text-sm font-black text-[var(--color-text)]">抱歉，网页自动解析失败</h3>
                  <button type="button" onClick={() => setParseFailure(null)} className="rounded p-1 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]" aria-label="关闭提示">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>
                  </button>
                </div>
                <p className="mt-2 text-xs font-bold text-[var(--color-text)]">原因：{parseFailureInfo.reason}</p>
                <p id="parse-failure-description" className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{parseFailureInfo.explanation}</p>
                <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  不影响继续审视。请在原页面复制新闻正文，粘贴到下方“新闻正文”输入框；标题和来源也可以手动补充。
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setParseFailure(null); handleParseUrl(); }} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)]">
                再试一次
              </button>
              <button type="button" onClick={focusManualContent} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98]">
                手动粘贴正文
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
