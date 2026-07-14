'use client';

import { CheckCircle2, ExternalLink, LoaderCircle, Search, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ManualVerificationOutcome, ManualVerificationRecord, VerificationRoadmapTask } from '@/lib/types';
import { formatMaterialType, formatPriority } from '@/lib/report-display-core.mjs';

interface VerificationRoadmapProps {
  auditId?: string;
  canUpdate?: boolean;
  items: VerificationRoadmapTask[];
  manualVerifications?: ManualVerificationRecord[];
  reportLanguage: string;
  source?: string;
  title?: string;
  onUpdated?: (result: unknown, outcome: ManualVerificationOutcome) => void;
}

function copyFor(language: string) {
  if (language === 'zh-TW') {
    return {
      search: '網頁搜尋',
      searchHint: '開啟搜尋後，再記錄本次查證結果',
      verified: '驗證存在',
      unverified: '無法驗證',
      searching: '正在開啟搜尋',
      markedVerified: '已標記：找到可核驗材料',
      markedUnverified: '已標記：暫未找到可核驗材料',
      change: '本次核驗會重算證據強度、資訊完整度、推測不確定性與閱讀價值。',
      ownerOnly: '只有報告建立者或管理員可儲存核驗結論。',
      updateFailed: '更新核驗結果失敗。',
      saving: '儲存中',
    };
  }
  if (language.startsWith('zh')) {
    return {
      search: '网页搜索',
      searchHint: '打开搜索后，再记录本次查证结果',
      verified: '验证存在',
      unverified: '无法验证',
      searching: '正在打开搜索',
      markedVerified: '已标记：找到可核验材料',
      markedUnverified: '已标记：暂未找到可核验材料',
      change: '本次核验会重算证据强度、信息完整度、推测不确定性与阅读价值。',
      ownerOnly: '只有报告创建者或管理员可保存核验结论。',
      updateFailed: '更新核验结果失败。',
      saving: '保存中',
    };
  }
  return {
    search: 'Web search',
    searchHint: 'Open the search first, then record the result of this check.',
    verified: 'Material found',
    unverified: 'Not verified',
    searching: 'Opening search',
    markedVerified: 'Marked: checkable material found',
    markedUnverified: 'Marked: no checkable material found',
    change: 'This recalculates evidence strength, completeness, uncertainty, and reading value.',
    ownerOnly: 'Only the report owner or an administrator can save verification results.',
    updateFailed: 'Could not update the verification result.',
    saving: 'Saving',
  };
}

function buildSearchQuery(item: VerificationRoadmapTask, title?: string, source?: string) {
  return [item.question, item.materialType, title, source]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 480);
}

export default function VerificationRoadmap({
  auditId,
  canUpdate = false,
  items,
  manualVerifications = [],
  reportLanguage,
  source,
  title,
  onUpdated,
}: VerificationRoadmapProps) {
  const copy = copyFor(reportLanguage);
  const [openedIndex, setOpenedIndex] = useState<number | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verificationByIndex = useMemo(
    () => new Map(manualVerifications.map((item) => [item.index, item])),
    [manualVerifications]
  );

  const openSearch = (item: VerificationRoadmapTask, index: number) => {
    const query = buildSearchQuery(item, title, source);
    window.open(`https://www.google.com/search?${new URLSearchParams({ q: query }).toString()}`, '_blank', 'noopener,noreferrer');
    setOpenedIndex(index);
    setError(null);
  };

  const saveOutcome = async (index: number, outcome: ManualVerificationOutcome) => {
    if (!auditId || !canUpdate) return;
    setSavingIndex(index);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, outcome }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || copy.updateFailed);
      onUpdated?.(data.result, outcome);
      setOpenedIndex(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : copy.updateFailed);
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {items.map((item, index) => {
        const record = verificationByIndex.get(index);
        const isOpen = openedIndex === index;
        const isSaving = savingIndex === index;
        return (
          <article key={`${item.question}-${index}`} data-gsap-hover className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs transition-colors hover:bg-[var(--color-card-hover)]">
            <div className="font-bold leading-relaxed text-[var(--color-text)]">{item.question}</div>
            <p className="mt-1 leading-relaxed text-[var(--color-text-muted)]">{item.whyItMatters}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-[var(--color-info)]/30 bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] px-2 py-0.5 text-xxs font-bold text-[var(--color-info)]">{formatMaterialType(item.materialType, reportLanguage)}</span>
              <span className="rounded border border-[var(--color-warning)]/35 bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] px-2 py-0.5 text-xxs font-bold text-[var(--color-warning)]">{formatPriority(item.priority, reportLanguage)}</span>
            </div>

            {record ? (
              <div className={`mt-3 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xxs font-bold ${record.outcome === 'verified' ? 'border-[var(--color-success)]/35 bg-[color-mix(in_srgb,var(--color-success)_11%,transparent)] text-[var(--color-success)]' : 'border-[var(--color-warning)]/35 bg-[color-mix(in_srgb,var(--color-warning)_11%,transparent)] text-[var(--color-warning)]'}`}>
                {record.outcome === 'verified' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{record.outcome === 'verified' ? copy.markedVerified : copy.markedUnverified}</span>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSearch(item, index)} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-primary)]/35 bg-[var(--color-surface)] px-2.5 py-1.5 text-xxs font-black text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)] active:scale-[0.98]">
                <Search className="h-3.5 w-3.5" />
                {copy.search}
                <ExternalLink className="h-3 w-3 opacity-70" />
              </button>
              {!record && !isOpen && <span className="text-xxs font-medium text-[var(--color-text-subtle)]">{copy.searchHint}</span>}
            </div>

            {isOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                {canUpdate && auditId ? (
                  <>
                    <button type="button" disabled={isSaving} onClick={() => saveOutcome(index, 'verified')} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-success)] px-2.5 py-1.5 text-xxs font-black text-white transition hover:brightness-105 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">
                      {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {isSaving ? copy.saving : copy.verified}
                    </button>
                    <button type="button" disabled={isSaving} onClick={() => saveOutcome(index, 'unverified')} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-warning)]/55 bg-[var(--color-surface)] px-2.5 py-1.5 text-xxs font-black text-[var(--color-warning)] transition hover:bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {copy.unverified}
                    </button>
                    <span className="basis-full text-xxs leading-relaxed text-[var(--color-text-subtle)]">{copy.change}</span>
                  </>
                ) : (
                  <span className="text-xxs leading-relaxed text-[var(--color-text-subtle)]">{copy.ownerOnly}</span>
                )}
              </div>
            )}
          </article>
        );
      })}
      {error && <p className="md:col-span-2 text-xxs font-semibold text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
