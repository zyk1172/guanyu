'use client';

import { Button, Select } from '@/components/ui/controls';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { useUiLanguage } from './LanguageProvider';
import { APP_THEME_OPTIONS, type AppTheme, useAppTheme } from './ThemeProvider';

export default function ThemeSwitcher({ variant = 'compact' }: { variant?: 'compact' | 'cards' }) {
  const { theme, setTheme } = useAppTheme();
  const { t, language } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const options = APP_THEME_OPTIONS.map(option => ({ ...option, label: option.value === 'newspaper' ? c.theme : t(`theme.${option.value}`), description: option.value === 'newspaper' ? c.themeNote : t(`theme.${option.value}Description`) }));
  if (variant === 'cards') return <div className="grid grid-cols-1 gap-2 md:grid-cols-3" role="group" aria-label={c.themePicker}>
    {options.map(option => <Button key={option.value} variant="choice" aria-pressed={theme === option.value} onClick={() => setTheme(option.value)}>
      <span className="font-semibold">{option.label}</span>
      <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--color-text-muted)]">{option.description}</span>
    </Button>)}
  </div>;
  return <label className="ui-label ui-compact-select">
    <span className="sr-only">{c.themePicker}</span>
    <Select value={theme} onChange={event => setTheme(event.target.value as AppTheme)} aria-label={c.themePicker}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </Select>
  </label>;
}
