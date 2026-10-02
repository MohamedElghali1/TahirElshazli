/**
 * `D-67`/`REM-031`: Africa/Cairo offset lookups, shared by the Google Forms CSV
 * importer (`assessments/google-form-csv.ts`) and the weekly report week maths
 * (`reports/week.ts`) - one implementation, not two, since Cairo resumed
 * observing DST in 2023 and a fixed +2/+3 is wrong for roughly half the year.
 */
export const CAIRO_ZONE = 'Africa/Cairo';

/**
 * The offset `Africa/Cairo` keeps at `naiveUtcMs` - which must be within a few
 * hours of the real instant for this to be exact across a DST change. Both
 * callers satisfy that: a same-day imported response timestamp, and a week
 * boundary that always falls on a Saturday while Egypt's transitions land on a
 * Thursday/Friday midnight (`CLAUDE.md`'s DST note) - never within hours of a
 * Saturday boundary. `longOffset` (Node 16+) hands back `"GMT+02:00"`/
 * `"GMT+03:00"` directly, already accounting for the transition - no
 * timezone-data dependency needed.
 */
export function cairoOffsetMinutes(naiveUtcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(naiveUtcMs));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!offset) return 0;
  const sign = offset[1] === '-' ? -1 : 1;
  return sign * (Number(offset[2]) * 60 + Number(offset[3]));
}
