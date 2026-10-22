'use client';

import React from 'react';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { APP_THEME_OPTIONS, AppTheme, useAppTheme } from './ThemeProvider';
import { useUiLanguage } from './LanguageProvider';

export default function ThemeSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'cards' }) {
  const { theme, setTheme } = useAppTheme();
  const { t, language } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const options = APP_THEME_OPTIONS.map((option) => ({
    ...option,
    label: option.value === 'newspaper' ? c.theme : t(`theme.${option.value}`),
    description: option.value === 'newspaper' ? c.themeNote : t(`theme.${option.value}Description`),
  }));

  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`rounded-[var(--radius-button)] border p-3 text-left text-xs transition active:scale-[0.98] ${
              theme === option.value
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
    <label className="relative flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-[var(--color-border-strong)] bg-[var(--color-card)] px-2 py-1 text-xxs font-bold text-[var(--color-text-muted)] shadow-[var(--shadow-card)]">
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as AppTheme)}
        className="min-h-10 min-w-[88px] appearance-none rounded-[calc(var(--radius-button)-4px)] border-0 bg-[var(--color-card)] py-0 pl-1 pr-5 text-xxs font-bold text-[var(--color-text)] outline-none"
        aria-label={c.themePicker}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--color-surface)] text-[var(--color-text)]">
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-[var(--color-text)]">
        ▾
      </span>
    </label>
  );
}
