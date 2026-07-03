'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import ThemeSwitcher from './ThemeSwitcher';

export default function Header() {
  const { data: session } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-50 border-b py-2.5 backdrop-blur transition-colors duration-200 ${
      isScrolled
        ? 'border-[var(--color-border-strong)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] shadow-sm'
        : 'border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_84%,transparent)]'
    }`}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="interactive-lift flex items-center gap-2.5 hover:opacity-95 transition">
          <Image
            src="/guanyu-icon.png"
            alt="观隅"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover shadow-sm sm:h-8 sm:w-8"
            priority
          />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[var(--color-text)] leading-none">观隅</h1>
            <span className="hidden text-xxs text-[var(--color-text-muted)] font-semibold tracking-wider mt-0.5 sm:block">看见新闻没有展开的一角</span>
          </div>
        </Link>

        <nav className="flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap sm:gap-2">
          <Link href="/" className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-link)] px-2 py-1.5 rounded transition">
            首页
          </Link>
          <Link href="/my-audits" className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-link)] px-2 py-1.5 rounded transition">
            我的审视
          </Link>
          <Link href="/account" className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-link)] px-2 py-1.5 rounded transition">
            账号管理
          </Link>
          <ThemeSwitcher />
          
          {session ? (
            <>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 px-2 py-1.5 rounded transition"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-link)] px-2 py-1.5 rounded transition">
                登录
              </Link>
              <Link
                href="/register"
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition"
              >
                注册
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
