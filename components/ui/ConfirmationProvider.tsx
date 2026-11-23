'use client';

import { useUiLanguage } from '@/components/LanguageProvider';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Dialog from './Dialog';
import { Button, Input } from './controls';

type PromptOptions = { secret?: boolean; title?: string; label?: string };
type Request = { id: number; kind: 'confirm' | 'prompt'; message: string; options: PromptOptions; opener: HTMLElement | null; resolve: (value: string | null) => void };
type Confirmation = { confirm: (message: string) => Promise<boolean>; prompt: (message: string, options?: PromptOptions) => Promise<string | null> };
const Context = createContext<Confirmation | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState('');
  const active = useRef<Request | null>(null);
  const queue = useRef<Request[]>([]);
  const sequence = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const enqueue = useCallback((kind: Request['kind'], message: string, options: PromptOptions = {}) => new Promise<string | null>(resolve => {
    const next = { id: ++sequence.current, kind, message, options, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null, resolve };
    if (active.current) queue.current.push(next);
    else { active.current = next; setValue(''); setRequest(next); }
  }), []);
  const confirm = useCallback(async (message: string) => (await enqueue('confirm', message)) === 'confirmed', [enqueue]);
  const prompt = useCallback((message: string, options?: PromptOptions) => enqueue('prompt', message, options), [enqueue]);
  const finish = (result: string | null) => {
    const current = active.current;
    if (!current) return;
    active.current = queue.current.shift() || null;
    setValue(''); setRequest(active.current); current.resolve(result);
  };
  return <Context.Provider value={{ confirm, prompt }}>
    {children}
    {request && <Dialog key={request.id} open title={request.options.title || (request.kind === 'confirm' ? (zh ? '确认操作' : 'Confirm action') : request.options.secret ? (zh ? '验证身份' : 'Verify your identity') : (zh ? '补充信息' : 'Add details'))} description={request.message} closeLabel={zh ? '关闭' : 'Close'} role={request.kind === 'confirm' ? 'alertdialog' : 'dialog'} onClose={() => finish(null)} initialFocus={request.kind === 'prompt' ? input : cancel} returnFocus={request.opener}>
      <form onSubmit={event => { event.preventDefault(); finish(request.kind === 'confirm' ? 'confirmed' : value); }}>
        {request.kind === 'prompt' && <label className="ui-prompt-field"><span className="ui-field-label">{request.options.label || (request.options.secret ? (zh ? '当前密码' : 'Current password') : (zh ? '输入内容' : 'Your response'))}</span><Input ref={input} name="confirmation" type={request.options.secret ? 'password' : 'text'} autoComplete={request.options.secret ? 'current-password' : 'off'} value={value} onChange={event => setValue(event.target.value)} required maxLength={request.options.secret ? 1024 : 2000} /></label>}
        <div className="ui-dialog-actions"><Button ref={cancel} onClick={() => finish(null)}>{zh ? '取消' : 'Cancel'}</Button><Button type="submit" variant={request.kind === 'confirm' ? 'danger' : 'primary'}>{zh ? '确认' : 'Confirm'}</Button></div>
      </form>
    </Dialog>}
  </Context.Provider>;
}

export function useConfirmation() {
  const value = useContext(Context);
  if (!value) throw new Error('ConfirmationProvider is required.');
  return value;
}
