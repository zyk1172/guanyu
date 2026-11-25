'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import AdminBackLink from '@/components/AdminBackLink';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import { Button, ButtonLink, Input, Panel, Select } from '@/components/ui/controls';
import { relatedCoverageCopy } from '@/lib/related-coverage-copy';
import { THINKING_DEPTH_OPTIONS, getReportLanguageLabel, getThinkingDepthLabel } from '@/lib/types';
import { useSession } from 'next-auth/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface AuditRow {
  id: string;
  title: string;
  newsSummary: string;
  createdAt: string;
  isPublic: boolean;
  reportLanguage: string;
  reasoningDepth: string;
  analysisMode: string;
  user?: { email: string };
}

export default function AuditManagementList({ scope, initialSearch }: { scope: 'own' | 'site'; initialSearch: string }) {
  const { confirm } = useConfirmation();
  const { status } = useSession();
  const { language, t } = useUiLanguage();
  const zh = language.startsWith('zh');
  const [myAudits, setMyAudits] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isFetchingAudits, setIsFetchingAudits] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [mutating, setMutating] = useState(false);
  const requestId = useRef('');
  const currentLoad = useRef<AbortController | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [submittedSearch, setSubmittedSearch] = useState(initialSearch);
  const [modeFilter, setModeFilter] = useState('');
  const [depthFilter, setDepthFilter] = useState('');
  const [publicFilter, setPublicFilter] = useState('');

  const load = useCallback(async (cursor?: string) => {
    currentLoad.current?.abort();
    const controller = new AbortController();
    currentLoad.current = controller;
    setIsFetchingAudits(true);
    setError('');
    setSelected([]);
    try {
      const params = new URLSearchParams({ scope, search: submittedSearch, mode: modeFilter, depth: depthFilter, isPublic: publicFilter });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/audits/manage?${params}`, { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error);
      setMyAudits(result.items);
      setNextCursor(result.nextCursor);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Request failed');
    } finally {
      if (!controller.signal.aborted) setIsFetchingAudits(false);
    }
  }, [scope, submittedSearch, modeFilter, depthFilter, publicFilter]);

  useEffect(() => {
    void load();
    return () => currentLoad.current?.abort();
  }, [load]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (search === submittedSearch) void load();
    else setSubmittedSearch(search);
  };

  async function apply(ids: string[], action: 'publish' | 'unpublish' | 'delete') {
    if (mutating || !ids.length) return;
    if (action === 'delete' && !await confirm(zh ? `永久删除所选的 ${ids.length} 份报告？` : `Permanently delete ${ids.length} selected reports?`)) return;
    setMutating(true);
    setError('');
    const fingerprint = JSON.stringify([action, ids, scope]);
    const retryKey = `${fingerprint}:`;
    if (!requestId.current.startsWith(retryKey)) requestId.current = retryKey + crypto.randomUUID();
    try {
      const response = await fetch('/api/audits/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ids, action, requestId: requestId.current.slice(retryKey.length) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      requestId.current = '';
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Request failed');
    } finally {
      setMutating(false);
    }
  }

  if (status === 'loading') {
    return <div className="min-h-screen grid place-items-center">{t('myAudits.loading')}</div>;
  }

  const getDepthLabel = (depth: string) => getThinkingDepthLabel(depth, language);

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'quick': return t('myAudits.historyQuick');
      case 'deep': return t('myAudits.analysis');
      default: return mode;
    }
  };

  return (
    <main className="workspace-page pb-12">
      <Header />

      <div id="main-content" tabIndex={-1} className="workspace-container workspace-content space-y-6">
        {scope === 'site' && <AdminBackLink />}
        <p className="text-sm text-[var(--color-text-muted)]">{relatedCoverageCopy(language).listHint}</p>
        <div>
          <h1 className="ui-page-title">{scope === 'own' ? t('myAudits.title') : zh ? '全站报告管理' : 'Site reports'}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">{t('myAudits.description')}</p>
        </div>

        {/* 紧凑型筛选工具栏 */}
        <Panel as="div" className="space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('myAudits.searchPlaceholder')}
              aria-label={t('myAudits.searchPlaceholder')}
              className="flex-1"
           />
            <Button variant="primary"
              type="submit"
           >
              {t('myAudits.search')}
            </Button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="space-y-2">
              <label htmlFor="audit-modeFilter" className="ui-label block text-[var(--color-text-muted)]">{t('myAudits.type')}</label>
              <Select
                id="audit-modeFilter"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="w-full"
             >
                <option value="">{t('myAudits.allModes')}</option>
                <option value="quick">{t('myAudits.historyQuick')}</option>
                <option value="deep">{t('myAudits.analysis')}</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="audit-depthFilter" className="ui-label block text-[var(--color-text-muted)]">{t('myAudits.thinkingDepth')}</label>
              <Select
                id="audit-depthFilter"
                value={depthFilter}
                onChange={(e) => setDepthFilter(e.target.value)}
                className="w-full"
             >
                <option value="">{t('myAudits.allDepths')}</option>
                <option value="quick">{language === 'en-US' ? 'Quick' : '快速'}</option>
                {THINKING_DEPTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{t(`thinking.${option.value}`)}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="audit-publicFilter" className="ui-label block text-[var(--color-text-muted)]">{t('myAudits.visibility')}</label>
              <Select
                id="audit-publicFilter"
                value={publicFilter}
                onChange={(e) => setPublicFilter(e.target.value)}
                className="w-full"
             >
                <option value="">{t('myAudits.allVisibility')}</option>
                <option value="true">{t('common.public')}</option>
                <option value="false">{t('common.private')}</option>
              </Select>
            </div>
          </div>
        </Panel>

        {error && <p role="alert">{error} <Button variant="ghost" onClick={() => void load()}>{zh ? '重试读取' : 'Retry loading'}</Button></p>}
        {!!selected.length && <div className="flex flex-wrap items-center gap-2">
          <span>{zh ? `已选 ${selected.length} 份报告` : `${selected.length} reports selected`}</span>
          <Button disabled={mutating} onClick={() => void apply(selected, 'publish')}>{zh ? '公开所选' : 'Publish selected'}</Button>
          <Button disabled={mutating} onClick={() => void apply(selected, 'unpublish')}>{zh ? '撤回所选' : 'Unpublish selected'}</Button>
          <Button variant="danger" disabled={mutating} onClick={() => void apply(selected, 'delete')}>{zh ? '删除所选' : 'Delete selected'}</Button>
        </div>}
        {isFetchingAudits ? (
          <div className="text-center py-16 text-sm text-[var(--color-text-subtle)] animate-pulse font-semibold">{t('myAudits.loadingHistory')}</div>
        ) : myAudits.length === 0 ? (
          <div className="bg-[var(--color-surface)] p-12 text-center text-xs text-[var(--color-text-subtle)] rounded-xl border border-dashed border-[var(--color-border)]">
            {t('myAudits.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {myAudits.map((audit) => (
              <Panel as="div"
                key={audit.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 transition"
             >
                <div className="space-y-1 md:max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ui-badge text-[var(--color-link)] bg-[var(--color-primary-soft)]">
                      {t('myAudits.thinking', undefined, { depth: getDepthLabel(audit.reasoningDepth) })}
                    </span>
                    <span className="ui-badge text-[var(--color-text-muted)] bg-[var(--color-surface)]">
                      {getModeLabel(audit.analysisMode)}
                    </span>
                    <span className="ui-badge text-[var(--color-link)] bg-[var(--color-primary-soft)]">
                      {getReportLanguageLabel(audit.reportLanguage, language)}
                    </span>
                    <span className="text-xxs text-[var(--color-text-subtle)] font-semibold">{new Date(audit.createdAt).toLocaleDateString(language)}</span>
                  </div>
                  {audit.user && <p>{audit.user.email}</p>}
                  <h4 className="text-sm font-bold text-[var(--color-text)]">{audit.title}</h4>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-1">{audit.newsSummary}</p>
                </div>

                <div className="flex items-center gap-2.5 justify-end text-xs font-bold flex-wrap">
                  <label className="flex min-h-11 items-center gap-2">
                    <Input type="checkbox" checked={selected.includes(audit.id)} aria-label={zh ? `选择 ${audit.title}` : `Select ${audit.title}`}
                      onChange={event => setSelected(previous => event.target.checked ? [...previous, audit.id] : previous.filter(id => id !== audit.id))} />
                    {zh ? '选择' : 'Select'}
                  </label>
                  <Button variant="secondary" disabled={mutating} aria-pressed={audit.isPublic}
                    onClick={() => void apply([audit.id], audit.isPublic ? 'unpublish' : 'publish')}
                 >
                    {audit.isPublic ? t('common.public') : t('common.private')}
                  </Button>

                  <ButtonLink variant="primary"
                    href={`/audits/${audit.id}`}
                 >
                    {t('common.viewDetails')}
                  </ButtonLink>

                  <Button variant="danger"
                    disabled={mutating} onClick={() => void apply([audit.id], 'delete')}
                 >
                    {t('common.delete')}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        )}
        <nav className="flex flex-wrap gap-2" aria-label={zh ? '报告分页' : 'Report pages'}>
          <Button disabled={isFetchingAudits || mutating} onClick={() => void load()}>{zh ? '返回首页' : 'First page'}</Button>
          {nextCursor && <Button disabled={isFetchingAudits || mutating} onClick={() => void load(nextCursor)}>{zh ? '下一页' : 'Next page'}</Button>}
        </nav>
      </div>
    </main>
  );
}
