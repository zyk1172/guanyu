'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import { ActionLink, Button, ButtonLink, Panel } from '@/components/ui/controls';
import { useEffect, useState } from 'react';

interface ExtensionSession {
  id: string;
  name: string;
  browser?: string | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export default function ExtensionSettingsPage() {
  const { confirm } = useConfirmation();
  const { language, t } = useUiLanguage();
  const [sessions, setSessions] = useState<ExtensionSession[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadOrigin, setDownloadOrigin] = useState('');
  const extensionDownloadPath = '/downloads/guanyu-browser-extension.zip';
  const extensionDownloadUrl = downloadOrigin ? `${downloadOrigin}${extensionDownloadPath}` : extensionDownloadPath;

  async function loadSessions() {
    const res = await fetch('/api/extension/sessions');
    if (res.status === 401) {
      setMessage('请先登录后管理插件授权。');
      return;
    }
    if (res.ok) setSessions(await res.json());
  }

  async function createCode() {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/extension/link-code', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '生成插件连接码失败。');
        return;
      }
      setCode(data.code);
      setMessage('连接码已生成，有效期 10 分钟，只显示一次。');
      await loadSessions();
    } finally {
      setLoading(false);
    }
  }

  async function revoke(id: string) {
    if (!await confirm('确定撤销这个插件授权吗？')) return;
    const res = await fetch(`/api/extension/sessions/${id}/revoke`, { method: 'POST' });
    if (res.ok) {
      await loadSessions();
      setMessage('插件授权已撤销。');
    }
  }

  useEffect(() => {
    loadSessions();
    setDownloadOrigin(window.location.origin);
  }, []);

  return (
    <main className="workspace-page pb-12">
      <Header />
      <section id="main-content" tabIndex={-1} className="workspace-container workspace-content">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="ui-page-title">{t('extension.title')}</h1>
            <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
              {t('extension.description')}
            </p>
          </div>
          <ButtonLink variant="secondary" href="/account">
            {t('extension.backAccount')}
          </ButtonLink>
        </div>

        <Panel as="div" className="mb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text)]">{t('extension.downloadTitle')}</h2>
              <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                {t('extension.downloadDescription')}
              </p>
              <code className="mt-3 block break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xxs font-semibold text-[var(--color-text)]">
                {extensionDownloadUrl}
              </code>
            </div>
            <ActionLink variant="primary"
              href={extensionDownloadPath}
              download
              className="shrink-0"
           >
              {t('extension.download')}
            </ActionLink>
          </div>
        </Panel>

        <Panel as="div">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold">{t('extension.codeTitle')}</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {t('extension.codeDescription')}
              </p>
            </div>
            <Button variant="primary"
              onClick={createCode}
              disabled={loading}
           >
              {loading ? t('extension.creatingCode') : t('extension.createCode')}
            </Button>
          </div>
          {code && (
            <Panel as="div" className="mt-4 text-center">
              <div className="rounded-lg bg-[var(--color-surface)] px-4 py-3 text-3xl font-bold tracking-[0.32em] text-[var(--color-text)] shadow-inner">{code}</div>
              <p className="mt-2 text-xs font-bold text-[var(--color-on-primary)]">只显示一次，请不要公开分享。</p>
            </Panel>
          )}
          {message && <p className="mt-3 text-xs font-semibold text-[var(--color-link)]">{message}</p>}
        </Panel>

        <Panel as="div" className="mt-4">
          <h2 className="text-sm font-bold">{t('extension.sessionsTitle')}</h2>
          <div className="mt-3 space-y-2">
            {sessions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-xs text-[var(--color-text-subtle)]">
                {t('extension.noSessions')}
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-bold text-[var(--color-text)]">{session.name}</div>
                    <div className="mt-1 text-xxs text-[var(--color-text-muted)]">
                      {session.browser || t('common.unknown')} · {new Date(session.createdAt).toLocaleString(language)}
                      {session.lastUsedAt ? ` · ${new Date(session.lastUsedAt).toLocaleString(language)}` : ''}
                    </div>
                  </div>
                  {session.revokedAt ? (
                    <span className="ui-badge bg-[var(--color-surface)] text-[var(--color-text-muted)]">{t('extension.revoked')}</span>
                  ) : (
                    <Button variant="danger" onClick={() => revoke(session.id)}>
                      {t('extension.revoke')}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </main>
  );
}
