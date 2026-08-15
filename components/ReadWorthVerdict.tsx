'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ReadWorthLabel } from '../lib/types';
import { getReadWorthAnimationTokens, getReportText } from '../lib/report-display-core.mjs';

gsap.registerPlugin(useGSAP);

interface ReadWorthVerdictProps {
  label: ReadWorthLabel;
  displayLabel?: string;
  reportLanguage?: string;
}

const PALETTE: Record<ReadWorthLabel, {
  frame: string;
  text: string;
  halo: string;
  sweep: string;
}> = {
  深度阅读: {
    frame: 'border-teal-300/70 bg-teal-950 text-teal-50 shadow-teal-900/20',
    text: 'text-teal-50 [text-shadow:0_2px_14px_rgba(13,148,136,0.35)]',
    halo: 'bg-teal-400/18',
    sweep: 'from-transparent via-teal-100/22 to-transparent',
  },
  概览阅读: {
    frame: 'border-blue-300/70 bg-blue-950 text-blue-50 shadow-blue-900/20',
    text: 'text-blue-50 [text-shadow:0_2px_14px_rgba(59,130,246,0.35)]',
    halo: 'bg-blue-400/18',
    sweep: 'from-transparent via-blue-100/22 to-transparent',
  },
  有限参考: {
    frame: 'border-stone-300/70 bg-stone-800 text-stone-50 shadow-stone-900/20',
    text: 'text-stone-50 [text-shadow:0_2px_14px_rgba(120,113,108,0.3)]',
    halo: 'bg-stone-300/16',
    sweep: 'from-transparent via-stone-100/20 to-transparent',
  },
  材料不足: {
    frame: 'border-slate-300/70 bg-slate-800 text-slate-50 shadow-slate-900/20',
    text: 'text-slate-50 [text-shadow:0_2px_14px_rgba(100,116,139,0.3)]',
    halo: 'bg-slate-300/16',
    sweep: 'from-transparent via-slate-100/20 to-transparent',
  },
};

export default function ReadWorthVerdict({ label, displayLabel, reportLanguage = 'zh-CN' }: ReadWorthVerdictProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const haloRef = useRef<HTMLDivElement | null>(null);
  const sweepRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<HTMLSpanElement[]>([]);
  const palette = PALETTE[label];
  const labelText = displayLabel || label;
  const tokens = getReadWorthAnimationTokens(labelText, reportLanguage);
  const isChinese = reportLanguage.startsWith('zh-');

  useGSAP(() => {
    const root = rootRef.current;
    const halo = haloRef.current;
    const sweep = sweepRef.current;
    const chars = charRefs.current.filter(Boolean);
    if (!root || !halo || !sweep || chars.length === 0) return;

    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set([root, halo, sweep, ...chars], {
        autoAlpha: 1,
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        clearProps: 'filter',
      });
    });

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } });
      timeline
        .fromTo(root, {
          autoAlpha: 0,
          scale: 0.9,
          y: 10,
          filter: 'blur(6px)',
        }, {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.42,
          clearProps: 'filter',
        })
        .fromTo(chars, {
          autoAlpha: 0,
          y: 10,
          scale: 0.94,
        }, {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.28,
          stagger: 0.035,
        }, '-=0.24')
        .fromTo(halo, {
          autoAlpha: 0.45,
          scale: 0.9,
        }, {
          autoAlpha: 0.15,
          scale: 1.08,
          duration: 0.55,
          ease: 'power3.out',
        }, '-=0.32');

      gsap.fromTo(sweep, {
        xPercent: -140,
        autoAlpha: 0,
      }, {
        xPercent: 140,
        autoAlpha: 0.55,
        duration: 1.8,
        ease: 'power3.inOut',
        repeat: -1,
        repeatDelay: 2.2,
      });
    });

    return () => mm.revert();
  }, { scope: rootRef, dependencies: [label, labelText, reportLanguage], revertOnUpdate: true });

  return (
    <div
      ref={rootRef}
      data-gsap-hover
      aria-label={`${getReportText('readingValue', reportLanguage)}: ${labelText}`}
      className={`relative isolate mx-auto w-full max-w-xl overflow-hidden rounded-2xl border px-5 py-6 text-center shadow-2xl ${palette.frame}`}
    >
      <div ref={haloRef} className={`pointer-events-none absolute inset-[-20%] -z-10 rounded-full blur-3xl ${palette.halo}`} />
      <div ref={sweepRef} className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r ${palette.sweep}`} />
      <div className={`relative font-black leading-tight ${isChinese ? 'mx-auto grid w-fit grid-cols-1 justify-items-center gap-y-1 text-4xl tracking-[0.04em] sm:text-5xl' : 'flex flex-wrap justify-center gap-x-2 break-normal text-2xl tracking-normal sm:text-3xl'} ${palette.text}`}>
        {tokens.map((token, index) => (
          <span
            key={`${token}-${index}`}
            ref={(node) => {
              if (node) charRefs.current[index] = node;
            }}
            className="inline-block whitespace-nowrap"
          >
            {token}
          </span>
        ))}
      </div>
    </div>
  );
}
