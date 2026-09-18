import * as React from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import { LightIconButton } from './button';

/**
 * The system's feedback surfaces, and the rule that separates them:
 *
 *  - `Banner`      — full-bleed across the top of the app. One at a time, and
 *                    only for something that affects every screen (the Google
 *                    account has stopped syncing). Filled, so it is impossible
 *                    to miss and expensive to over-use.
 *  - `InlineBanner`— a washed strip *inside* a panel. Scoped to what it sits on.
 *  - `Callout`     — a titled explanatory box. The one that carries a paragraph.
 *
 * Tone discipline, from the system's copy rules: **amber for a queue that needs
 * attention, red only for something that has actually failed or will destroy
 * data.** A non-empty unmatched-response queue is amber and factual, never red
 * and alarming.
 *
 * There is no toast. Confirmation is inline, on the surface that changed.
 */

/* --- Banner --------------------------------------------------------------- */

export function Banner({
  tone = 'blue',
  action,
  onClose,
  closeLabel = 'Dismiss',
  className,
  children,
  ...rest
}: {
  tone?: 'blue' | 'danger';
  action?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      role="status"
      className={cx(
        'relative flex min-h-10 items-center justify-center gap-3 py-2 pe-2 ps-3',
        'text-base font-medium leading-body text-fg-invert',
        tone === 'danger' ? 'bg-status-red' : 'bg-accent',
        className,
      )}
    >
      <span className="flex items-center gap-3">
        {children}
        {action}
      </span>
      {onClose && (
        <LightIconButton
          icon="X"
          label={closeLabel}
          accent="inverted"
          onClick={onClose}
          className="absolute end-2"
        />
      )}
    </div>
  );
}

/* --- InlineBanner --------------------------------------------------------- */

type InlineTone = 'blue' | 'green' | 'amber' | 'danger';

const INLINE: Record<InlineTone, { skin: string; icon: IconName }> = {
  blue: { skin: 'bg-accent-wash-2 text-accent', icon: 'InfoCircle' },
  green: { skin: 'bg-status-green-wash text-status-green-text', icon: 'CircleCheck' },
  amber: { skin: 'bg-status-amber-wash text-status-amber-text', icon: 'AlertTriangle' },
  danger: { skin: 'bg-status-red-wash text-status-red-text', icon: 'AlertTriangle' },
};

