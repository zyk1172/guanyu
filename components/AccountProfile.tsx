'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import { useUiLanguage } from '@/components/LanguageProvider';
import { Button, Input, Select } from '@/components/ui/controls';
import { COUNTRY_CODES } from '@/lib/profile';
import { Fingerprint, Mail, Plus, Trash2, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

type Profile = { name: string | null; email: string; image: string | null; gender: string | null; country: string | null };
type Passkey = { id: string; name: string; createdAt: string; lastUsedAt: string | null };
const subscribe = () => () => {};
const supported = () => typeof PublicKeyCredential !== 'undefined' && window.isSecureContext;

export default function AccountProfile() {
  const { confirm } = useConfirmation();
  const { language } = useUiLanguage();
  const text = (zh: string, en: string) => language.startsWith('zh') ? zh : en;
  const canPasskey = useSyncExternalStore(subscribe, supported, () => false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [password, setPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [keyName, setKeyName] = useState('');
  const confirmation = useRef<HTMLDetailsElement>(null);
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: 'region' });
    return COUNTRY_CODES.map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, language));
  }, [language]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/api/account/profile', '/api/account/passkeys'].map(async url => {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('load');
      return response.json();
    })).then(([data, passkeys]) => { setProfile(data.profile); setKeys(passkeys.keys); setLoadFailed(false); }).catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, [reload]);
  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (response.status === 403 && confirmation.current) confirmation.current.open = true;
    if (!response.ok) throw new Error(language.startsWith('zh') ? data.error : 'Unable to save. Check your details and identity confirmation, then retry.');
    return data;
  }
  async function run(action: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(action); setError(''); setMessage('');
    try { await work(); if (['passkey', 'remove', 'email'].includes(action)) { setPassword(''); setEmailCode(''); } }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(''); }
  }
  const proof = () => ({ password: password || undefined, emailCode: emailCode || undefined });
  async function addPasskey() {
    await run('passkey', async () => {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const optionsJSON = await request('/api/passkeys/options', 'POST', { mode: 'register', ...proof() });
      let credential;
      try { credential = await startRegistration({ optionsJSON }); }
      catch (error) {
        if ((error as { code?: string }).code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || (error as Error).name === 'InvalidStateError') throw new Error(text('此设备已有通行密钥。可直接使用，或选择另一台设备／密码管理器添加。', 'This device already has a passkey. Use it, or choose another device or password manager.'));
        throw new Error(text('未完成设备验证，可重试。邮箱登录仍可使用。', 'Device verification did not finish. You can retry; email sign-in remains available.'));
      }
      await request('/api/passkeys/verify', 'POST', { mode: 'register', response: credential, name: keyName.trim() || text('我的通行密钥', 'My passkey') });
      const data = await request('/api/account/passkeys', 'GET'); setKeys(data.keys); setKeyName('');
      setMessage(text('通行密钥已添加，下次可用设备解锁登录。', 'Passkey added. Next time, sign in with your device unlock.'));
    });
  }
  if (loadFailed) return <div role="alert" className="rounded-lg border border-[var(--color-border)] p-4 text-sm">{text('个人资料加载失败。', 'Could not load your profile.')} <Button variant="ghost" type="button"  onClick={() => setReload(reload + 1)}>{text('重试', 'Retry')}</Button></div>;
  if (!profile) return <p role="status" className="text-sm text-[var(--color-text-muted)]">{text('正在加载个人资料…', 'Loading your profile…')}</p>;
  return <section className="settings-form grid items-start gap-6 lg:grid-cols-2" aria-label={text('个人资料与登录方式', 'Profile and sign-in')}>
    <div className="space-y-5">
    <div className="flex items-center gap-3">
      {profile.image ? <Image unoptimized src={profile.image} alt={text('你的头像', 'Your avatar')} width={64} height={64} className="h-16 w-16 shrink-0 rounded-full object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]"><UserRound size={28} aria-hidden="true" /></span>}
      <div className="min-w-0 flex-1">
        <h4 className="font-bold">{text('个人资料', 'Your profile')}</h4>
        <p className="mt-1 break-all text-xs text-[var(--color-text-muted)]">{profile.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-link)]">
          <label className="ui-label ui-file-action cursor-pointer underline">{text('上传头像', 'Upload avatar')}<Input aria-label={text('上传头像', 'Upload avatar')} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run('avatar', async () => { if (file.size > 2 * 1024 * 1024) throw new Error(text('图片不能超过 2 MB。', 'Image must be under 2 MB.')); const response = await fetch('/api/account/avatar', { method: 'POST', body: file }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setProfile(previous => previous && ({ ...previous, image: data.image })); setMessage(text('头像已更新。', 'Avatar updated.')); }); }} /></label>
          {profile.image && <Button variant="ghost" type="button" disabled={Boolean(busy)} onClick={() => void run('avatar', async () => { await request('/api/account/avatar', 'DELETE'); setProfile(previous => previous && ({ ...previous, image: null })); setMessage(text('头像已移除。', 'Avatar removed.')); })}>{text('移除', 'Remove')}</Button>}
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">JPG / PNG / WebP · {text('最大 2 MB', 'up to 2 MB')}</p>
      </div>
    </div>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run('profile', async () => { const data = await request('/api/account/profile', 'PATCH', { name: profile.name || '', gender: profile.gender || '', country: profile.country || '' }); setProfile(data.profile); setMessage(text('个人资料已保存。', 'Profile saved.')); }); }}>
      <label className="ui-label block">{text('显示名称（选填）', 'Display name (optional)')}<Input className="mt-2 w-full" maxLength={60} autoComplete="nickname" value={profile.name || ''} onChange={event => setProfile({ ...profile, name: event.target.value })} /><span className="mt-1 block text-xs font-normal text-[var(--color-text-muted)]">{text('会显示在你参与的讨论中。', 'Shown when you join a discussion.')}</span></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="ui-label block">{text('性别（选填）', 'Gender (optional)')}<Select className="mt-2 w-full" value={profile.gender || ''} onChange={event => setProfile({ ...profile, gender: event.target.value })}>{[['', text('不填写', 'Not specified')], ['female', text('女', 'Female')], ['male', text('男', 'Male')], ['non_binary', text('非二元', 'Non-binary')], ['undisclosed', text('不愿透露', 'Prefer not to say')]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="ui-label block">{text('国家或地区（选填）', 'Country or region (optional)')}<Select autoComplete="country" className="mt-2 w-full" value={profile.country || ''} onChange={event => setProfile({ ...profile, country: event.target.value })}><option value="">{text('不填写', 'Not specified')}</option>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</Select></label>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">{text('性别和地区仅保存在个人资料中，不会公开展示。', 'Gender and region are private and are not displayed publicly.')}</p>
      <Button variant="primary" type="submit" disabled={Boolean(busy)}>{busy === 'profile' ? text('保存中…', 'Saving…') : text('保存个人资料', 'Save profile')}</Button>
    </form>
    </div>
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <h4 className="flex items-center gap-2 font-bold"><Fingerprint size={18} aria-hidden="true" />{text('通行密钥', 'Passkeys')}</h4>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{text('使用指纹、面容或设备解锁登录。密钥保存在你的设备或密码管理器中，观隅只保存公钥；无需提供生物特征。', 'Sign in with your fingerprint, face or device unlock. Your device or password manager keeps the key; Guanyu stores only the public key, never biometric data.')}</p>
      {keys.length ? <ul className="mt-3 divide-y divide-[var(--color-border)]">{keys.map(key => <li key={key.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{key.name}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{key.lastUsedAt ? text('最近使用：', 'Last used: ') + new Date(key.lastUsedAt).toLocaleDateString(language) : text('尚未用于登录', 'Not used to sign in yet')}</p></div><Button variant="secondary" size="icon" type="button" disabled={Boolean(busy)} aria-label={text(`移除 ${key.name}`, `Remove ${key.name}`)} className="shrink-0" onClick={async () => { if (await confirm(text('移除此通行密钥？你仍可通过邮箱登录。', 'Remove this passkey? Email sign-in will remain available.'))) void run('remove', async () => { await request('/api/account/passkeys', 'DELETE', { id: key.id, ...proof() }); setKeys(keys.filter(item => item.id !== key.id)); setMessage(text('通行密钥已移除。', 'Passkey removed.')); }); }}><Trash2 size={16} aria-hidden="true" /></Button></li>)}</ul> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">{text('还没有通行密钥。邮箱登录始终可用。', 'No passkeys yet. Email sign-in is always available.')}</p>}
      {canPasskey ? <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void addPasskey(); }}><label className="ui-label min-w-0 flex-1">{text('密钥名称（选填）', 'Passkey name (optional)')}<Input className="mt-2 w-full" value={keyName} maxLength={60} placeholder={text('例如：我的手机', 'For example: My phone')} onChange={event => setKeyName(event.target.value)} /></label><Button variant="primary" type="submit" disabled={Boolean(busy) || keys.length >= 10}><Plus size={16} aria-hidden="true" />{busy === 'passkey' ? text('等待设备确认…', 'Waiting for device…') : text('添加通行密钥', 'Add passkey')}</Button></form> : <p className="mt-3 text-xs text-[var(--color-text-muted)]">{text('此浏览器暂不支持通行密钥，请在支持的浏览器中通过 HTTPS 打开本站。', 'Passkeys require a supported browser and HTTPS. Email sign-in remains available.')}</p>}
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">{text('换设备或丢失密钥？使用邮箱验证码登录后，可以添加新的密钥。', 'New device or lost key? Sign in with an email code and add a new passkey.')}</p>
    </div>
    <details ref={confirmation} className="rounded-xl border border-[var(--color-border)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">{text('敏感操作身份确认', 'Confirm your identity for sensitive changes')}</summary>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{text('添加、移除密钥或修改邮箱需要确认身份。刚登录 5 分钟内可直接操作；其他时候填写当前密码或当前邮箱验证码，二选一。', 'Passkey and email changes need identity confirmation. Within 5 minutes of signing in, no extra check is needed. Otherwise, use your current password or a code sent to your current email.')}</p>
      <label className="ui-label mt-3 block">{text('当前密码', 'Current password')}<Input className="mt-2 w-full" type="password" autoComplete="current-password" maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label className="ui-label mt-3 block">{text('或当前邮箱验证码', 'Or current email code')}<Input className="mt-2 w-full" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={event => setEmailCode(event.target.value.replace(/\D/g, ''))} /></label>
      <Button variant="ghost" type="button" disabled={Boolean(busy)} className="mt-2" onClick={() => void run('current-code', async () => { await request('/api/access/send-code', 'POST', { purpose: 'current-email' }); setMessage(text('验证码已发送到当前邮箱。', 'Code sent to your current email.')); })}>{text('发送到当前邮箱', 'Send to current email')}</Button>
    </details>
    <details className="rounded-xl border border-[var(--color-border)] p-4">
      <summary className="cursor-pointer text-sm font-semibold"><Mail size={16} className="mr-2 inline" aria-hidden="true" />{text('修改邮箱', 'Change email')}</summary>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{text('需验证新邮箱。保存后，其他设备和浏览器扩展将退出登录，已有报告和点数保留。通行密钥仍可使用。', 'Verify the new email before saving. Other sessions and browser extensions will be signed out. Reports, credits and passkeys stay with your account.')}</p>
      <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void run('email', async () => { await request('/api/account/email', 'PATCH', { email: newEmail, code: newCode, ...proof() }); window.location.reload(); }); }}>
        <label className="ui-label block">{text('新邮箱', 'New email')}<Input className="mt-2 w-full" type="email" autoComplete="email" required maxLength={254} value={newEmail} onChange={event => { setNewEmail(event.target.value); setNewCode(''); }} /></label>
        <Button variant="ghost" type="button" disabled={Boolean(busy) || !newEmail}  onClick={() => void run('new-code', async () => { await request('/api/access/send-code', 'POST', { purpose: 'new-email', email: newEmail }); setMessage(text('验证码已发送到新邮箱。', 'Code sent to your new email.')); })}>{text('验证新邮箱', 'Verify new email')}</Button>
        <label className="ui-label block">{text('新邮箱验证码', 'New email code')}<Input className="mt-2 w-full" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={newCode} onChange={event => setNewCode(event.target.value.replace(/\D/g, ''))} /></label>
        <Button variant="primary" type="submit" disabled={Boolean(busy)}>{text('保存新邮箱', 'Save new email')}</Button>
      </form>
    </details>
    <p className="text-xs text-[var(--color-text-muted)] lg:col-span-full">{text('没有设置过密码？可以通过', 'No password yet? Use ')}<Link className="text-[var(--color-link)] underline" href="/forgot-password">{text('邮箱找回／设置密码', 'email recovery to set one')}</Link>。</p>
    {error && <p role="alert" className="rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-danger)] lg:col-span-full">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-[var(--color-primary-soft)] p-3 text-sm text-[var(--color-primary)] lg:col-span-full">{message}</p>}
  </section>;
}
