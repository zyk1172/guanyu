'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

type Entry = { id: string; title: string };
const LABELS: Record<string, string> = {
  'zh-CN': '本页目录', 'zh-TW': '本頁目錄', 'en-US': 'On this page',
  'ja-JP': 'このページの目次', 'ko-KR': '이 페이지의 목차',
  'de-DE': 'Auf dieser Seite', 'it-IT': 'In questa pagina',
};

function keepActiveVisible(navigation: HTMLElement | null) {
  const link = navigation?.querySelector<HTMLElement>('[aria-current="location"]');
  if (!navigation || !link) return;
  const list = navigation.getBoundingClientRect();
  const item = link.getBoundingClientRect();
  // Scroll only the directory; scrollIntoView would also move the report itself.
  if (item.top < list.top) navigation.scrollTop -= list.top - item.top;
  else if (item.bottom > list.bottom) navigation.scrollTop += item.bottom - list.bottom;
}

export default function ReadingNavigation({ language, contentRef }: {
  language: string;
  contentRef: RefObject<HTMLElement | null>;
}) {
  const label = LABELS[language] || LABELS['en-US'];
  const navigationRef = useRef<HTMLElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const desktop = window.matchMedia('(min-width: 1280px)');
    let disconnect = () => {};

    const connect = () => {
      disconnect();
      if (!desktop.matches) return;
      let frame = 0;

      const update = () => {
        frame = 0;
        // Read actual rendered headings in document order, including optional sections.
        const targets = Array.from(content.querySelectorAll<HTMLElement>('[data-reading-section]'))
          .filter(node => node.id && node.dataset.readingSection?.trim() && node.getClientRects().length);
        const next = targets.map(node => ({ id: node.id, title: node.dataset.readingSection!.trim() }));
        setEntries(previous => previous.length === next.length && previous.every((item, i) => item.id === next[i].id && item.title === next[i].title) ? previous : next);

        const offset = (document.querySelector('.workspace-header')?.getBoundingClientRect().bottom || 72) + 32;
        let current = targets[0]?.id || '';
        for (const target of targets) {
          if (target.getBoundingClientRect().top > offset + 1) break;
          current = target.id;
        }
        // Short final chapters cannot always reach the top of the viewport.
        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
          const linked = targets.find(node => node.id === window.location.hash.slice(1));
          const top = linked?.getBoundingClientRect().top;
          current = linked && top !== undefined && top >= offset && top < window.innerHeight
            ? linked.id : targets.at(-1)?.id || current;
        }
        setActive(current);
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
      const mutations = new MutationObserver(schedule);
      mutations.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-reading-section', 'id', 'style'] });
      const resize = new ResizeObserver(() => { schedule(); keepActiveVisible(navigationRef.current); });
      resize.observe(content);
      if (navigationRef.current) resize.observe(navigationRef.current);
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('hashchange', schedule);
      schedule();
      disconnect = () => {
        mutations.disconnect();
        resize.disconnect();
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        window.removeEventListener('hashchange', schedule);
      };
    };
    connect();
    desktop.addEventListener('change', connect);
    return () => { disconnect(); desktop.removeEventListener('change', connect); };
  }, [contentRef, language]);

  useEffect(() => {
    keepActiveVisible(navigationRef.current);
  }, [active, entries]);

  return <aside className="report-sidebar">
    <p className="report-sidebar-label">{label}</p>
    <nav ref={navigationRef} className="reading-navigation" aria-label={label}>
      {entries.map(({ id, title }) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined} onClick={() => setActive(id)}>{title}</a>)}
    </nav>
  </aside>;
}
