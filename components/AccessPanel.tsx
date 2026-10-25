'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Fingerprint, ArrowRight, Mail } from 'lucide-react';
import { useUiLanguage } from '@/components/LanguageProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const subscribe = () => () => {};
const supported = () => typeof PublicKeyCredential !== 'undefined' && window.isSecureContext;
export default function AccessPanel() {
  const { language } = useUiLanguage();
  const text = (zh: string, en: string) => language.startsWith('zh') ? zh : en;
  const canPasskey = useSyncExternalStore(subscribe, supported, () => false);
  const [mode, setMode] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function post(url: string, body: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(language.startsWith('zh') ? data.error : 'Unable to continue. Check your details or try another sign-in method.');
    return data;
  }
  async function submit() {
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'email' && !sentTo) {
        await post('/api/access/send-code', { email }); setSentTo(email); setCooldown(60);
        setMessage(text('验证码已发送，10 分钟内有效。', 'Code sent. It expires in 10 minutes.'));
      } else {
        const data = await post(mode === 'email' ? '/api/access/verify' : '/api/login', mode === 'email' ? { email: sentTo, code } : { email, password });
        window.location.assign(data.url);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function signInWithPasskey() {
    setBusy(true); setError(''); setMessage('');
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const optionsJSON = await post('/api/passkeys/options', { mode: 'login' });
      const assertion = await startAuthentication({ optionsJSON });
      const data = await post('/api/passkeys/verify', { mode: 'login', response: assertion });
      window.location.assign(data.url);
    } catch {
      setError(text('通行密钥登录未完成。可重试，或使用邮箱继续。', 'Passkey sign-in did not finish. Retry or continue with email.'));
    } finally { setBusy(false); }
  }
  return <main className="auth-page relative flex min-h-screen items-center justify-center px-4 py-16">
    <div className="absolute right-4 top-4"><LanguageSwitcher variant="auth" /></div>
    <div className="settings-form w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-card)] sm:p-8">
      <Link href="/" aria-label={text('返回首页', 'Home')}><Image src="/guanyu-icon.png" alt="观隅 Guanyu" width={44} height={44} className="mb-6 rounded-xl" priority /></Link>
      <h1 className="font-bold text-[var(--color-text)]">{text('欢迎来到观隅', 'Welcome to Guanyu')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{text('邮箱验证即可开始。首次使用会自动创建账号，无需设置密码。', 'Verify your email to get started. New here? An account is created automatically, with no password to set.')}</p>
      {canPasskey && <>
        <button type="button" disabled={busy} onClick={signInWithPasskey} className="workspace-button workspace-primary mt-6 w-full"><Fingerprint size={20} aria-hidden="true" />{text('使用通行密钥登录', 'Sign in with a passkey')}</button>
        <p className="mt-2 text-center text-xs leading-relaxed text-[var(--color-text-muted)]">{text('已添加密钥？通过指纹、面容或设备解锁直接进入。', 'Already have a passkey? Use your fingerprint, face or device unlock.')}</p>
        <div className="my-5 flex items-center gap-3 text-xs text-[var(--color-text-muted)]"><span className="h-px flex-1 bg-[var(--color-border)]" />{text('或使用邮箱', 'or use email')}<span className="h-px flex-1 bg-[var(--color-border)]" /></div>
      </>}
      <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="block text-sm font-semibold">{text('邮箱', 'Email')}<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy || Boolean(sentTo)} className="mt-2 w-full" placeholder="you@example.com" /></label>
        {mode === 'email' && sentTo && <>
          <button type="button" className="text-xs text-[var(--color-link)] underline" disabled={busy} onClick={() => { setSentTo(''); setCode(''); setMessage(''); setError(''); }}>{text('更换邮箱', 'Change email')}</button>
          <label className="block text-sm font-semibold">{text('邮箱验证码', 'Email code')}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className="mt-2 w-full tracking-[0.3em]" placeholder="000000" /></label>
          <button type="button" disabled={busy || cooldown > 0} className="text-xs text-[var(--color-link)] disabled:opacity-60" onClick={async () => { setBusy(true); setError(''); try { await post('/api/access/send-code', { email: sentTo }); setCooldown(60); setMessage(text('新的验证码已发送。', 'A new code has been sent.')); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>{cooldown ? text(`${cooldown} 秒后可重发`, `Resend in ${cooldown}s`) : text('重新发送验证码', 'Resend code')}</button>
        </>}
        {mode === 'password' && <label className="block text-sm font-semibold">{text('密码', 'Password')}<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full" /></label>}
        {error && <p role="alert" className="rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}
        {message && <p role="status" className="text-sm text-[var(--color-primary)]">{message}</p>}
        <button type="submit" disabled={busy} className="workspace-button workspace-primary w-full"><Mail size={18} aria-hidden="true" />{busy ? text('处理中…', 'Please wait…') : mode === 'password' ? text('登录', 'Sign in') : sentTo ? text('验证并进入', 'Verify and continue') : text('获取验证码', 'Send email code')}<ArrowRight size={16} aria-hidden="true" /></button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs text-[var(--color-link)]">
        <button type="button" disabled={busy} onClick={() => { setMode(mode === 'email' ? 'password' : 'email'); setSentTo(''); setError(''); setMessage(''); }}>{mode === 'email' ? text('已有密码？使用密码登录', 'Have a password? Sign in with it') : text('使用邮箱验证码', 'Use an email code')}</button>
        {mode === 'password' && <Link href="/forgot-password">{text('忘记密码', 'Forgot password')}</Link>}
      </div>
      <div className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs leading-relaxed text-[var(--color-text-muted)]"><Link href="/demo" className="text-[var(--color-link)] underline">{text('先看示例报告', 'Explore a sample report')}</Link>{text('，无需登录。添加通行密钥后，下次可通过设备解锁登录；仍可用邮箱恢复访问。', ', no sign-in needed. Add a passkey after signing in for faster access next time. Email remains available for recovery.')}</div>
    </div>
  </main>;
}
