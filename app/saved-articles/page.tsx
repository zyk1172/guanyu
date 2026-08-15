'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';

export default function SavedArticlesPage() {
  const { language, t } = useUiLanguage();
  const [items, setItems] = useState<Array<{ id: string; title: string; source: string; url: string; createdAt: string }>>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/saved-articles', { cache: 'no-store' });
      if (!response.ok) throw new Error('failed');
      const data = await response.json();
      setItems(data.items || []);
    } catch {
      setStatus(t('saved.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    const response = await fetch(`/api/saved-articles/${id}`, { method: 'DELETE' });
    if (!response.ok) return;
    setItems((current) => current.filter((item) => item.id !== id));
    setStatus(t('saved.deleted'));
  };

  const clearAll = async () => {
    if (!window.confirm(t('saved.confirmClear'))) return;
    const response = await fetch('/api/saved-articles', { method: 'DELETE' });
    if (!response.ok) return;
    setItems([]);
    setStatus(t('saved.deleted'));
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans">
      <Header />
      <section className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-black text-gray-950 dark:text-white">{t('saved.title')}</h1>
          <div className="flex gap-2">
            {items.length > 0 && (
              <button onClick={clearAll} className="rounded border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 dark:border-red-900">
                {t('saved.clear')}
              </button>
            )}
            <Link href="/" className="rounded border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 dark:border-gray-800 dark:text-gray-300">
              {t('common.backHome')}
            </Link>
          </div>
        </div>
        {status && <p className="mb-3 text-xs font-semibold text-gray-500">{status}</p>}
        {loading ? (
          <p className="text-xs text-gray-400">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <div className="rounded border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400 dark:border-gray-800">
            {t('saved.empty')}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                <div className="min-w-0">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-sm font-bold text-gray-900 hover:underline dark:text-white">
                    {item.title}
                  </a>
                  <p className="mt-1 text-xxs text-gray-400">{item.source} · {new Date(item.createdAt).toLocaleString(language)}</p>
                </div>
                <button onClick={() => remove(item.id)} className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs font-bold text-gray-500 dark:border-gray-800">
                  {t('saved.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
