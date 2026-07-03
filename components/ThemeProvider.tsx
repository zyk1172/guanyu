'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppTheme = 'newspaper' | 'night' | 'kids';

export const APP_THEME_OPTIONS: Array<{
  value: AppTheme;
  label: string;
  description: string;
}> = [
  { value: 'newspaper', label: '泛黄报纸', description: '温和纸张色，适合长时间阅读。' },
  { value: 'night', label: '黑夜模式', description: '低眩光深色，适合夜间阅读。' },
  { value: 'kids', label: '儿童友好', description: '明亮圆润，但保持专业清晰。' },
];

const STORAGE_KEY = 'guanyu-theme';

function normalizeTheme(value: string | null | undefined): AppTheme {
  if (value === 'night' || value === 'kids') return value;
  return 'newspaper';
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>('newspaper');

  useEffect(() => {
    const saved = normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
    applyTheme(saved);
    setThemeState(saved);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = normalizeTheme(event.newValue);
      document.documentElement.dataset.theme = next;
      setThemeState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: (nextTheme) => {
      applyTheme(nextTheme);
      setThemeState(nextTheme);
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }
  return context;
}
