'use client';

import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

interface GsapRootProps {
  children: React.ReactNode;
}

interface GsapRevealProps {
  children: React.ReactNode;
  className?: string;
  selector?: string;
  y?: number;
  stagger?: number;
}

function isInteractiveTarget(element: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.matches('button:disabled, [aria-disabled="true"], .gsap-no-hover')) return false;
  return element.matches('.interactive-lift, .result-card, .card-subtle, [data-gsap-hover]');
}

export function GsapRoot({ children }: GsapRootProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();

    mm.add(
      {
        reduceMotion: '(prefers-reduced-motion: reduce)',
        canHover: '(hover: hover) and (pointer: fine)',
      },
      (context) => {
        const { reduceMotion, canHover } = context.conditions || {};

        if (!reduceMotion) {
          const driftTargets = Array.from(root.querySelectorAll<HTMLElement>('[data-gsap-drift]'));

          if (driftTargets.length > 0) {
            gsap.to(driftTargets, {
              x: (index) => (index % 2 === 0 ? -12 : 14),
              y: (index) => (index % 2 === 0 ? 10 : -12),
              scale: (index) => (index % 2 === 0 ? 1.04 : 1.06),
              duration: 7.5,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
              stagger: 0.6,
            });
          }
        }

        if (reduceMotion || !canHover) return;

        const getTarget = (event: Event) => {
          const element = event.target instanceof Element
            ? event.target.closest('.interactive-lift, .result-card, .card-subtle, [data-gsap-hover]')
            : null;
          return root.contains(element) && isInteractiveTarget(element) ? element : null;
        };

        const onPointerOver = (event: PointerEvent) => {
          const target = getTarget(event);
          if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
          gsap.to(target, {
            y: -1,
            scale: 1.006,
            boxShadow: '0 12px 34px rgba(15, 23, 42, 0.08)',
            duration: 0.26,
            ease: 'power3.out',
            overwrite: 'auto',
          });
        };

        const onPointerOut = (event: PointerEvent) => {
          const target = getTarget(event);
          if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
          gsap.to(target, {
            y: 0,
            scale: 1,
            boxShadow: '0 0 0 rgba(15, 23, 42, 0)',
            duration: 0.28,
            ease: 'power3.out',
            overwrite: 'auto',
            clearProps: 'boxShadow',
          });
        };

        const onPointerDown = (event: PointerEvent) => {
          const target = getTarget(event);
          if (!target) return;
          gsap.to(target, {
            scale: 0.985,
            y: 0,
            duration: 0.1,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        };

        const onPointerUp = (event: PointerEvent) => {
          const target = getTarget(event);
          if (!target) return;
          gsap.to(target, {
            scale: 1.006,
            y: -1,
            duration: 0.2,
            ease: 'power3.out',
            overwrite: 'auto',
          });
        };

        root.addEventListener('pointerover', onPointerOver);
        root.addEventListener('pointerout', onPointerOut);
        root.addEventListener('pointerdown', onPointerDown);
        root.addEventListener('pointerup', onPointerUp);

        return () => {
          root.removeEventListener('pointerover', onPointerOver);
          root.removeEventListener('pointerout', onPointerOut);
          root.removeEventListener('pointerdown', onPointerDown);
          root.removeEventListener('pointerup', onPointerUp);
        };
      }
    );

    return () => mm.revert();
  }, { scope: rootRef });

  return <div ref={rootRef} data-gsap-root>{children}</div>;
}

export function GsapReveal({
  children,
  className,
  selector = '[data-gsap-reveal]',
  y = 16,
  stagger = 0.06,
}: GsapRevealProps) {
  const scopeRef = useRef<HTMLDivElement | null>(null);

  useGSAP(() => {
    const root = scopeRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(selector));
    if (targets.length === 0) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(targets, { autoAlpha: 1, y: 0, scale: 1, clearProps: 'filter' });
    });

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(targets, {
        autoAlpha: 0,
        y,
        scale: 0.992,
        filter: 'blur(7px)',
        transformOrigin: '50% 24%',
      });

      const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } });
      timeline.to(targets, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        duration: 0.68,
        stagger: { each: stagger, from: 'start' },
        clearProps: 'filter',
      });
    });

    return () => mm.revert();
  }, { scope: scopeRef });

  return (
    <div ref={scopeRef} className={className}>
      {children}
    </div>
  );
}
