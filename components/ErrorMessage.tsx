'use client';

import React from 'react';
import { useUiLanguage } from './LanguageProvider';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  const { t } = useUiLanguage();
  return (
    <div className="animate-fade-up bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-6 max-w-2xl mx-auto my-8 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-1 bg-red-100 dark:bg-red-900/40 rounded-full text-red-600 dark:text-red-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-red-900 dark:text-red-300">{t('error.title')}</h4>
          <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
            {message || t('error.default')}
          </p>
        </div>
      </div>
      {onRetry && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRetry}
            className="interactive-lift px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            {t('error.retry')}
          </button>
        </div>
      )}
    </div>
  );
}
