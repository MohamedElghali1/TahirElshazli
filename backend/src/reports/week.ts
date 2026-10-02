import { cairoOffsetMinutes, CAIRO_ZONE } from '../common/timezone.js';

const DAY_MS = 86_400_000;

function toDateString(utcMs: number): string {
  const dt = new Date(utcMs);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `Date.UTC` of a calendar date, naive - a tool, not an instant. */
function dateUtc(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

/**
 * The UTC instant of local midnight in Cairo on calendar date `y-m-d`.
 *
 * Estimates the offset from the naive "as if UTC" instant, exactly as
 * `google-form-csv.ts#buildIso` does for an unzoned timestamp - safe here
 * because every caller below only asks this of a **Saturday**, and Egypt's
 * DST transitions land at local midnight on a Thursday or Friday
 * (`CLAUDE.md`'s DST note), never on the week boundary itself.
 */
function cairoMidnightUtc(y: number, m: number, d: number): number {
  const naiveUtcMs = dateUtc(y, m, d);
  return naiveUtcMs - cairoOffsetMinutes(naiveUtcMs) * 60_000;
}

/** The Cairo calendar date (`YYYY-MM-DD`) `instant` falls on. */
function cairoCalendarDate(instant: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  return {
    y: Number(parts.find((p) => p.type === 'year')!.value),
    m: Number(parts.find((p) => p.type === 'month')!.value),
    d: Number(parts.find((p) => p.type === 'day')!.value),
  };
}

/**
 * `YYYY-MM-DD` of the Saturday (Cairo calendar) of the Saturday-Friday week
 * containing `instant`.
 */
export function weekStartFor(instant: Date): string {
  const { y, m, d } = cairoCalendarDate(instant);
  const dateMs = dateUtc(y, m, d);
  // JS `getUTCDay`: Sun=0 .. Sat=6. Days since the preceding Saturday.
  const dow = new Date(dateMs).getUTCDay();
  const sinceSaturday = (dow - 6 + 7) % 7;
  return toDateString(dateMs - sinceSaturday * DAY_MS);
}

/** `[Sat 00:00 Cairo, next Sat 00:00 Cairo)` for the week starting `weekStart`. */
export function weekWindow(weekStart: string): { from: Date; to: Date } {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  const from = cairoMidnightUtc(y, m, d);
  const next = new Date(dateUtc(y, m, d) + 7 * DAY_MS);
  const to = cairoMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
  return { from: new Date(from), to: new Date(to) };
}

/** The week before `weekStartFor(now)` - the last one that has fully ended. */
export function lastCompletedWeekStart(now: Date): string {
  const current = weekStartFor(now);
  const [y, m, d] = current.split('-').map(Number) as [number, number, number];
  return toDateString(dateUtc(y, m, d) - 7 * DAY_MS);
}
