'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ReadWorthLabel } from '../lib/types';

gsap.registerPlugin(useGSAP);

interface ReadWorthVerdictProps {
  label: ReadWorthLabel;
}

const PALETTE: Record<ReadWorthLabel, {
  frame: string;
  text: string;
  halo: string;
  sweep: string;
}> = {
  值得细读: {
    frame: 'border-emerald-300 bg-emerald-950 text-emerald-50 shadow-emerald-500/25',
    text: 'text-emerald-50 [text-shadow:0_2px_18px_rgba(16,185,129,0.55)]',
    halo: 'bg-emerald-400/25',
    sweep: 'from-transparent via-emerald-100/35 to-transparent',
  },
  可以略读: {
    frame: 'border-indigo-300 bg-indigo-950 text-indigo-50 shadow-indigo-500/25',
    text: 'text-indigo-50 [text-shadow:0_2px_18px_rgba(99,102,241,0.55)]',
    halo: 'bg-indigo-400/25',
    sweep: 'from-transparent via-sky-100/35 to-transparent',
  },
  暂无法判断: {
    frame: 'border-amber-300 bg-amber-950 text-amber-50 shadow-amber-500/25',
    text: 'text-amber-50 [text-shadow:0_2px_18px_rgba(245,158,11,0.5)]',
    halo: 'bg-amber-400/22',
    sweep: 'from-transparent via-amber-100/32 to-transparent',
  },
  不值一读: {
    frame: 'border-red-300 bg-red-950 text-red-50 shadow-red-500/30',
    text: 'text-red-50 [text-shadow:0_2px_18px_rgba(239,68,68,0.58)]',
    halo: 'bg-red-500/28',
    sweep: 'from-transparent via-red-100/38 to-transparent',
  },
};

export default function ReadWorthVerdict({ label }: ReadWorthVerdictProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const haloRef = useRef<HTMLDivElement | null>(null);
  const sweepRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<HTMLSpanElement[]>([]);
  const palette = PALETTE[label];

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
  }, { scope: rootRef, dependencies: [label], revertOnUpdate: true });

  return (
    <div
      ref={rootRef}
      data-gsap-hover
      aria-label={`阅读价值判断：${label}`}
      className={`relative isolate mx-auto w-full max-w-xl overflow-hidden rounded-2xl border px-5 py-6 text-center shadow-2xl ${palette.frame}`}
    >
      <div ref={haloRef} className={`pointer-events-none absolute inset-[-20%] -z-10 rounded-full blur-3xl ${palette.halo}`} />
      <div ref={sweepRef} className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r ${palette.sweep}`} />
      <div className={`relative text-4xl font-black leading-none tracking-[0.12em] sm:text-6xl ${palette.text}`}>
        {label.split('').map((char, index) => (
          <span
            key={`${char}-${index}`}
            ref={(node) => {
              if (node) charRefs.current[index] = node;
            }}
            className="inline-block"
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  );
}
