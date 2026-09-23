import type { AssessmentStatus, AssessmentType, MaterialCategory } from './types';

/**
 * Formatting helpers. Timestamps arrive from the API in UTC (CLAUDE.md §6) and
 * render in the reader's own timezone - every function here goes through the
 * browser's resolved locale rather than hardcoding one, because the platform
 * serves Egypt and international IELTS students from the same build.
 */

const LOCALE = undefined; // resolves to the browser's, server-side to the runtime's

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: 'long' });
}

/** "in 3 days", "2 hours ago". Coarse on purpose - to the minute is noise. */
export function formatRelative(iso: string, now = Date.now()): string {
  const diffMs = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

/** Video and lesson lengths. "1:04:20" past the hour, "8:31" below it. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** A session's length in the units a student reads a timetable in. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatPercent(value: number | null): string {
  // A missing mark is an em-dash, never `0` or `--` (CLAUDE.md §11.1).
  return value === null ? '—' : `${Math.round(value)}%`;
}

/* --- Labels -------------------------------------------------------------- */

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  homework: 'Homework',
  assignment: 'Assignment',
  quiz: 'Quiz',
};

export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  locked: 'Locked',
  available: 'Open',
  submitted: 'Submitted',
  corrected: 'Corrected',
};

/**
 * Status colors. Deliberately not the gold accent - gold marks the one action
 * on a screen, and a screen of six gold badges has no action.
 */
export const ASSESSMENT_STATUS_CHIP: Record<AssessmentStatus, string> = {
  locked: 'neutral',
  available: 'blue',
  submitted: 'amber',
  corrected: 'green',
};

export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  course_notes: 'Course notes',
  study_materials: 'Study materials',
  important_files: 'Important files',
};

/* --- week grids ------------------------------------------------------------
   Shared by the student timetable and the staff week grid (`SESS-5`, `SESS-6`)
   - both build a Monday-start local week and send its bounds to the server as
   full ISO instants, never bare `YYYY-MM-DD` (the server widens a bare date
   to `T23:59:59.999Z` UTC, off by two to three hours from Egypt local time). */

/** Monday 00:00 local - the week that contains `d`. */
export function startOfWeek(d: Date): Date {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay(); // 0 = Sunday
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
