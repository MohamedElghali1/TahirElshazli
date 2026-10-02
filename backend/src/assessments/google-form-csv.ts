import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parseCsv } from '../common/csv/parse-csv.js';
import type { GoogleFormResponse } from '../integrations/google/google-forms.client.js';

/** Caps (`D-60`): a form export is a few hundred rows at this platform's scale. */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 2000;
export const CSV_MAX_COLUMNS = 200;

export interface ParsedGoogleFormCsv {
  responses: GoogleFormResponse[];
  /** The denominator implied by every row's "x / y" score cell, or null. */
  totalPoints: number | null;
  /** The question column headers, in column order - `raw.questions` for each response. */
  questions: Array<{ id: string; title: string }>;
}

const SCORE_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/;

const TIMESTAMP_HEADER = /^\s*timestamp\s*$/i;
// `Email` alongside `Email Address`/`Username` (`D-67`): a form that asks for
// email as its own question exports it under that plain header too.
const EMAIL_HEADER = /^\s*(email\s*address|email|username)\s*$/i;
const SCORE_HEADER = /^\s*score\s*$/i;

/**
 * `D-67`: a Google Forms CSV timestamp with no `GMT±N` offset is the
 * respondent's locale, which for this platform's one client is Egypt's. Named
 * once rather than inlined, since it is a business fact ("the client is in
 * Cairo"), not an implementation detail.
 */
const CSV_IMPORT_ZONE = 'Africa/Cairo';

/**
 * Which columns are `Timestamp` / `Email Address`-or-`Email`-or-`Username`
 * (`D-67`) / `Score`, and which are questions - detected by column NAME
 * first (Google's own English headers), tolerant of case and surrounding
 * whitespace.
 *
 * When none of the three are found by name - a form whose UI language
 * produced non-English headers - falls back to structure: the first column is
 * always the timestamp (Google Forms always exports one, unnamed or not), and
 * a score column is whichever one's data rows all match `N / M`. Everything
 * else is a question, in column order.
 */
function detectColumns(
  header: string[],
  dataRows: string[][],
): { timestampIdx: number; emailIdx: number | null; scoreIdx: number | null } {
  let timestampIdx = header.findIndex((h) => TIMESTAMP_HEADER.test(h));
  let emailIdx = header.findIndex((h) => EMAIL_HEADER.test(h));
  let scoreIdx = header.findIndex((h) => SCORE_HEADER.test(h));

  if (timestampIdx === -1) {
    // Non-English export: Google always puts the submission timestamp first.
    timestampIdx = 0;
  }
  // No structural fallback for email: nothing distinguishes an email column
  // from any other free-text column by shape, so a form whose header is not
  // in English and does not say "Email Address"/"Username" is treated as not
  // collecting one - the same "could not determine" honesty `collectsEmail`
  // already uses for the API path.
  if (scoreIdx === -1) {
    // Structural fallback: the column whose non-blank data cells all look like
    // "7 / 10". The first such column wins; a form has at most one.
    for (let col = 0; col < header.length; col++) {
      if (col === timestampIdx || col === emailIdx) continue;
      const cells = dataRows.map((r) => r[col] ?? '').filter((c) => c.trim() !== '');
      if (cells.length > 0 && cells.every((c) => SCORE_PATTERN.test(c))) {
        scoreIdx = col;
        break;
      }
    }
  }

  return {
    timestampIdx,
    emailIdx: emailIdx === -1 ? null : emailIdx,
    scoreIdx: scoreIdx === -1 ? null : scoreIdx,
  };
}

/**
 * Parses Google's `Timestamp` export formats to ISO (`D-67`).
 *
 * Two shapes seen in practice: `"2026/09/27 3:45:12 PM GMT+3"` (the default
 * export, year-first and unambiguous) and `"27/9/2026 15:45:12"` (24-hour,
 * no zone - some locales omit it). The second shape is read **day/month**
 * (Egypt/UK locale, not US) - `10/01/2026` is 10 January, never October 1st.
 * `Date.parse` alone chokes on the first because of the slash-separated y/m/d
 * and the trailing `GMT+3` (which V8 reads as `+3` = three *minutes*, not
 * hours), so both are normalised by hand into a form `Date` accepts
 * unambiguously.
 *
 * Neither shape's offset is optional-and-ignored: a timestamp carrying
 * `GMT±N` uses that offset exactly; one with none is read as `CSV_IMPORT_ZONE`
 * local time, not UTC (`buildIso` below).
 */
function parseTimestamp(raw: string): string | null {
  const s = raw.trim();

  // "2026/09/27 3:45:12 PM GMT+3" or "2026/09/27 15:45:12" (offset optional, year first - unambiguous)
  let m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?\s*(?:GMT([+-]\d{1,2}(?::?\d{2})?))?$/i.exec(
    s,
  );
  if (m) {
    return buildIso(m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7], m[8]);
  }

  // "27/9/2026 15:45:12" or "27/9/2026 3:45:12 PM" (day/month/year, no zone - `D-67`)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(s);
  if (m) {
    return buildIso(m[3]!, m[2]!, m[1]!, m[4]!, m[5]!, m[6]!, m[7], undefined);
  }

  return null;
}

/** Whole-number days in `month` (1-indexed) of `year`. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The offset `Africa/Cairo` keeps at `naiveUtcMs` - which must be within a
 * few hours of the real instant for this to be exact across a DST change, and
 * for an imported, display-only response timestamp (`D-67`) it always is.
 * `longOffset` (Node 16+) hands back `"GMT+02:00"`/`"GMT+03:00"` directly,
 * already accounting for Egypt's DST - no timezone-data dependency needed.
 */
