import { describe, expect, it } from 'vitest';
import { csvCell, toMarkbookCsv } from './markbook-csv.js';
import type { MarkbookResponse } from './grading.service.js';

describe('markbook CSV (BOOK-3)', () => {
  it('em-dash rule: a gap serialises to an empty cell, never 0', () => {
    const data: MarkbookResponse = {
      groupId: 'group-1',
      groupName: 'Test group',
      columns: [{ assessmentId: 'a1', title: 'Task one', maxScore: 10 }],
      rows: [
        {
          studentId: 's1',
          studentName: 'A Student',
          studentEmail: 's1@example.com',
          cells: [{ assessmentId: 'a1', score: null, awaitingReturn: false }],
          totalScore: 0,
          totalMaxScore: 0,
          totalPercent: null,
        },
      ],
    };
    const csv = toMarkbookCsv(data);
    const dataRow = csv.split('\r\n')[1];
    // "A Student,s1@example.com,,," - the gap and the (unmarked) totals are
    // all empty fields, not a rendered "0".
    expect(dataRow).toBe('A Student,s1@example.com,,,');
    expect(dataRow).not.toContain('0');
  });

  it('round-trips a task title with a comma and a quote, and a bilingual student name', () => {
    const data: MarkbookResponse = {
      groupId: 'group-1',
      groupName: 'Test group',
      columns: [
        { assessmentId: 'a1', title: 'Essay: "Macbeth", part 2', maxScore: 20 },
      ],
      rows: [
        {
          studentId: 's1',
          studentName: 'ليلى فهمي',
          studentEmail: 's1@example.com',
          cells: [{ assessmentId: 'a1', score: 15, awaitingReturn: false }],
          totalScore: 15,
          totalMaxScore: 20,
          totalPercent: 75,
        },
      ],
    };
    const csv = toMarkbookCsv(data);
    const [header, dataRow] = csv.split('\r\n');
    expect(header).toBe('Student,Email,"Essay: ""Macbeth"", part 2",Total,Percent');
    expect(dataRow).toBe('ليلى فهمي,s1@example.com,15,15/20,75%');
  });

  it('neutralises a formula-injection attempt in a task title', () => {
    expect(csvCell('=cmd|calc!A0')).toBe("'=cmd|calc!A0");
    expect(csvCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // A field that merely contains one of these characters mid-string is untouched.
    expect(csvCell('A=B')).toBe('A=B');
    // Neutralising still composes with quoting when the field also needs it.
    expect(csvCell('=A,B')).toBe('"\'=A,B"');
  });

  it('carries a newline inside a quoted field without breaking the row', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });
});
