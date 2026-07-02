export const AUDIENCE_THEME_OPTIONS = [
  {
    value: 'teen',
    label: '青少年版',
    description: '更明亮，术语解释更直接，优先展示关键内容。',
    detailLimit: 2,
    readingGuide: true,
    motion: 'standard',
  },
  {
    value: 'youth',
    label: '青年版',
    description: '默认专业风格，信息密度较高，适合高频使用。',
    detailLimit: 999,
    readingGuide: false,
    motion: 'standard',
  },
  {
    value: 'mature',
    label: '成熟版',
    description: '更克制，强调证据、核验状态和阅读节奏。',
    detailLimit: 999,
    readingGuide: false,
    motion: 'standard',
  },
  {
    value: 'senior',
    label: '长者版',
    description: '更大字号、更高对比度、更少动效和更少可见卡片。',
    detailLimit: 2,
    readingGuide: true,
    motion: 'reduced',
  },
];

const THEME_MAP = new Map(AUDIENCE_THEME_OPTIONS.map((theme) => [theme.value, theme]));

export function normalizeAudienceTheme(value) {
  const normalized = String(value || '').trim();
  return THEME_MAP.has(normalized) ? normalized : 'youth';
}

export function getAudienceThemeConfig(value) {
  return THEME_MAP.get(normalizeAudienceTheme(value));
}
