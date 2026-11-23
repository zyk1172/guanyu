'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import { Button, ButtonLink, Input, Panel, Select } from '@/components/ui/controls';
import { relatedCoverageCopy } from '@/lib/related-coverage-copy';
import { THINKING_DEPTH_OPTIONS, getReportLanguageLabel, getThinkingDepthLabel } from '@/lib/types';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

export default function MyAuditsPage() {
  const { confirm } = useConfirmation();
  const { data: session, status } = useSession();
  const router = useRouter();
  const { language, t } = useUiLanguage();

  const [myAudits, setMyAudits] = useState<any[]>([]);
  const [isFetchingAudits, setIsFetchingAudits] = useState(false);

  // 搜索和筛选状态
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [depthFilter, setDepthFilter] = useState('');
  const [publicFilter, setPublicFilter] = useState('');

  // 1. 登录守卫
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // 2. 加载记录
  const fetchMyAudits = useCallback(async () => {
    if (!session) return;
    setIsFetchingAudits(true);
    try {
      const params = new URLSearchParams();
      if (submittedSearch) params.append('search', submittedSearch);
      if (modeFilter) params.append('mode', modeFilter);
      if (depthFilter) params.append('depth', depthFilter);
      if (publicFilter) params.append('isPublic', publicFilter);

      const res = await fetch(`/api/audits/my?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMyAudits(data);
      }
    } catch (err) {
      console.error('获取我的审视历史失败:', err);
    } finally {
      setIsFetchingAudits(false);
    }
  }, [session, submittedSearch, modeFilter, depthFilter, publicFilter]);

  useEffect(() => {
    void fetchMyAudits();
  }, [fetchMyAudits]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search === submittedSearch) void fetchMyAudits();
    else setSubmittedSearch(search);
  };

  // 3. 修改公开状态
  const toggleAuditPublic = async (id: string, currentPublic: boolean) => {
    try {
      const res = await fetch(`/api/audits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !currentPublic }),
      });
      if (res.ok) {
        setMyAudits((prev) =>
          prev.map((audit) =>
            audit.id === id ? { ...audit, isPublic: !currentPublic } : audit
          )
        );
      }
    } catch (err) {
      console.error('修改公开状态失败:', err);
    }
  };

  // 4. 删除审视
  const handleDeleteAudit = async (id: string) => {
    if (!await confirm(t('myAudits.deleteConfirm'))) return;

    try {
      const res = await fetch(`/api/audits/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMyAudits((prev) => prev.filter((audit) => audit.id !== id));
      }
    } catch (err) {
      console.error('删除审视失败:', err);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--color-surface-muted)] flex items-center justify-center">
        <div className="text-sm font-semibold text-[var(--color-text-muted)] animate-pulse">{t('myAudits.loading')}</div>
      </div>
    );
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
        <p className="text-sm text-[var(--color-text-muted)]">{relatedCoverageCopy(language).listHint}</p>
        <div>
          <h1 className="ui-page-title">{t('myAudits.title')}</h1>
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

        {/* 审视历史列表 */}
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
                  <h4 className="text-sm font-bold text-[var(--color-text)]">{audit.title}</h4>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-1">{audit.newsSummary}</p>
                </div>

                <div className="flex items-center gap-2.5 justify-end text-xs font-bold flex-wrap">
                  <Button variant="secondary" aria-pressed={audit.isPublic}
                    onClick={() => toggleAuditPublic(audit.id, audit.isPublic)}
                 >
                    {audit.isPublic ? t('common.public') : t('common.private')}
                  </Button>

                  <ButtonLink variant="primary"
                    href={`/audits/${audit.id}`}
                 >
                    {t('common.viewDetails')}
                  </ButtonLink>

                  <Button variant="danger"
                    onClick={() => handleDeleteAudit(audit.id)}
                 >
                    {t('common.delete')}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
