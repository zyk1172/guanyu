'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Menu, X } from 'lucide-react';
import { useUiLanguage } from './LanguageProvider';
import { getBrandIdentity } from '@/lib/brand-core.mjs';
import { getWorkspaceCopy } from '@/lib/workspace-copy';

export default function Header() {
  const { data: session } = useSession();
  const { language, t } = useUiLanguage();
  const pathname = usePathname();
  const c = getWorkspaceCopy(language);
  const brand = getBrandIdentity(language);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  const link = (href: string, label: string) => <Link href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link>;
  return <header ref={root} className="workspace-header">
    <div className="workspace-container workspace-header-inner">
      <Link href="/" className="workspace-brand" onClick={() => setOpen(false)}>
        <Image src="/guanyu-icon.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" priority />
        <span>{brand.name}</span>
      </Link>
      <button ref={toggle} type="button" className="workspace-button workspace-secondary workspace-menu-toggle" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}{open ? c.closeMenu : c.menu}
      </button>
      <nav id="primary-navigation" className="workspace-nav" data-open={open} aria-label={c.menu}>
        {link('/', t('nav.home'))}
        {session ? <>{link('/my-audits', t('nav.myAudits'))}{link('/compare', c.compare)}{link('/account', t('nav.account'))}<button type="button" onClick={() => signOut({ callbackUrl: '/' })} className="text-[var(--color-text-muted)]">{t('nav.signOut')}</button></> : <>
          {link('/demo', c.demoNav)}
          <Link href="/login" className="workspace-secondary">{t('nav.signIn')}</Link><Link href="/register" className="workspace-primary">{t('nav.signUp')}</Link>
        </>}
      </nav>
    </div>
  </header>;
}
