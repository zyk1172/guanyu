'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flag, LockKeyhole, MessageCircle, Reply, ShieldCheck } from 'lucide-react';
import { useUiLanguage } from './LanguageProvider';

type Message = {
  id: string;
  content: string;
  createdAt: string;
  isEdited: boolean;
  status: string;
  user: { name: string | null };
  replies: Message[];
};

type DiscussionPayload = {
  messages?: Message[];
  locked?: boolean;
  canModerate?: boolean;
  currentUserId?: string | null;
  nextCursor?: string | null;
};

export default function DiscussionBoard({ auditId }: { auditId: string }) {
  const { language, t } = useUiLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [locked, setLocked] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    setError('');
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const res = await fetch(`/api/audits/${encodeURIComponent(auditId)}/discussion${query}`, { cache: 'no-store' });
      const data: DiscussionPayload & { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('discussion.loadFailed'));
      setMessages((current) => cursor ? [...(data.messages || []), ...current] : (data.messages || []));
      setLocked(Boolean(data.locked));
      setCanModerate(Boolean(data.canModerate));
      setNextCursor(data.nextCursor || null);
    } catch (err: any) {
      setError(err?.message || t('discussion.loadFailed'));
    } finally {
      if (cursor) setLoadingMore(false);
    }
  }, [auditId, t]);

  useEffect(() => { void load(); }, [load]);

  const requestAction = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/discussion`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('discussion.actionFailed'));
    await load();
    return data;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || sending || locked) return;
    setSending(true); setError('');
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/discussion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, parentMessageId: replyTo, languageCode: language, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('discussion.postFailed'));
      setText(''); setReplyTo(null); await load();
    } catch (err: any) { setError(err?.message || t('discussion.postFailed')); } finally { setSending(false); }
  };

  const report = async (messageId: string) => {
    const reason = window.prompt(t('discussion.reportPrompt'));
    if (!reason?.trim()) return;
    try { await requestAction({ action: 'report', messageId, reason: reason.trim() }); setError(t('discussion.reported')); }
    catch (err: any) { setError(err?.message || t('discussion.actionFailed')); }
  };

  const row = (message: Message, nested = false) => (
    <article key={message.id} className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 ${nested ? 'ml-4 mt-2' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-xxs text-[var(--color-text-subtle)]">
        <span className="font-bold text-[var(--color-text)]">{message.user?.name || t('discussion.reader')}</span>
        <time>{new Date(message.createdAt).toLocaleString(language)}</time>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--color-text)]">{message.status === 'DELETED' ? t('discussion.deleted') : message.content}</p>
      {message.status === 'HIDDEN' && <p className="mt-1 text-xxs font-semibold text-[var(--color-warning)]">{t('discussion.hidden')}</p>}
      {message.isEdited && <span className="mt-1 block text-xxs text-[var(--color-text-subtle)]">{t('discussion.edited')}</span>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {!nested && message.status === 'VISIBLE' && <button type="button" onClick={() => setReplyTo(message.id)} className="inline-flex items-center gap-1 text-xxs font-bold text-[var(--color-link)]"><Reply size={12} />{t('discussion.reply')}</button>}
        {message.status === 'VISIBLE' && <button type="button" onClick={() => void report(message.id)} className="inline-flex items-center gap-1 text-xxs font-bold text-[var(--color-text-muted)]"><Flag size={12} />{t('discussion.report')}</button>}
        {canModerate && message.status !== 'DELETED' && <button type="button" onClick={() => void requestAction({ action: message.status === 'HIDDEN' ? 'restore' : 'hide', messageId: message.id }).catch((err) => setError(err.message))} className="inline-flex items-center gap-1 text-xxs font-bold text-[var(--color-warning)]"><ShieldCheck size={12} />{message.status === 'HIDDEN' ? t('discussion.restore') : t('discussion.hide')}</button>}
      </div>
      {message.replies?.map((reply) => row(reply, true))}
    </article>
  );

  return <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-[var(--shadow-card)] sm:p-4">
    <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black text-[var(--color-text)]"><MessageCircle size={16} />{t('discussion.title')} <span className="text-xxs font-semibold text-[var(--color-text-subtle)]">{messages.length}</span></h3>
        <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{locked ? t('discussion.locked') : t('discussion.hint')}</p>
      </div>
      {canModerate && <button type="button" onClick={() => void requestAction({ action: locked ? 'unlock' : 'lock' }).catch((err) => setError(err.message))} className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--color-border-strong)] px-2 py-1 text-xxs font-bold text-[var(--color-text)]"><LockKeyhole size={12} />{locked ? t('discussion.unlock') : t('discussion.lock')}</button>}
    </div>
    {nextCursor && <div className="mb-2 text-center"><button type="button" disabled={loadingMore} onClick={() => void load(nextCursor)} className="rounded border border-[var(--color-border)] px-3 py-1.5 text-xxs font-bold text-[var(--color-link)] disabled:opacity-50">{loadingMore ? t('discussion.loadingMore') : t('discussion.loadMore')}</button></div>}
    <div className="space-y-2">{messages.length ? messages.map((message) => row(message)) : <p className="py-3 text-center text-xs text-[var(--color-text-muted)]">{t('discussion.empty')}</p>}</div>
    <form onSubmit={submit} className="mt-3 border-t border-[var(--color-border)] pt-3">
      <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} disabled={locked || sending} placeholder={replyTo ? t('discussion.replyPlaceholder') : t('discussion.placeholder')} className="min-h-20 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] p-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
      <div className="mt-2 flex items-center justify-between gap-2">
        {error && <span className="text-xxs font-semibold text-[var(--color-danger)]">{error}</span>}
        <div className="ml-auto flex gap-2">
          {replyTo && <button type="button" onClick={() => setReplyTo(null)} className="text-xxs font-bold text-[var(--color-text-muted)]">{t('discussion.cancelReply')}</button>}
          <button type="submit" disabled={locked || sending || !text.trim()} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{replyTo ? t('discussion.reply') : t('discussion.post')}</button>
        </div>
      </div>
    </form>
  </section>;
}
