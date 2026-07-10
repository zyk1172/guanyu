'use client';

import React, { useEffect, useState } from 'react';
import { GsapReveal } from './GsapMotion';
import { useUiLanguage } from './LanguageProvider';

export default function LoadingState() {
  const { t } = useUiLanguage();
  const steps = [
    t('loading.claims'),
    t('loading.narrative'),
    t('loading.perspectives'),
    t('loading.evidence'),
    t('loading.result'),
  ];
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, steps.length - 1));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <GsapReveal className="my-6" y={12} stagger={0.045}>
      <div data-gsap-reveal className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl p-5 shadow-sm space-y-5 max-w-2xl mx-auto">
      <div data-gsap-reveal className="space-y-2">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('loading.title')}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
          {t('loading.description')}
        </p>
      </div>

      <div data-gsap-reveal className="border-t border-gray-100 dark:border-gray-900 pt-4 text-left">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('loading.steps')}</p>
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={step}
              data-gsap-reveal
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-xs transition ${
                index === activeStep
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300'
                  : index < activeStep
                    ? 'border-emerald-100 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/20 dark:bg-emerald-950/10 dark:text-emerald-300'
                    : 'border-gray-100 bg-gray-50 text-gray-500 dark:border-gray-850 dark:bg-gray-900 dark:text-gray-400'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${index === activeStep ? 'step-pulse bg-indigo-500' : index < activeStep ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    </GsapReveal>
  );
}
