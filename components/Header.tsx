'use client';

import { Button, ButtonLink } from '@/components/ui/controls';
import { getBrandIdentity } from '@/lib/brand-core.mjs';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { Menu, X } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useUiLanguage } from './LanguageProvider';

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
  const link = (href: string, label: string) => <ButtonLink variant="ghost" href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</ButtonLink>;
  return <header ref={root} className="workspace-header">
    <a href="#main-content" className="skip-link">{language.startsWith('zh') ? '跳到主要内容' : 'Skip to main content'}</a>
    <div className="workspace-container workspace-header-inner">
      <Link href="/" className="workspace-brand" onClick={() => setOpen(false)}>
        <Image src="/guanyu-icon.png" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" priority />
        <span>{brand.name}</span>
      </Link>
      <Button variant="secondary" ref={toggle} type="button" className="workspace-menu-toggle" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}{open ? c.closeMenu : c.menu}
      </Button>
      <nav id="primary-navigation" className="workspace-nav" data-open={open} aria-label={c.menu}>
        {link('/', t('nav.home'))}
        {session ? <>{link('/my-audits', t('nav.myAudits'))}{link('/account', t('nav.account'))}<Button variant="ghost" type="button" onClick={() => signOut({ callbackUrl: '/' })}>{t('nav.signOut')}</Button></> : <>
          {link('/demo', c.demoNav)}
          <ButtonLink variant="secondary" href="/login">{t('nav.signIn')}</ButtonLink><ButtonLink variant="primary" href="/register">{t('nav.signUp')}</ButtonLink>
        </>}
      </nav>
    </div>
  </header>;
}
