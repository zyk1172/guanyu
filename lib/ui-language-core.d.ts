export type UiLanguage = 'zh-CN' | 'en-US';

export const UI_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: UiLanguage;
  label: string;
  description: string;
}>;

export function normalizeUiLanguage(value: unknown): UiLanguage;
export function getUiText(language: UiLanguage | string | undefined, key: string, fallback?: string): string;
export function formatUiText(template: string, values?: Record<string, string | number | undefined>): string;
