'use client';

import { Button, Select } from '@/components/ui/controls';
import { UI_LANGUAGE_OPTIONS } from '@/lib/ui-language-core.mjs';
import { type UiLanguage, useUiLanguage } from './LanguageProvider';

export default function LanguageSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'cards' | 'auth' }) {
  const { language, setLanguage, t } = useUiLanguage();
  if (variant === 'cards') return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label={t('language.interfaceLanguage')}>
    {UI_LANGUAGE_OPTIONS.map(option => <Button key={option.value} variant="choice" aria-pressed={language === option.value} onClick={() => setLanguage(option.value as UiLanguage)}>
      <span className="font-semibold">{option.label}</span>
      <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--color-text-muted)]">{option.description}</span>
    </Button>)}
  </div>;
  return <label className="ui-label ui-compact-select">
    <span className="sr-only">{t('language.interfaceLanguage')}</span>
    <Select value={language} onChange={event => setLanguage(event.target.value as UiLanguage)} aria-label={t('language.interfaceLanguage')}>
      {UI_LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </Select>
  </label>;
}
