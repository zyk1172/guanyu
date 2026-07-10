'use client';

import React from 'react';
import { UI_LANGUAGE_OPTIONS } from '@/lib/ui-language-core.mjs';
import { type UiLanguage, useUiLanguage } from './LanguageProvider';

export default function LanguageSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'cards' }) {
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
