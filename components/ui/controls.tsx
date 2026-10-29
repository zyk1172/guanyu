import Link from 'next/link';
import { createElement, type ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'tab' | 'choice';
type ButtonStyle = { variant?: ButtonVariant; size?: 'default' | 'icon'; busy?: boolean };

function buttonClass(className?: string) {
  return ['ui-button', className].filter(Boolean).join(' ');
}

/** Geometry, typography and states belong to the shared stylesheet, not each call site. */
export function Button({ variant = 'secondary', size = 'default', busy = false, className, type = 'button', disabled, children, ...props }: ComponentProps<'button'> & ButtonStyle) {
  return <button {...props} type={type} className={buttonClass(className)} data-variant={variant} data-size={size} aria-busy={busy || props['aria-busy']} disabled={disabled || busy}>{children}</button>;
}

export function ButtonLink({ variant = 'secondary', size = 'default', className, ...props }: ComponentProps<typeof Link> & Omit<ButtonStyle, 'busy'>) {
  return <Link {...props} className={buttonClass(className)} data-variant={variant} data-size={size} />;
}

export function ActionLink({ variant = 'secondary', size = 'default', className, ...props }: ComponentProps<'a'> & Omit<ButtonStyle, 'busy'>) {
  return <a {...props} className={buttonClass(className)} data-variant={variant} data-size={size} />;
}

export function Input({ className, type = 'text', name, id, ...props }: ComponentProps<'input'>) {
  const kind = type === 'checkbox' || type === 'radio' ? 'ui-check' : type === 'file' ? 'ui-file' : type === 'hidden' ? '' : 'ui-control';
  return <input {...props} type={type} id={id} name={name ?? id} className={[kind, className].filter(Boolean).join(' ')} />;
}

export function Select({ className, name, id, ...props }: ComponentProps<'select'>) {
  return <select {...props} id={id} name={name ?? id} className={['ui-control', className].filter(Boolean).join(' ')} />;
}

export function Textarea({ className, name, id, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} id={id} name={name ?? id} className={['ui-control', className].filter(Boolean).join(' ')} />;
}

export function Panel({ as: Tag = 'section', className, ...props }: ComponentProps<'section'> & { as?: 'section' | 'div' | 'article' }) {
  return createElement(Tag, { ...props, className: ['ui-panel', className].filter(Boolean).join(' ') });
}
