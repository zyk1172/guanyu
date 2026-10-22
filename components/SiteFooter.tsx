'use client';

import { useUiLanguage } from './LanguageProvider';
import { getBrandIdentity } from '@/lib/brand-core.mjs';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';

export default function SiteFooter() {
  const { language, t } = useUiLanguage();
  const brand = getBrandIdentity(language);
  const c = getWorkspaceCopy(language);
  return <footer className="workspace-footer">
    <div className="workspace-container flex flex-wrap justify-between gap-6">
      <div className="max-w-2xl space-y-2">
        <p>{t('footer.rights', `© 2026 ${brand.name}`, { brand: brand.name })}</p>
        <details><summary>{c.disclosure}</summary><p className="mt-2 leading-relaxed">{t('home.disclaimer')}</p></details>
      </div>
      <div className="flex flex-wrap items-start gap-3"><LanguageSwitcher /><ThemeSwitcher /></div>
    </div>
  </footer>;
}
