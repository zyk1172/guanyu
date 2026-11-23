'use client';

import { useUiLanguage } from '@/components/LanguageProvider';
import { Button, Input, Panel } from '@/components/ui/controls';
import { getBrandIdentity } from '@/lib/brand-core.mjs';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

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
    <main className="auth-page min-h-screen bg-[var(--color-surface-muted)] px-4 py-10 font-sans">
      <Panel as="div" className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center">
          <Image src="/guanyu-icon.png" alt={brand.name} width={44} height={44} className="mx-auto mb-3 h-11 w-11 rounded-xl object-cover shadow-sm" priority />
          <h1 className="ui-page-title">{t('auth.resetTitle')}</h1>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{t('auth.resetDescription')}</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void resetPassword(); }} className="space-y-4">
          {error && <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{error}</div>}
          {message && <div className="rounded-lg border border-[var(--color-success)] bg-[var(--color-success-soft)] p-3 text-xs font-semibold text-[var(--color-success)]">{message}</div>}
          <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
            {t('auth.email')}
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
          </label>
          <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
            {t('auth.captcha')}
            <div className="flex items-stretch gap-2">
              <Input value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} placeholder={t('auth.captchaPlaceholder')} className="min-w-0 flex-1" />
              <Button variant="secondary" type="button" onClick={refreshCaptcha} className="captcha-button" aria-label={t('auth.refreshCaptcha')}>
                {captchaImage ? <>
                  {/* CAPTCHA uses a short-lived data URL, not a remotely optimized image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={captchaImage} alt={t('auth.captcha')} width={158} height={44} className="block h-full w-full object-contain" />
                </> : t('auth.refresh')}
              </Button>
            </div>
          </label>
          <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
            {t('auth.emailCode')}
            <div className="flex gap-2">
              <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t('auth.emailCodePlaceholder')} className="min-w-0 flex-1" />
              <Button variant="primary" type="button" onClick={sendCode} disabled={isSendingCode || !email || !captchaAnswer}>{isSendingCode ? t('auth.sendingCode') : t('auth.sendCode')}</Button>
            </div>
          </label>
          <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
            {t('auth.newPassword')}
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={t('auth.passwordMinEight')} />
          </label>
          <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
            {t('auth.confirmPassword')}
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder={t('auth.confirmPasswordPlaceholder')} />
          </label>
          <Button variant="primary" type="submit" disabled={isResetting} className="w-full">{isResetting ? t('auth.resetting') : t('auth.resetPassword')}</Button>
        </form>
        <div className="flex justify-between text-xs"><Link href="/" className="font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-link)]">{t('common.backHome')}</Link><Link href="/login" className="font-semibold text-[var(--color-link)] hover:text-[var(--color-link)]">{t('auth.backToLogin')}</Link></div>
      </Panel>
    </main>
  );
}
