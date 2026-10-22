'use client';

import { useEffect, useState } from 'react';
import { getWorkspaceCopy } from '@/lib/workspace-copy';

export default function ReadingNavigation({ language }: { language: string }) {
  const c = getWorkspaceCopy(language);
  const [active, setActive] = useState('report-brief');
  useEffect(() => {
    const targets = ['report-brief', 'report-interpretation', 'report-full', 'report-evidence'].map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const update = () => {
      const reached = targets.filter((node) => node.getBoundingClientRect().top <= 170);
      setActive(reached.at(-1)?.id || 'report-brief');
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <nav className="reading-navigation" aria-label={c.full}>
    {[[ 'report-brief', c.brief ], [ 'report-interpretation', c.interpretation ], [ 'report-evidence', c.evidence ], [ 'report-full', c.full ]].map(([id, title]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>{title}</a>)}
  </nav>;
}
