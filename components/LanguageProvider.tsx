'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  formatUiText,
  getUiText,
  normalizeUiLanguage,
} from '@/lib/ui-language-core.mjs';

export type UiLanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR' | 'de-DE' | 'it-IT';

const STORAGE_KEY = 'guanyu-ui-language';
const COOKIE_NAME = 'guanyu-ui-language';

function applyUiLanguage(language: UiLanguage) {
  document.documentElement.dataset.uiLanguage = language;
  document.documentElement.lang = language;
  window.localStorage.setItem(STORAGE_KEY, language);
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(language)}; path=/; max-age=31536000; samesite=lax`;
}

interface UiLanguageContextValue {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: string, fallback?: string, values?: Record<string, string | number | undefined>) => string;
}

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>('zh-CN');

  useEffect(() => {
    const saved = normalizeUiLanguage(window.localStorage.getItem(STORAGE_KEY));
    applyUiLanguage(saved);
    setLanguageState(saved);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = normalizeUiLanguage(event.newValue);
      document.documentElement.dataset.uiLanguage = next;
      document.documentElement.lang = next;
      setLanguageState(next);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<UiLanguageContextValue>(() => ({
    language,
    setLanguage: (next) => {
      const normalized = normalizeUiLanguage(next);
      applyUiLanguage(normalized);
      setLanguageState(normalized);
    },
    t: (key, fallback, values) => formatUiText(getUiText(language, key, fallback), values),
  }), [language]);

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage() {
  const context = useContext(UiLanguageContext);
  if (!context) throw new Error('useUiLanguage must be used inside LanguageProvider');
  return context;
}

export function UiText({
  id,
  fallback,
  values,
}: {
  id: string;
  fallback?: string;
  values?: Record<string, string | number | undefined>;
}) {
  const { t } = useUiLanguage();
  return <>{t(id, fallback, values)}</>;
}
