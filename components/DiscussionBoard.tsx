'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import { Button, Panel, Textarea } from '@/components/ui/controls';
import { Flag, LockKeyhole, MessageCircle, Reply, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  const { prompt } = useConfirmation();
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
    const reason = await prompt(t('discussion.reportPrompt'));
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
        {!nested && message.status === 'VISIBLE' && <Button variant="ghost" type="button" onClick={() => setReplyTo(message.id)}><Reply size={12} />{t('discussion.reply')}</Button>}
        {message.status === 'VISIBLE' && <Button variant="ghost" type="button" onClick={() => void report(message.id)}><Flag size={12} />{t('discussion.report')}</Button>}
        {canModerate && message.status !== 'DELETED' && <Button variant="ghost" type="button" onClick={() => void requestAction({ action: message.status === 'HIDDEN' ? 'restore' : 'hide', messageId: message.id }).catch((err) => setError(err.message))}><ShieldCheck size={12} />{message.status === 'HIDDEN' ? t('discussion.restore') : t('discussion.hide')}</Button>}
      </div>
      {message.replies?.map((reply) => row(reply, true))}
    </article>
  );

  return <Panel>
    <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]"><MessageCircle size={16} />{t('discussion.title')} <span className="text-xxs font-semibold text-[var(--color-text-subtle)]">{messages.length}</span></h3>
        <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{locked ? t('discussion.locked') : t('discussion.hint')}</p>
      </div>
      {canModerate && <Button variant="secondary" type="button" onClick={() => void requestAction({ action: locked ? 'unlock' : 'lock' }).catch((err) => setError(err.message))} className="shrink-0"><LockKeyhole size={12} />{locked ? t('discussion.unlock') : t('discussion.lock')}</Button>}
    </div>
    {nextCursor && <div className="mb-2 text-center"><Button variant="secondary" type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? t('discussion.loadingMore') : t('discussion.loadMore')}</Button></div>}
    <div className="space-y-2">{messages.length ? messages.map((message) => row(message)) : <p className="py-3 text-center text-xs text-[var(--color-text-muted)]">{t('discussion.empty')}</p>}</div>
    <form onSubmit={submit} className="mt-3 border-t border-[var(--color-border)] pt-3">
      <Textarea aria-label={replyTo ? t('discussion.replyPlaceholder') : t('discussion.placeholder')} value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} disabled={locked || sending} placeholder={replyTo ? t('discussion.replyPlaceholder') : t('discussion.placeholder')} className="w-full" />
      <div className="mt-2 flex items-center justify-between gap-2">
        {error && <span className="text-xxs font-semibold text-[var(--color-danger)]">{error}</span>}
        <div className="ml-auto flex gap-2">
          {replyTo && <Button variant="ghost" type="button" onClick={() => setReplyTo(null)}>{t('discussion.cancelReply')}</Button>}
          <Button variant="primary" type="submit" disabled={locked || sending || !text.trim()}>{replyTo ? t('discussion.reply') : t('discussion.post')}</Button>
        </div>
      </div>
    </form>
  </Panel>;
}
