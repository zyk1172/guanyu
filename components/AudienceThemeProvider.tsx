'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AudienceTheme, normalizeAudienceThemeValue } from '@/lib/types';

interface AudienceThemeContextValue {
  theme: AudienceTheme;
  setTheme: (theme: AudienceTheme) => void;
  isCompactReading: boolean;
  readingLimit: number;
  showReadingGuide: boolean;
}

const AudienceThemeContext = createContext<AudienceThemeContextValue>({
  theme: 'youth',
  setTheme: () => {},
  isCompactReading: false,
  readingLimit: 999,
  showReadingGuide: false,
});

function readStoredTheme(): AudienceTheme {
  if (typeof window === 'undefined') return 'youth';
  return normalizeAudienceThemeValue(window.localStorage.getItem('guanyu-audience-theme'));
}

function applyTheme(theme: AudienceTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.audienceTheme = theme;
}

export function AudienceThemeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [theme, setThemeState] = useState<AudienceTheme>('youth');

  const setTheme = (nextTheme: AudienceTheme) => {
    const normalized = normalizeAudienceThemeValue(nextTheme);
    setThemeState(normalized);
    applyTheme(normalized);
    window.localStorage.setItem('guanyu-audience-theme', normalized);
  };

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  useEffect(() => {
    function onThemeChange(event: Event) {
      const nextTheme = normalizeAudienceThemeValue((event as CustomEvent).detail);
      setTheme(nextTheme);
    }

    window.addEventListener('guanyu-theme-change', onThemeChange);
    return () => window.removeEventListener('guanyu-theme-change', onThemeChange);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    fetch('/api/account/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        setTheme(normalizeAudienceThemeValue(data.defaultAudienceTheme));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [status]);

  const value = useMemo<AudienceThemeContextValue>(() => {
    const isCompactReading = theme === 'teen' || theme === 'senior';
    return {
      theme,
      setTheme,
      isCompactReading,
      readingLimit: isCompactReading ? 2 : 999,
      showReadingGuide: isCompactReading,
    };
  }, [theme]);

  return <AudienceThemeContext.Provider value={value}>{children}</AudienceThemeContext.Provider>;
}

export function useAudienceTheme() {
  return useContext(AudienceThemeContext);
}
