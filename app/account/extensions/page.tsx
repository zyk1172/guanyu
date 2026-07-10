'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';

interface ExtensionSession {
  id: string;
  name: string;
  browser?: string | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export default function ExtensionSettingsPage() {
  const { language, t } = useUiLanguage();
  const [sessions, setSessions] = useState<ExtensionSession[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadOrigin, setDownloadOrigin] = useState('');
  const extensionDownloadPath = '/downloads/guanyu-browser-extension.zip';
  const extensionDownloadUrl = downloadOrigin ? `${downloadOrigin}${extensionDownloadPath}` : extensionDownloadPath;

  async function loadSessions() {
    const res = await fetch('/api/extension/sessions');
    if (res.status === 401) {
      setMessage('请先登录后管理插件授权。');
      return;
    }
    if (res.ok) setSessions(await res.json());
  }

  async function createCode() {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/extension/link-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '生成插件连接码失败。');
        return;
      }
      setCode(data.code);
      setMessage('连接码已生成，有效期 10 分钟，只显示一次。');
      await loadSessions();
    } finally {
      setLoading(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('确定撤销这个插件授权吗？')) return;
    const res = await fetch(`/api/extension/sessions/${id}/revoke`, { method: 'POST' });
    if (res.ok) {
      await loadSessions();
      setMessage('插件授权已撤销。');
    }
  }

  useEffect(() => {
    loadSessions();
    setDownloadOrigin(window.location.origin);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-gray-980 dark:text-white">
      <Header />
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-black sm:text-2xl">{t('extension.title')}</h1>
            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t('extension.description')}
            </p>
          </div>
          <Link href="/account" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-white dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
            {t('extension.backAccount')}
          </Link>
        </div>

        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-black text-[var(--color-text)]">{t('extension.downloadTitle')}</h2>
              <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                {t('extension.downloadDescription')}
              </p>
              <code className="mt-3 block break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xxs font-semibold text-[var(--color-text)]">
                {extensionDownloadUrl}
              </code>
            </div>
            <a
              href={extensionDownloadPath}
              download
              className="inline-flex shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--color-primary)] px-4 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98]"
            >
              {t('extension.download')}
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-gray-150 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black">{t('extension.codeTitle')}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('extension.codeDescription')}
              </p>
            </div>
            <button
              onClick={createCode}
              disabled={loading}
              className="rounded-lg bg-gray-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950"
            >
              {loading ? t('extension.creatingCode') : t('extension.createCode')}
            </button>
          </div>
          {code && (
            <div className="mt-4 rounded-xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)] p-4 text-center shadow-[var(--shadow-card)]">
              <div className="rounded-lg bg-white px-4 py-3 text-3xl font-black tracking-[0.32em] text-gray-950 shadow-inner">{code}</div>
              <p className="mt-2 text-xs font-black text-white">只显示一次，请不要公开分享。</p>
            </div>
          )}
          {message && <p className="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-300">{message}</p>}
        </div>

        <div className="mt-4 rounded-xl border border-gray-150 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-950">
          <h2 className="text-sm font-black">{t('extension.sessionsTitle')}</h2>
          <div className="mt-3 space-y-2">
            {sessions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400 dark:border-gray-800">
                {t('extension.noSessions')}
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 text-xs dark:border-gray-850 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-black text-gray-950 dark:text-white">{session.name}</div>
                    <div className="mt-1 text-xxs text-gray-500">
                      {session.browser || t('common.unknown')} · {new Date(session.createdAt).toLocaleString(language)}
                      {session.lastUsedAt ? ` · ${new Date(session.lastUsedAt).toLocaleString(language)}` : ''}
                    </div>
                  </div>
                  {session.revokedAt ? (
                    <span className="rounded bg-gray-100 px-2 py-1 text-xxs font-bold text-gray-500 dark:bg-gray-900">{t('extension.revoked')}</span>
                  ) : (
                    <button onClick={() => revoke(session.id)} className="rounded bg-red-50 px-3 py-1.5 text-xxs font-bold text-red-600 transition hover:bg-red-100">
                      {t('extension.revoke')}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
