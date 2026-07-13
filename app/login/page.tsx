'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUiLanguage } from '@/components/LanguageProvider';
import { getBrandIdentity } from '@/lib/brand-core.mjs';

export default function LoginPage() {
  const { t, language } = useUiLanguage();
  const brand = getBrandIdentity(language);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t('auth.enterEmailPassword'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(language.startsWith('zh-') ? (data.error || t('auth.loginFailed')) : t('auth.loginFailed'));
      } else {
        window.location.assign(data.url || '/');
      }
    } catch (err: unknown) {
      setError(t('auth.loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-950 p-8 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="text-center">
          <Image
            src="/guanyu-icon.png"
            alt={brand.name}
            width={48}
            height={48}
            className="mx-auto h-12 w-12 rounded-xl object-cover shadow-sm mb-4"
            priority
          />
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {t('auth.signInTitle')}
          </h2>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('auth.signInDescription')}
          </p>
        </div>

        <form
          action="/api/login"
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin();
          }}
          className="space-y-4 mt-8"
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-xs font-semibold text-red-600 dark:text-red-400">
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? t('auth.processing') : t('auth.enter')}
          </button>
        </form>

        <div className="text-center mt-6">
          <div className="flex items-center justify-between text-xs">
            <Link href="/" className="text-gray-500 hover:text-indigo-600 font-medium">
              {t('common.backHome')}
            </Link>
            <Link href="/register" className="text-indigo-500 hover:text-indigo-600 font-bold">
              {t('auth.createAccount')}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
