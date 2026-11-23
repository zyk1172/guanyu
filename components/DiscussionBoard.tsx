'use client';

import Image from 'next/image';
import { Flag, LockKeyhole, MessageCircle, Reply, ShieldCheck, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useConfirmation } from '@/components/ui/ConfirmationProvider';
import { Button, ButtonLink, Panel, Textarea } from '@/components/ui/controls';
import type { DiscussionMessage } from '@/lib/discussion-dto';
import { useUiLanguage } from './LanguageProvider';

type DiscussionPayload = {
  messages: DiscussionMessage[];
  locked: boolean;
  canModerate: boolean;
  canPost: boolean;
  authenticated: boolean;
  nextCursor: string | null;
};

const messageAnchor = (id: string) => 'discussion-message-' + id;

function AuthorAvatar({ author }: { author: DiscussionMessage['author'] }) {
  const [failed, setFailed] = useState(false);
  const image = author?.image;
  return <span className="discussion-avatar" aria-hidden="true">
    {image && !failed
      ? <Image src={image} alt="" width={40} height={40} unoptimized loading="lazy" onError={() => setFailed(true)} />
      : (Array.from(author?.name || '')[0] || <UserRound size={20} />)}
  </span>;
}

export default function DiscussionBoard({ auditId }: { auditId: string }) {
  const { prompt } = useConfirmation();
  const { language, t } = useUiLanguage();
  const [board, setBoard] = useState<DiscussionPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState<{ scope: string; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const replyInput = useRef<HTMLTextAreaElement>(null);
  const replyTrigger = useRef<HTMLButtonElement | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(new Map<string, { content: string; key: string }>());
  const url = '/api/audits/' + encodeURIComponent(auditId) + '/discussion';

  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    if (cursor) setLoadingMore(true);
    setLoadError('');
    try {
      const query = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
      const res = await fetch(url + query, { cache: 'no-store', signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('discussion.loadFailed'));
      setBoard(current => ({ ...data, messages: cursor && current
        ? [...data.messages.filter((item: DiscussionMessage) => !current.messages.some(message => message.id === item.id)), ...current.messages]
        : data.messages }));
    } catch (err) {
      if (!signal?.aborted) setLoadError(err instanceof Error ? err.message : t('discussion.loadFailed'));
    } finally {
      if (cursor) setLoadingMore(false);
    }
  }, [url, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (replyTo) replyInput.current?.focus();
  }, [replyTo]);

  const name = (item: DiscussionMessage) => item.author?.name
    || [t('discussion.reader'), item.author?.alias].filter(Boolean).join(' ');
  const canWrite = board?.canPost && !board.locked;

  const patch = async (payload: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('discussion.actionFailed'));
    return data;
  };

  const lock = async () => {
    setError(null);
    setBusy('lock');
    try {
      const data = await patch({ action: board?.locked ? 'unlock' : 'lock' });
      setBoard(current => current && { ...current, locked: data.locked });
    } catch (err) {
      setError({ scope: 'board', message: err instanceof Error ? err.message : t('discussion.actionFailed') });
    } finally {
      setBusy(null);
    }
  };

  const moderate = async (message: DiscussionMessage, action: 'report' | 'hide' | 'restore') => {
    const reason = action === 'report' ? await prompt(t('discussion.reportPrompt')) : undefined;
    if (action === 'report' && !reason?.trim()) return;
    setError(null);
    setNotice('');
    setBusy(message.id);
    try {
      const data = await patch({ action, messageId: message.id, reason: reason?.trim() });
      if (action === 'report') setNotice(t('discussion.reported'));
      else {
        setBoard(current => current && { ...current, messages: current.messages.map(root =>
          root.id === message.id ? { ...root, ...data.message }
            : { ...root, replies: root.replies?.map(reply => reply.id === message.id ? data.message : reply) }) });
        if (action === 'hide' && (replyTo === message.id || message.replies?.some(reply => reply.id === replyTo))) setReplyTo(null);
      }
    } catch (err) {
      setError({ scope: 'board', message: err instanceof Error ? err.message : t('discussion.actionFailed') });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (event: FormEvent, target?: DiscussionMessage) => {
    event.preventDefault();
    const scope = target?.id || 'new';
    const content = (drafts[scope] || '').trim();
    if (!content || !canWrite || inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(scope);
    setError(null);
    setNotice('');
    const previous = pending.current.get(scope);
    const attempt = previous?.content === content ? previous : { content, key: crypto.randomUUID() };
    pending.current.set(scope, attempt);
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, replyToMessageId: target?.id, languageCode: language, idempotencyKey: attempt.key }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.message?.id) throw new Error(data.error || t('discussion.postFailed'));
      const message: DiscussionMessage = data.message;
      setBoard(current => current && { ...current, messages: message.parentMessageId
        ? current.messages.map(root => root.id === message.parentMessageId && !root.replies?.some(reply => reply.id === message.id)
          ? { ...root, replies: [...(root.replies || []), message] } : root)
        : current.messages.some(root => root.id === message.id) ? current.messages : [...current.messages, message] });
      pending.current.delete(scope);
      setDrafts(current => ({ ...current, [scope]: '' }));
      setReplyTo(null);
      setNotice(t('discussion.posted'));
      requestAnimationFrame(() => document.getElementById(messageAnchor(message.id))?.focus());
    } catch (err) {
      setError({ scope, message: err instanceof Error ? err.message : t('discussion.postFailed') });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const cancelReply = () => {
    setReplyTo(null);
    requestAnimationFrame(() => replyTrigger.current?.focus());
  };

  const beginReply = (event: MouseEvent<HTMLButtonElement>, target: DiscussionMessage) => {
    replyTrigger.current = event.currentTarget;
    setReplyTo(target.id);
    if (replyTo === target.id) replyInput.current?.focus();
  };

  const composer = (target?: DiscussionMessage) => {
    const scope = target?.id || 'new';
    const value = drafts[scope] || '';
    const fieldId = 'discussion-draft-' + scope;
    return <form onSubmit={event => void submit(event, target)} className="discussion-composer" onKeyDown={event => {
      if (target && event.key === 'Escape' && !busy) cancelReply();
    }}>
      <label className="ui-label ui-field-label" htmlFor={fieldId}>
        {target ? t('discussion.replyingTo').replace('{name}', name(target)) : t('discussion.placeholder')}
      </label>
      {target && <blockquote className="discussion-quote">{target.content}</blockquote>}
      <Textarea id={fieldId} ref={target ? replyInput : undefined} rows={target ? 2 : 3} value={value} maxLength={2000}
        disabled={Boolean(busy)} aria-invalid={error?.scope === scope ? true : undefined}
        aria-describedby={error?.scope === scope ? fieldId + '-error' : undefined} placeholder={target ? t('discussion.replyPlaceholder') : undefined}
        onChange={event => setDrafts(current => ({ ...current, [scope]: event.target.value }))} />
      {error?.scope === scope && <p role="alert" id={fieldId + '-error'} className="discussion-error">{error.message}</p>}
      <div className="discussion-composer-actions">
        {target && <Button variant="ghost" onClick={cancelReply} disabled={Boolean(busy)}>{t('discussion.cancelReply')}</Button>}
        <Button variant="primary" type="submit" disabled={Boolean(busy) || !value.trim()} busy={busy === scope}>
          {busy === scope ? t('discussion.sending') : t(target ? 'discussion.reply' : 'discussion.post')}
        </Button>
      </div>
    </form>;
  };

  const entry = (message: DiscussionMessage, target: DiscussionMessage | undefined, threadOpen: boolean) => {
    const deleted = message.status === 'DELETED';
    const visible = message.status === 'VISIBLE';
    return <article id={messageAnchor(message.id)} tabIndex={-1} className="discussion-entry">
      <AuthorAvatar key={message.author?.image || ''} author={message.author} />
      <div className="discussion-entry-body">
        <header className="discussion-meta">
          {!deleted && <strong>{name(message)}</strong>}
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' })}</time>
          {message.isEdited && <span>{t('discussion.edited')}</span>}
        </header>
        {message.replyToMessageId && !deleted && (
          target?.status === 'VISIBLE'
            ? <a className="discussion-target" href={'#' + messageAnchor(target.id)}><Reply size={15} aria-hidden="true" />{t('discussion.replyingTo').replace('{name}', name(target))}</a>
            : <p className="discussion-meta">{t('discussion.targetUnavailable')}</p>
        )}
        <p className={deleted ? 'discussion-meta' : 'discussion-content'}>{deleted ? t('discussion.deleted') : message.content}</p>
        {message.status === 'HIDDEN' && <p className="discussion-hidden">{t('discussion.hidden')}</p>}
        <div className="discussion-entry-actions">
          {visible && threadOpen && canWrite && <Button variant="ghost" disabled={Boolean(busy)} aria-expanded={replyTo === message.id}
            onClick={event => beginReply(event, message)}><Reply size={16} aria-hidden="true" />{t('discussion.replyAction')}</Button>}
          {visible && board?.authenticated && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void moderate(message, 'report')}><Flag size={16} aria-hidden="true" />{t('discussion.report')}</Button>}
          {board?.canModerate && !deleted && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void moderate(message, message.status === 'HIDDEN' ? 'restore' : 'hide')}>
            <ShieldCheck size={16} aria-hidden="true" />{t(message.status === 'HIDDEN' ? 'discussion.restore' : 'discussion.hide')}
          </Button>}
        </div>
        {replyTo === message.id && visible && threadOpen && canWrite && composer(message)}
      </div>
    </article>;
  };

  return <Panel id="report-discussion" aria-labelledby="discussion-title">
    <div className="discussion-header">
      <div>
        <h2 id="discussion-title" className="ui-panel-title flex items-center gap-2"><MessageCircle size={20} aria-hidden="true" />{t('discussion.title')}</h2>
        <p className="discussion-meta">{board?.locked ? t('discussion.locked') : t('discussion.hint')}</p>
      </div>
      {board?.canModerate && <Button busy={busy === 'lock'} disabled={Boolean(busy)} onClick={() => void lock()}><LockKeyhole size={16} aria-hidden="true" />{t(board.locked ? 'discussion.unlock' : 'discussion.lock')}</Button>}
    </div>
    {loadError && <div><p role="alert" className="discussion-error">{loadError}</p><Button variant="ghost" disabled={loadingMore} onClick={() => void load(board?.nextCursor || undefined)}>{t('common.retry')}</Button></div>}
    {error?.scope === 'board' && <p role="alert" className="discussion-error">{error.message}</p>}
    <p role="status" className="discussion-notice">{notice}</p>
    {board?.nextCursor && <Button busy={loadingMore} disabled={Boolean(busy)} onClick={() => void load(board.nextCursor!)}>{t(loadingMore ? 'discussion.loadingMore' : 'discussion.loadMore')}</Button>}
    {board && (board.messages.length
      ? <ol className="discussion-threads">{board.messages.map(root => {
        const replies = root.replies || [];
        const thread = new Map([root, ...replies].map(item => [item.id, item]));
        const threadOpen = root.status === 'VISIBLE';
        return <li key={root.id}>
          {entry(root, undefined, threadOpen)}
          {!!replies.length && <ol className="discussion-replies">{replies.map(reply => <li key={reply.id}>
            {entry(reply, thread.get(reply.replyToMessageId || ''), threadOpen)}
          </li>)}</ol>}
        </li>;
      })}</ol>
      : <p className="discussion-meta">{t('discussion.empty')}</p>)}
    {canWrite && composer()}
    {board && !board.authenticated && !board.locked && <ButtonLink variant="secondary" href="/login">{t('discussion.signIn')}</ButtonLink>}
  </Panel>;
}