function cairoOffsetMinutes(naiveUtcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CSV_IMPORT_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(naiveUtcMs));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!offset) return 0;
  const sign = offset[1] === '-' ? -1 : 1;
  return sign * (Number(offset[2]) * 60 + Number(offset[3]));
}

function buildIso(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
  ampm: string | undefined,
  offset: string | undefined,
): string | null {
  let h = Number(hour);
  if (ampm) {
    const isPm = ampm.toUpperCase() === 'PM';
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
  }
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  // `Date.UTC`/the `Date` ISO parser both silently roll an out-of-range day
  // into the next month (31 Feb -> 3 Mar) rather than refusing - checked by
  // hand here because nothing downstream does, for *either* date shape
  // (`D-67` names this for the new day/month reading, but a year-first
  // `2026/02/31` had the identical silent-rollover gap already).
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;

  const pad = (n: number | string, len = 2) => String(n).padStart(len, '0');
  const timePart = `${pad(h)}:${minute}:${second}`;

  if (offset) {
    const sign = offset.startsWith('-') ? '-' : '+';
    const digits = offset.replace(/^[+-]/, '');
    const [oh, om] = digits.includes(':') ? digits.split(':') : [digits, '00'];
    const zone = `${sign}${pad(oh!)}:${pad(om ?? '00')}`;
    const parsed = new Date(`${year}-${pad(mo)}-${pad(d)}T${timePart}${zone}`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  // No offset given - `D-67`: this is `CSV_IMPORT_ZONE` local time, not UTC.
  // Read the digits as a naive UTC instant first purely to ask the timezone
  // database "what was Cairo's offset around here" (accurate as long as the
  // naive and real instants fall on the same side of a DST change, which a
  // same-day response timestamp always does), then shift by that offset.
  const naiveUtcMs = Date.UTC(y, mo - 1, d, h, Number(minute), Number(second));
  if (Number.isNaN(naiveUtcMs)) return null;
  const utcMs = naiveUtcMs - cairoOffsetMinutes(naiveUtcMs) * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Google's Responses CSV export -> `GoogleFormResponse[]`, the same shape
 * `GoogleFormSyncService.ingest` consumes from the live API - so the CSV
 * importer and the future API-sync timer (`D-60`) share one seam.
 */
export function parseGoogleFormCsv(text: string): ParsedGoogleFormCsv {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0]!.trim() === ''));
  if (rows.length === 0) {
    throw new BadRequestException('The file has no rows.');
  }
  const [header, ...dataRows] = rows as [string[], ...string[][]];
  if (header.length > CSV_MAX_COLUMNS) {
    throw new BadRequestException(`The file has more than ${CSV_MAX_COLUMNS} columns.`);
  }
  if (dataRows.length > CSV_MAX_ROWS) {
    throw new BadRequestException(`The file has more than ${CSV_MAX_ROWS} rows.`);
  }

  const { timestampIdx, emailIdx, scoreIdx } = detectColumns(header, dataRows);

  const questionIdxs = header
    .map((_, i) => i)
    .filter((i) => i !== timestampIdx && i !== emailIdx && i !== scoreIdx);
  const questions = questionIdxs.map((idx, i) => ({
    id: `q${i + 1}`,
    title: header[idx]?.trim() || `Question ${i + 1}`,
  }));

  let totalPoints: number | null = null;
  const responses: GoogleFormResponse[] = [];

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2; // 1-based, plus the header row
    const rawTimestamp = row[timestampIdx] ?? '';
    const submittedAt = parseTimestamp(rawTimestamp);
    if (submittedAt === null) {
      throw new BadRequestException(
        `Row ${rowNumber}: could not read the timestamp "${rawTimestamp}".`,
      );
    }

    const email = emailIdx !== null ? (row[emailIdx] ?? '').trim() || null : null;

    let totalScore: number | null = null;
    if (scoreIdx !== null) {
      const cell = (row[scoreIdx] ?? '').trim();
      if (cell !== '') {
        const scoreMatch = SCORE_PATTERN.exec(cell);
        if (!scoreMatch) {
          throw new BadRequestException(
            `Row ${rowNumber}: could not read the score "${cell}" (expected "x / y").`,
          );
        }
        const got = Number(scoreMatch[1]);
        const max = Number(scoreMatch[2]);
        totalScore = got;
        if (totalPoints === null) {
          totalPoints = max;
        } else if (totalPoints !== max) {
          throw new BadRequestException(
            `Row ${rowNumber}: this response is out of ${max}, but an earlier row was out of ` +
              `${totalPoints}. Every row must share the same total.`,
          );
        }
      }
    }

    const answers = questionIdxs.map((idx, qi) => {
      // Multi-select answers in Google's export are already joined by ", " in
      // one cell, and a joined string cannot be told apart from a genuine
      // single answer that happens to contain ", " - so the cell is kept as
      // ONE value rather than split. `values` stays an array (matching the
      // API shape) with at most one entry.
      const cell = (row[idx] ?? '').trim();
      return {
        questionId: `q${qi + 1}`,
        values: cell === '' ? [] : [cell],
        score: null,
        correct: null,
      };
    });

    // Stable across re-imports of the same file, and changes when the row's
    // own content changes - so a corrected export replaces the row (via
    // `replaceResults`) instead of appending a duplicate.
    const hash = createHash('sha256');
    hash.update(submittedAt);
    hash.update('\u0000');
    hash.update((email ?? '').toLowerCase());
    hash.update('\u0000');
    hash.update(row.join('\u0001'));
    const responseId = hash.digest('hex');

    responses.push({
      responseId,
      respondentEmail: email,
      submittedAt,
      totalScore,
      answers,
    });
  });

  return { responses, totalPoints, questions };
}