export function InlineBanner({
  tone = 'blue',
  icon,
  action,
  className,
  children,
  ...rest
}: {
  tone?: InlineTone;
  icon?: IconName;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const preset = INLINE[tone];
  return (
    <div
      {...rest}
      className={cx(
        'flex min-h-10 items-center gap-2 rounded-md p-2',
        'text-base font-medium leading-body',
        preset.skin,
        className,
      )}
    >
      <Icon name={icon ?? preset.icon} size={16} className="shrink-0" />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

/* --- Callout -------------------------------------------------------------- */

type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Grounds are the 2-step with a 6-step ring — a full tint lighter than
 * `InlineBanner`, because a Callout carries prose and has to stay readable.
 * The reference writes success as two literals; they are `--colors-teal-1` and
 * `--colors-teal-6` exactly, so the tokens are used instead and the tone
 * follows a theme change like every other.
 */
const CALLOUT: Record<CalloutTone, string> = {
  info: 'bg-[var(--colors-indigo-2)] shadow-[inset_0_0_0_1px_var(--colors-indigo-6)]',
  success: 'bg-[var(--colors-teal-1)] shadow-[inset_0_0_0_1px_var(--colors-teal-6)]',
  warning: 'bg-[var(--bright-yellow-2)] shadow-[inset_0_0_0_1px_var(--bright-yellow-6)]',
  danger: 'bg-[var(--colors-red-2)] shadow-[inset_0_0_0_1px_var(--colors-red-6)]',
  neutral: 'bg-surface-2 shadow-[inset_0_0_0_1px_var(--border-light)]',
};

export function Callout({
  tone = 'info',
  icon = 'InfoCircle',
  title,
  action,
  onClose,
  closeLabel = 'Dismiss',
  className,
  children,
  ...rest
}: {
  tone?: CalloutTone;
  icon?: IconName;
  title: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div
      {...rest}
      className={cx('flex flex-col gap-2 rounded-md p-3 pb-2', CALLOUT[tone], className)}
    >
      <div className="flex min-h-6 items-center gap-2">
        <Icon name={icon} size={16} className="shrink-0 text-fg-2" />
        <span className="flex-1 text-base font-medium leading-body text-fg">{title}</span>
        {onClose && <LightIconButton icon="X" label={closeLabel} onClick={onClose} />}
      </div>
      {children && (
        <div className="px-6 pb-2 text-xs leading-body text-fg-3">{children}</div>
      )}
      {action && <div className="flex min-h-6 justify-end gap-2">{action}</div>}
    </div>
  );
}

/* --- Loader --------------------------------------------------------------- */

/**
 * Three pulsing dots — the system's only looping animation, and its only
 * loading pattern. There is deliberately no skeleton: "prefer `Loader` inside
 * the panel that is loading."
 */
export function Loader({
  size = 4,
  label = 'Loading',
  className,
  ...rest
}: { size?: number; label?: string; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      role="status"
      aria-label={label}
      className={cx('inline-flex items-center', className)}
      style={{ gap: size }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="rounded-full bg-accent"
          style={{
            width: size,
            height: size,
            animation: `ds-pulse 1.2s ${i * 0.16}s infinite var(--ease)`,
          }}
        />
      ))}
    </span>
  );
}

/* --- NotificationCounter -------------------------------------------------- */

/** An accent count, or a bare dot when there is something but nothing to count. */
export function NotificationCounter({
  count,
  className,
  ...rest
}: { count?: number | null; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  if (count == null) {
    return (
      <span
        {...rest}
        className={cx('inline-block h-1.5 w-1.5 rounded-full bg-accent', className)}
      />
    );
  }
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
        'bg-accent text-xxs font-semibold leading-none text-fg-invert',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* --- EmptyState ----------------------------------------------------------- */

/**
 * What a screen says before it has data. The copy rule: **state the fact, then
 * what creates the first item.** No apology for the software's behaviour.
 *
 *   "No tasks yet" — "Set the first piece of homework and it appears here for
 *   every student in the group."
 */
export function EmptyState({
  icon = 'Inbox',
  title,
  description,
  action,
  className,
  ...rest
}: {
  icon?: IconName;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div
      {...rest}
      className={cx(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <Icon name={icon} size={24} className="text-fg-5" />
      <span className="text-base font-medium leading-body text-fg-2">{title}</span>
      {description && (
        <span className="max-w-[320px] text-xs leading-body text-fg-4">{description}</span>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* --- SyncStatus ----------------------------------------------------------- */

/**
 * The freshness stamp mirrored data has to carry.
 *
 * From the system's copy rules: *"Anything mirrored says when it last checked.
 * Never phrasing that implies live data."* Everything fed by Google Forms wears
 * one of these (CLAUDE.md §5.8), and where a figure is understated because a
 * response could not be matched, the screen says so in the same breath.
 */
export type SyncState = 'ok' | 'syncing' | 'stale' | 'broken';

export function SyncStatus({
  state = 'ok',
  lastSynced,
  className,
  ...rest
}: {
  state?: SyncState;
  /** Relative or absolute — "4 min ago", "12 Sep". Required unless syncing. */
  lastSynced?: string;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const map: Record<SyncState, { icon: IconName; ink: string; text: string }> = {
    ok: { icon: 'Reload', ink: 'text-fg-4', text: `Synced ${lastSynced ?? 'just now'}` },
    syncing: { icon: 'Reload', ink: 'text-fg-3', text: 'Syncing…' },
    stale: {
      icon: 'AlertTriangle',
      ink: 'text-status-amber-text',
      text: `Last synced ${lastSynced ?? 'some time ago'}`,
    },
    broken: {
      icon: 'AlertTriangle',
      ink: 'text-status-red-text',
      text: 'Sync failed — results are out of date',
    },
  };
  const { icon, ink, text } = map[state];
  return (
    <span
      {...rest}
      className={cx('inline-flex items-center gap-1 text-xs leading-body', ink, className)}
    >
      <Icon name={icon} size={14} />
      {text}
    </span>
  );
}
