'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUiLanguage } from '@/components/LanguageProvider';
import { getBrandIdentity } from '@/lib/brand-core.mjs';

export default function RegisterPage() {
  const { t, language } = useUiLanguage();
  const brand = getBrandIdentity(language);
  const genericError = (key: string, serverMessage?: string) => language.startsWith('zh-') ? (serverMessage || t(key)) : t(key);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);

  const refreshCaptcha = async () => {
    setCaptchaAnswer('');
    try {
      const response = await fetch('/api/captcha', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(genericError('auth.captchaLoadFailed', data.error));
      setCaptchaId(data.challengeId);
      setCaptchaImage(data.image);
    } catch (err: any) {
      setError(err?.message || t('auth.captchaLoadFailed'));
    }
  };

  useEffect(() => {
    void refreshCaptcha();
  }, [language]);

  const handleSendCode = async () => {
    setError(null);
    setCodeMessage(null);

    if (!email) {
      setError(t('auth.enterEmail'));
      return;
    }
    if (!captchaAnswer) {
      setError(t('auth.enterCaptcha'));
      return;
    }

    setIsSendingCode(true);
    try {
      const response = await fetch('/api/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captchaId, captchaAnswer }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(genericError('auth.codeSendFailed', result.error));
        await refreshCaptcha();
        return;
      }
      setCodeMessage(t('auth.codeSent'));
    } catch {
      setError(t('auth.codeSendFailed'));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleRegister = async () => {
    setError(null);

    if (!email || !password) {
      setError(t('auth.enterEmailPassword'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (!emailCode) {
      setError(t('auth.enterEmailCode'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword, emailCode }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(genericError('auth.registrationFailed', result.error));
        return;
      }

      window.location.assign(result.url || '/account');
    } catch (err) {
      console.error('注册失败:', err);
      setError(t('auth.registrationFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans flex items-center justify-center py-10 px-4">
      <div className="animate-fade-up max-w-md w-full space-y-6 bg-white dark:bg-gray-950 p-7 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="text-center">
          <Image
            src="/guanyu-icon.png"
            alt={brand.name}
            width={44}
            height={44}
            className="mx-auto h-11 w-11 rounded-xl object-cover shadow-sm mb-3"
            priority
          />
          <h1 className="text-xl font-black text-gray-950 dark:text-white tracking-tight">{t('auth.registerTitle')}</h1>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {t('auth.registerDescription')}
          </p>
        </div>

        <form
          action="/api/register"
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRegister();
          }}
          className="space-y-4"
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-xs font-semibold text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {codeMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {codeMessage}
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="register-email" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.email')}
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="interactive-lift w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="register-captcha" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.captcha')}
            </label>
            <div className="flex gap-2">
              <input
                id="register-captcha"
                type="text"
                required
                value={captchaAnswer}
                onChange={(event) => setCaptchaAnswer(event.target.value)}
                placeholder={t('auth.captchaPlaceholder')}
                className="interactive-lift min-w-0 flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
              />
              <button
                type="button"
                onClick={refreshCaptcha}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs font-bold text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
                title={t('auth.refreshCaptcha')}
              >
                {captchaImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={captchaImage} alt={t('auth.captcha')} className="h-10 w-28 rounded object-cover" />
                ) : t('auth.refresh')}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-email-code" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.emailCode')}
            </label>
            <div className="flex gap-2">
              <input
                id="register-email-code"
                name="emailCode"
                type="text"
                required
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value)}
                placeholder={t('auth.emailCodePlaceholder')}
                className="interactive-lift min-w-0 flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={isSendingCode || !email || !captchaAnswer}
                className="rounded-lg bg-gray-950 px-3 text-xs font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
              >
                {isSendingCode ? t('auth.sendingCode') : t('auth.sendCode')}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-password" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.password')}
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('auth.passwordMin')}
              className="interactive-lift w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="register-confirm-password" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('auth.confirmPassword')}
            </label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              className="interactive-lift w-full px-3 py-2.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="interactive-lift w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm shadow-sm transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
          >
            {isLoading ? t('auth.creatingAccount') : t('auth.register')}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs">
          <Link href="/" className="font-semibold text-gray-500 hover:text-indigo-600">
            {t('common.backHome')}
          </Link>
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            {t('auth.hasAccount')}
          </Link>
        </div>
      </div>
    </main>
  );
}
