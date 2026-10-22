'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

// Keep the shared wrapper API; static cards and fields never move on hover.
export function GsapRoot({ children }: { children: React.ReactNode }) {
  return <div data-gsap-root>{children}</div>;
}

export function GsapReveal({ children, className, selector = '[data-gsap-reveal]', y = 8, stagger = 0.035 }: {
  children: React.ReactNode; className?: string; selector?: string; y?: number; stagger?: number;
}) {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  useGSAP(() => {
    const targets = Array.from(scopeRef.current?.querySelectorAll<HTMLElement>(selector) || []);
    if (!targets.length) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(targets, { opacity: 0, y: Math.min(y, 8), duration: 0.3, stagger: Math.min(stagger, 0.04), ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => mm.revert();
  }, { scope: scopeRef });
  return <div ref={scopeRef} className={className}>{children}</div>;
}
