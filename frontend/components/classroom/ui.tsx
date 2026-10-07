'use client';

import * as React from 'react';
import Link from 'next/link';
import { ClIcon, useDismiss, type IconKey } from '@/components/shell/classroom';

/**
 * The small Redesign V2 building blocks every console page reuses. Styling is
 * `app/(app)/classroom.css`; these only add the behaviour the artifacts' own
 * markup implies (tab state, a dismissable menu, a modal with Escape, a
 * transient toast) so no page has to re-derive it.
 *
 * The existing `components/ui` primitives (Button, TextInput, Select, Table,
 * Tag…) remain valid inside the consoles — `classroom.css` re-skins them via
 * their `data-ui` hooks — so a page uses these only where the artifact draws
 * something the primitives do not.
 */

/* --- panel header ------------------------------------------------------- */

export function PanelHead({
  title,
  id,
  children,
  small = false,
  className,
}: {
  title: React.ReactNode;
  id?: string;
  children?: React.ReactNode;
  small?: boolean;
  className?: string;
}) {
  return (
    <div className={['cl-ph', className].filter(Boolean).join(' ')}>
      <h2 id={id} className={small ? 'cl-pt cl-pt--sm' : 'cl-pt'}>
        {title}
      </h2>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

/* --- tabs ----------------------------------------------------------------
   `href` items are route tabs (Link); the rest are local-state tabs. */

export interface ClTab {
  value: string;
  label: React.ReactNode;
  href?: string;
  count?: number | null;
}

export function ClTabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly ClTab[];
  value: string;
  onChange?: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={['cl-tabs', className].filter(Boolean).join(' ')}>
      {tabs.map((t) => {
        const on = t.value === value;
        const body = (
          <>
            {t.label}
            {t.count != null && <span className="cl-muted text-[12.5px]">{t.count}</span>}
          </>
        );
        return t.href ? (
          <Link key={t.value} href={t.href} role="tab" aria-selected={on} className={on ? 'cl-tab on' : 'cl-tab'}>
            {body}
          </Link>
        ) : (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            className={on ? 'cl-tab on' : 'cl-tab'}
            onClick={() => onChange?.(t.value)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/** The artifact's pill segmented control ("All / Assignments / Quizzes"). */
export function ClSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="cl-segf" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className={o.value === value ? 'on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter chips ("All / Writing / Reading…"). */
export function ClChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="cl-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className={o.value === value ? 'cl-chip on' : 'cl-chip'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --- states --------------------------------------------------------------- */

export function ClEmpty({
  icon,
  tone = 'cl-tone-mint',
  title,
  hint,
  action,
}: {
  icon?: IconKey;
  tone?: string;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="cl-empty">
      {icon && (
        <span className={`cl-ic40 ${tone}`}>
          <ClIcon name={icon} small />
        </span>
      )}
      <div className="text-[15px] text-fg">{title}</div>
      {hint && <div className="text-[13.5px]">{hint}</div>}
      {action}
    </div>
  );
}

export function ClError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="cl-empty">
      <span className="cl-ic40" style={{ background: 'var(--cl-bad-bg)', color: 'var(--cl-bad-deep)' }}>
        <ClIcon name="close" small />
      </span>
      <div className="text-[15px] text-fg">{message}</div>
      {onRetry && (
        <button type="button" className="cl-btnp" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Placeholder rows while a panel's data loads. */
export function ClSkeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div aria-busy className="flex flex-col gap-3 py-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-2">
          <span className="cl-skel h-10 w-10 shrink-0 rounded-full" />
          <span className="cl-skel h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

/** A figure over its label — the artifacts' stat rows. */
export function ClStat({ value, label, tone }: { value: React.ReactNode; label: React.ReactNode; tone?: string }) {
  return (
    <div>
      <div className="cl-stat-v" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="cl-stat-k">{label}</div>
    </div>
  );
}

/** A completion bar (never a score — CLAUDE.md §11.1.2). */
export function ClBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={['cl-bar block', className].filter(Boolean).join(' ')}
    >
      <span style={{ width: `${v}%` }} />
    </span>
  );
}

/* --- the ⋮ row menu ----------------------------------------------------- */

export interface ClMenuItem {
  label: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function ClRowMenu({ items, label = 'Actions' }: { items: readonly ClMenuItem[]; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="cl-gib"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5.5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="18.5" r="1.7" />
        </svg>
      </button>
      {open && (
        <div className="cl-dmenu" role="menu">
          {items.map((it) =>
            it.href ? (
              <Link key={it.label} href={it.href} role="menuitem" onClick={close} style={it.danger ? { color: 'var(--cl-bad)' } : undefined}>
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                style={it.danger ? { color: 'var(--cl-bad)' } : undefined}
                onClick={() => {
                  close();
                  it.onSelect?.();
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* --- modal --------------------------------------------------------------- */

export function ClModal({
  title,
  open,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: React.ReactNode;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const titleId = React.useId();
  const boxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Keep Tab inside the dialog: wrap from the last focusable to the first.
      if (e.key === 'Tab' && boxRef.current) {
        const els = boxRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="cl-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={boxRef} className="cl-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={wide ? { maxWidth: 820 } : undefined}>
        <div className="cl-mh">
          <h2 id={titleId} className="m-0 text-[20px] font-normal">
            {title}
          </h2>
          <button type="button" className="cl-gib" aria-label="Close" onClick={onClose}>
            <ClIcon name="close" small />
          </button>
        </div>
        <div className="cl-mb">{children}</div>
        {footer && <div className="cl-mf">{footer}</div>}
      </div>
    </div>
  );
}

/* --- toast ---------------------------------------------------------------- */

export function useToast(): [React.ReactNode, (message: string) => void] {
  const [message, setMessage] = React.useState('');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = React.useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2600);
  }, []);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const node = message ? (
    <div className="cl-toast" role="status">
      {message}
    </div>
  ) : null;
  return [node, flash];
}

/** "← Back to …" — the artifacts' in-content back link. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div>
      <Link href={href} className="cl-glink">
        <span aria-hidden className="rtl:rotate-180">
          ←
        </span>{' '}
        {children}
      </Link>
    </div>
  );
}
