import type { MarkbookResponse } from './grading.service.js';

/**
 * `BOOK-3`: the mark book grid as CSV.
 *
 * Takes the exact response `GradingService.markbook` returns - never a
 * second read - so the export can never disagree with the grid.
 */
export function toMarkbookCsv(data: MarkbookResponse): string {
  const header = [
    'Student',
    'Email',
    ...data.columns.map((c) => c.title),
    'Total',
    'Percent',
  ];
  const lines = [header.map(csvCell).join(',')];

  for (const row of data.rows) {
    const cells = [
      row.studentName,
      row.studentEmail,
      // The em-dash rule's CSV half (CLAUDE.md §11.1): a gap is an empty
      // cell, never `0` - a spreadsheet averages a `0` a teacher never meant.
      ...row.cells.map((c) => (c.score === null ? '' : String(c.score))),
      row.totalMaxScore > 0 ? `${row.totalScore}/${row.totalMaxScore}` : '',
      row.totalPercent === null ? '' : `${row.totalPercent}%`,
    ];
    lines.push(cells.map(csvCell).join(','));
  }

  // CRLF: RFC 4180's line ending, and the one Excel expects.
  return lines.join('\r\n') + '\r\n';
}

/**
 * One RFC 4180 field, with formula injection neutralised.
 *
 * A cell opening with `=`, `+`, `-` or `@` is a formula to Excel and Google
 * Sheets the moment the file is opened - a task title or a student name is
 * author-supplied text and must never be allowed to execute. Prefixing a
 * single quote defuses it while leaving the text legible.
 *
 * Quoting itself follows RFC 4180: any field carrying the delimiter, a quote
 * or a newline is wrapped in `"..."`, with embedded quotes doubled.
 */
export function csvCell(value: string): string {
  const neutralised = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(neutralised)) {
    return `"${neutralised.replace(/"/g, '""')}"`;
  }
  return neutralised;
}
