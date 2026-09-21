'use client';

import { PlusIcon, VideoCameraIcon } from '@phosphor-icons/react';
import { cx } from '@/components/ui';
import type { LiveSession } from '@/lib/types';

export type SessionPhase = 'live' | 'soon' | 'scheduled';

export function phaseOf(session: LiveSession, now: number): SessionPhase {
  if (now === 0) return 'scheduled';
  const start = new Date(session.scheduledAt).getTime();
  const end = start + session.durationMinutes * 60_000;
  if (now >= start && now <= end) return 'live';
  if (start > now && start - now <= 30 * 60_000) return 'soon';
  return 'scheduled';
}

/**
 * The Home screen's one header action, modelled on the reference layout's
 * primary button: a filled accent control with the session's time sitting
 * beside the label rather than under it.
 *
 * **There are two elements here, not one with a disabled attribute**, and the
 * split is deliberate. A real `<a>` carries the Zoom link; with no session
 * there is no link, and an `<a href>` that goes nowhere is a trap for keyboard
 * and screen-reader users. So the empty state renders a `<span>` - not
 * focusable, not announced as a control, and carrying the explanation as text
 * instead of leaving a dead button to be clicked hopefully.
 *
 * `aria-disabled` is not used for the same reason: the element is not a
 * disabled button, it is not a button at all.
 */
export function JoinSessionAction({
  session,
  phase,
}: {
  session: LiveSession | null;
  phase: SessionPhase;
}) {
  if (!session) {
    return (
      <span
        className={cx(
          'inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)]',
          'border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-[var(--sp-2)]',
          'text-[var(--fs-base)] font-medium text-fg-4 select-none',
        )}
      >
        <VideoCameraIcon size={14} weight="regular" aria-hidden />
        No session right now
      </span>
    );
  }

  return (
    <a
      href={session.zoomLink}
      target="_blank"
      rel="noreferrer noopener"
      className={cx(
        'inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)]',
        'border border-[var(--accent-edge)] bg-[var(--accent)] px-[var(--sp-2)]',
        'text-[var(--fs-base)] font-medium text-accent-fg',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
        'hover:bg-[var(--accent-hover)] active:bg-[var(--accent-press)]',
      )}
    >
      {/* The reference's own glyph is a plus. It is replaced while the session
          is actually running by a pulsing pip, because "this is happening now"
          is worth more than matching a static mark for the few minutes it
          applies. */}
      {phase === 'live' ? (
        <span
          aria-hidden
          className="h-[6px] w-[6px] shrink-0 animate-pulse rounded-[var(--r-full)] bg-current motion-reduce:animate-none"
        />
      ) : (
        <PlusIcon size={14} weight="bold" aria-hidden />
      )}
      {phase === 'live' ? 'Join Session · live' : 'Join Session'}
    </a>
  );
}

/**
 * The timestamp the reference sets beside the button. Its own element because
 * it is a caption on the action, not part of the control's accessible name -
 * folding it inside the `<a>` would make the link announce as
 * "Join Session 8:00PM 25/9/2026".
 */
export function SessionStamp({ session }: { session: LiveSession | null }) {
  if (!session) return null;
  return (
    <span className="num hidden text-[var(--fs-xs)] text-fg-3 sm:inline">
      {stamp(session.scheduledAt)}
    </span>
  );
}

/**
 * `8:00PM 25/8/2026` - the reference's own compact form, built here rather
 * than added to `lib/format` because it is this one caption's shape and not a
 * format the rest of the product should start using.
 *
 * Deliberately *not* locale-aware: `toLocaleString` would render this as
 * `8/25/2026` for a US-locale browser, and the client reads dates
 * day-first. The rest of the app keeps `formatDate`.
 */
function stamp(iso: string): string {
  const d = new Date(iso);
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h}:${m}${suffix} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
