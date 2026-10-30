'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import { Button, ButtonLink } from '@/components/ui/controls';
import { useCallback, useEffect, useState } from 'react';

export default function SavedArticlesPage() {
  const { confirm } = useConfirmation();
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
    if (!await confirm(t('saved.confirmClear'))) return;
    const response = await fetch('/api/saved-articles', { method: 'DELETE' });
    if (!response.ok) return;
    setItems([]);
    setStatus(t('saved.deleted'));
  };

  return (
    <main className="workspace-page pb-12">
      <Header />
      <section id="main-content" tabIndex={-1} className="workspace-container workspace-content">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="ui-page-title">{t('saved.title')}</h1>
          <div className="flex gap-2">
            {items.length > 0 && (
              <Button variant="danger-ghost" onClick={clearAll}>
                {t('saved.clear')}
              </Button>
            )}
            <ButtonLink variant="secondary" href="/">
              {t('common.backHome')}
            </ButtonLink>
          </div>
        </div>
        {status && <p className="mb-3 text-xs font-semibold text-[var(--color-text-muted)]">{status}</p>}
        {loading ? (
          <p className="text-xs text-[var(--color-text-subtle)]">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-text-subtle)]">
            {t('saved.empty')}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="min-w-0">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-sm font-bold text-[var(--color-text)] hover:underline">
                    {item.title}
                  </a>
                  <p className="mt-1 text-xxs text-[var(--color-text-subtle)]">{item.source} · {new Date(item.createdAt).toLocaleString(language)}</p>
                </div>
                <Button variant="secondary" onClick={() => remove(item.id)} className="shrink-0">
                  {t('saved.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
