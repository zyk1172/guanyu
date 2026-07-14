'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getBrandIdentity } from '@/lib/brand-core.mjs';
import { useUiLanguage } from '@/components/LanguageProvider';

export default function ForgotPasswordPage() {
  const { language, t } = useUiLanguage();
  const brand = getBrandIdentity(language);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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
    void refreshCaptcha();
  }, [refreshCaptcha]);

  const sendCode = async () => {
    setError(null);
    setMessage(null);
    if (!email || !captchaId || !captchaAnswer) {
      setError(!email ? t('auth.enterEmail') : t('auth.enterCaptcha'));
      return;
    }
    setIsSendingCode(true);
    try {
      const response = await fetch('/api/password/send-code', {
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
      setMessage(t('auth.resetCodeSent'));
    } catch {
      setError(t('auth.codeSendFailed'));
    } finally {
      setIsSendingCode(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    if (!email || !code || !password || !confirmPassword) {
      setError(t('auth.resetFillAll'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordMinEight'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setIsResetting(true);
    try {
      const response = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password, confirmPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(language.startsWith('zh-') ? (data.error || t('auth.resetFailed')) : t('auth.resetFailed'));
        return;
      }
      window.location.assign(data.url || '/account');
    } catch {
      setError(t('auth.resetFailed'));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 font-sans dark:bg-black">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-xl border border-gray-100 bg-white p-7 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="text-center">
          <Image src="/guanyu-icon.png" alt={brand.name} width={44} height={44} className="mx-auto mb-3 h-11 w-11 rounded-xl object-cover shadow-sm" priority />
          <h1 className="text-xl font-black text-gray-950 dark:text-white">{t('auth.resetTitle')}</h1>
          <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('auth.resetDescription')}</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void resetPassword(); }} className="space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">{error}</div>}
          {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('auth.email')}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white" />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('auth.captcha')}
            <div className="flex items-stretch gap-2">
              <input value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} placeholder={t('auth.captchaPlaceholder')} className="h-12 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white" />
              <button type="button" onClick={refreshCaptcha} className="inline-flex h-12 w-[9.875rem] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-0 text-xs font-bold normal-case tracking-normal text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300" title={t('auth.refreshCaptcha')}>
                {captchaImage ? <>
                  {/* CAPTCHA uses a short-lived data URL, not a remotely optimized image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={captchaImage} alt={t('auth.captcha')} className="block h-full w-full object-cover" />
                </> : t('auth.refresh')}
              </button>
            </div>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('auth.emailCode')}
            <div className="flex gap-2">
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t('auth.emailCodePlaceholder')} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white" />
              <button type="button" onClick={sendCode} disabled={isSendingCode || !email || !captchaAnswer} className="rounded-lg bg-gray-950 px-3 text-xs font-bold normal-case tracking-normal text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">{isSendingCode ? t('auth.sendingCode') : t('auth.sendCode')}</button>
            </div>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('auth.newPassword')}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={t('auth.passwordMinEight')} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white" />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('auth.confirmPassword')}
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder={t('auth.confirmPasswordPlaceholder')} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white" />
          </label>
          <button type="submit" disabled={isResetting} className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-800">{isResetting ? t('auth.resetting') : t('auth.resetPassword')}</button>
        </form>
        <div className="flex justify-between text-xs"><Link href="/" className="font-semibold text-gray-500 hover:text-indigo-600">{t('common.backHome')}</Link><Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">{t('auth.backToLogin')}</Link></div>
      </div>
    </main>
  );
}
