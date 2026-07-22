'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUiLanguage } from '@/components/LanguageProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getBrandIdentity } from '@/lib/brand-core.mjs';

export default function LoginPage() {
  const { t, language } = useUiLanguage();
  const brand = getBrandIdentity(language);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'code'>('password');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCaptcha = useCallback(async () => {
    setCaptchaAnswer('');
    try {
      const response = await fetch('/api/captcha', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('auth.captchaLoadFailed'));
      setCaptchaId(data.challengeId);
      setCaptchaImage(data.image);
    } catch {
      setError(t('auth.captchaLoadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (loginMode === 'code') void refreshCaptcha();
  }, [loginMode, refreshCaptcha]);

  const handlePasswordLogin = async () => {
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
    } catch {
      setError(t('auth.loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError(null);
    setCodeMessage(null);
    if (!email) {
      setError(t('auth.enterEmail'));
      return;
    }
    if (!captchaId || !captchaAnswer) {
      setError(t('auth.enterCaptcha'));
      return;
    }
    setIsSendingCode(true);
    try {
      const response = await fetch('/api/login/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captchaId, captchaAnswer }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(language.startsWith('zh-') ? (data.error || t('auth.codeSendFailed')) : t('auth.codeSendFailed'));
        await refreshCaptcha();
        return;
      }
      setCodeMessage(t('auth.loginCodeSent'));
    } catch {
      setError(t('auth.codeSendFailed'));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleEmailCodeLogin = async () => {
    if (!email || !emailCode) {
      setError(t('auth.enterEmailCode'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/login/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: emailCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(language.startsWith('zh-') ? (data.error || t('auth.emailLoginFailed')) : t('auth.emailLoginFailed'));
        return;
      }
      window.location.assign(data.url || '/');
    } catch {
      setError(t('auth.emailLoginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 py-12 font-sans sm:px-6 lg:px-8">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><LanguageSwitcher variant="auth" /></div>
      <div className="w-full max-w-md space-y-8 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-[var(--shadow-card)]">
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
          onSubmit={(event) => {
            event.preventDefault();
            void (loginMode === 'password' ? handlePasswordLogin() : handleEmailCodeLogin());
          }}
          className="space-y-4 mt-8"
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-xs font-semibold text-red-600 dark:text-red-400">
              ⚠️ {error}
            </div>
          )}
          {codeMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {codeMessage}
            </div>
          )}

          <div className="grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-bold dark:border-gray-800 dark:bg-gray-900">
            <button type="button" onClick={() => setLoginMode('password')} className={`rounded-md px-3 py-2 transition ${loginMode === 'password' ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-800 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {t('auth.passwordLogin')}
            </button>
            <button type="button" onClick={() => setLoginMode('code')} className={`rounded-md px-3 py-2 transition ${loginMode === 'code' ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-800 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {t('auth.emailCodeLogin')}
            </button>
          </div>

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

          {loginMode === 'password' ? <div className="space-y-1">
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
            <div className="pt-1 text-right"><Link href="/forgot-password" className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-300">{t('auth.forgotPassword')}</Link></div>
          </div> : <>
            <div className="space-y-1">
              <label htmlFor="login-captcha" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('auth.captcha')}</label>
              <div className="flex items-stretch gap-2">
                <input id="login-captcha" value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} placeholder={t('auth.captchaPlaceholder')} className="h-12 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white" />
                <button type="button" onClick={refreshCaptcha} className="inline-flex h-12 w-[9.875rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-0 text-xs font-bold text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300" title={t('auth.refreshCaptcha')}>
                  {captchaImage ? <>
                    {/* CAPTCHA uses a short-lived data URL, not a remotely optimized image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={captchaImage} alt={t('auth.captcha')} className="block h-full w-full object-cover" />
                  </> : t('auth.refresh')}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="login-email-code" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('auth.emailCode')}</label>
              <div className="flex gap-2">
                <input id="login-email-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value)} placeholder={t('auth.emailCodePlaceholder')} className="min-w-0 flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white" />
                <button type="button" onClick={handleSendCode} disabled={isSendingCode || !email || !captchaAnswer} className="rounded-lg bg-gray-950 px-3 text-xs font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  {isSendingCode ? t('auth.sendingCode') : t('auth.sendCode')}
                </button>
              </div>
            </div>
          </>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? t('auth.processing') : loginMode === 'password' ? t('auth.enter') : t('auth.emailCodeLogin')}
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
