'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { UI_LANGUAGE_OPTIONS } from '@/lib/ui-language-core.mjs';
import { type UiLanguage, useUiLanguage } from './LanguageProvider';

export default function LanguageSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'cards' | 'auth' }) {
  const { language, setLanguage, t } = useUiLanguage();

  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {UI_LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setLanguage(option.value as UiLanguage)}
            className={`rounded-[var(--radius-button)] border p-3 text-left text-xs transition active:scale-[0.98] ${
              language === option.value
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-text)] shadow-[var(--shadow-card)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-card-hover)]'
            }`}
          >
            <div className="font-black">{option.label}</div>
            <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{option.description}</p>
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'auth') {
    const selected = UI_LANGUAGE_OPTIONS.find((option) => option.value === language);
    return (
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,transparent)] px-2.5 py-1.5 text-xxs font-bold text-[var(--color-text-muted)] shadow-[var(--shadow-card)] backdrop-blur transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{selected?.label || t('language.compactLabel')}</span>
          <span className="text-[9px] transition group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 shadow-[var(--shadow-card)]">
          {UI_LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={(event) => {
                setLanguage(option.value as UiLanguage);
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className={`flex w-full items-center justify-between rounded-[var(--radius-button)] px-2.5 py-2 text-left text-xs font-semibold transition ${language === option.value ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-card-hover)] hover:text-[var(--color-text)]'}`}
            >
              <span>{option.label}</span>
              {language === option.value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </details>
    );
  }

  return (
    <label className="relative flex items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-2 py-1 text-xxs font-bold text-[var(--color-text-muted)] shadow-[var(--shadow-card)]">
      <span className="hidden sm:inline">{t('language.compactLabel')}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as UiLanguage)}
        className="min-w-[72px] appearance-none rounded-[calc(var(--radius-button)-4px)] border-0 bg-[var(--color-card)] py-0 pl-1 pr-5 text-xxs font-bold text-[var(--color-text)] outline-none"
        aria-label={t('language.interfaceLanguage')}
      >
        {UI_LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--color-surface)] text-[var(--color-text)]">
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-[var(--color-text)]">▾</span>
    </label>
  );
}
