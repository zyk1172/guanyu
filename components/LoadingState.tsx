'use client';

import { useEffect, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';
import { getWorkspaceCopy } from '@/lib/workspace-copy';

export default function LoadingState() {
  const { language } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <section className="workspace-panel space-y-3" aria-busy="true" aria-label={c.pending}>
    <h2 role="status" className="flex items-center gap-3"><span className="step-pulse h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" aria-hidden="true" />{c.pending}</h2>
    <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{c.pendingNote}</p>
    <p className="text-xs text-[var(--color-text-muted)]">{c.elapsed} {elapsed} {c.seconds}</p>
  </section>;
}
