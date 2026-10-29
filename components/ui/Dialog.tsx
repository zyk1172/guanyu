'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Button } from './controls';

/** Native modal focus containment, Escape handling and focus restoration. */
export default function Dialog({ open, onClose, title, description, closeLabel, children, role = 'dialog', initialFocus, returnFocus }: {
  open: boolean; onClose: () => void; title: string; description?: string; closeLabel: string; children: ReactNode;
  role?: 'dialog' | 'alertdialog'; initialFocus?: RefObject<HTMLElement | null>; returnFocus?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const overflow = document.body.style.overflow;
    const trigger = returnFocus || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    initialFocus?.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = overflow;
      // A request may disable its trigger before showModal runs. Restore after
      // that request's finally block, without stealing an intentionally moved focus.
      requestAnimationFrame(() => {
        if (trigger?.isConnected && document.activeElement === document.body) trigger.focus({ preventScroll: true });
      });
    };
  }, [open, initialFocus, returnFocus]);
  return <dialog ref={ref} className="ui-dialog" role={role} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter(item => item.tabIndex >= 0 && item.getClientRects().length > 0);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className="ui-dialog-heading"><h2 id={`${id}-title`}>{title}</h2><Button variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}><X aria-hidden="true" /></Button></div>
    {description && <p id={`${id}-description`} className="ui-dialog-description">{description}</p>}
    {children}
  </dialog>;
}
