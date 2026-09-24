import type { Markbook } from './groups.service.js';

/**
 * The mark book as a CSV file (`BOOK-3`). A pure function: the route only sets
 * the headers.
 *
 * - **UTF-8 BOM first**, so Excel reads Arabic names and the em-dash instead
 *   of guessing a legacy code page.
 * - **RFC 4180**: CRLF line ends; a field holding `"`, `,`, CR or LF is quoted
 *   with `"` doubled.
 * - **Formula injection** (CSV injection): a field whose first character is
 *   `=` `+` `-` `@`, TAB or CR is prefixed with `'`, so a spreadsheet shows it
 *   as text rather than running it. Student names are typed by students at
 *   registration and task titles by staff - neither is trusted. Scores are
 *   non-negative numbers and never start with one of these.
 * - **A missing mark is `—`** (U+2014). Never `0`, never an empty cell - an
 *   empty cell and a zero read the same in a spreadsheet's SUM.
 * - The student's **name only**, no email (A-9).
 */
export const MISSING_MARK = '—';

const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvField(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function score(value: number | null): string {
  return value === null ? MISSING_MARK : String(value);
}

export function toMarkbookCsv(book: Markbook): string {
  const header = [
    'Student',
    ...book.tasks.map((t) => {
      const max = t.maxScore === null ? '' : ` (/${t.maxScore})`;
      const mirrored = t.source === 'mirrored' ? ' [Google Form]' : '';
      return `${t.title}${max}${mirrored}`;
    }),
    'Average of marked work (%)',
  ];
  const rows = book.students.map((s) => [
    s.name,
    ...s.cells.map((c) => score(c.score)),
    score(s.averagePercent),
  ]);
  return '﻿' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
