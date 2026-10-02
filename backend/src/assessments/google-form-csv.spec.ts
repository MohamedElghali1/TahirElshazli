import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGoogleFormCsv } from './google-form-csv.js';

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)),
    'utf8',
  );

describe('parseGoogleFormCsv', () => {
  describe('the English-header fixture (30 rows)', () => {
    const text = fixture('google-forms-sample.csv');
    const parsed = parseGoogleFormCsv(text);

    it('reads all 30 responses', () => {
      expect(parsed.responses).toHaveLength(30);
    });

    it('detects the three question columns by header name', () => {
      expect(parsed.questions).toEqual([
        { id: 'q1', title: 'What is the capital of Egypt?' },
        { id: 'q2', title: 'Describe your favourite book' },
        { id: 'q3', title: 'الإجابة بالعربية' },
      ]);
    });

    it('reads the score and its shared denominator', () => {
      expect(parsed.totalPoints).toBe(10);
      // student1 -> "1 / 10"
      expect(parsed.responses[0]!.totalScore).toBe(1);
      expect(parsed.responses[0]!.respondentEmail).toBe('student1@example.com');
    });

    it('parses the "Timestamp ... GMT+3" format to ISO', () => {
      expect(parsed.responses[0]!.submittedAt).toBe('2026-09-27T13:11:00.000Z');
    });

    it('keeps a quoted multi-line answer as one value', () => {
      const row5 = parsed.responses[4]!; // student5
      const q2 = row5.answers.find((a) => a.questionId === 'q2')!;
      expect(q2.values).toEqual([
        'Line one of my answer\nLine two, with a comma\nLine three',
      ]);
    });

    it('keeps the Arabic answer intact', () => {
      const row7 = parsed.responses[6]!; // student7
      const q3 = row7.answers.find((a) => a.questionId === 'q3')!;
      expect(q3.values).toEqual(['هذه إجابة باللغة العربية']);
    });

    it('generates a stable externalId across a re-parse of the same file', () => {
      const again = parseGoogleFormCsv(text);
      expect(again.responses.map((r) => r.responseId)).toEqual(
        parsed.responses.map((r) => r.responseId),
      );
    });
  });

  describe('the Arabic-header fixture', () => {
    const text = fixture('google-forms-sample-arabic.csv');
    const parsed = parseGoogleFormCsv(text);

    it('falls back to the first column for the timestamp', () => {
      expect(parsed.responses).toHaveLength(2);
      expect(parsed.responses[0]!.submittedAt).toBe('2026-09-20T07:00:00.000Z');
    });

    it('detects the score column structurally from the "x / y" pattern', () => {
      expect(parsed.totalPoints).toBe(10);
      expect(parsed.responses[0]!.totalScore).toBe(8);
      expect(parsed.responses[1]!.totalScore).toBe(5);
    });

    it('does not recognise the Arabic email header, so respondentEmail is null', () => {
      expect(parsed.responses[0]!.respondentEmail).toBeNull();
    });

    it('treats the unrecognised email column as a question', () => {
      expect(parsed.questions.map((q) => q.title)).toEqual([
        'عنوان البريد الإلكتروني',
        'ما هي عاصمة مصر؟',
      ]);
    });
  });

  describe('edge cases', () => {
    it('rejects a file with no rows', () => {
      expect(() => parseGoogleFormCsv('')).toThrow('no rows');
    });

    it('rejects a row whose timestamp cannot be parsed, naming the row', () => {
      const csv = 'Timestamp,Score\nnot a date,5 / 10\n';
      expect(() => parseGoogleFormCsv(csv)).toThrow(/Row 2/);
    });

    it('rejects a score column whose denominators disagree', () => {
      const csv = 'Timestamp,Score\n2026/09/27 3:00:00 PM GMT+3,5 / 10\n' +
        '2026/09/27 3:01:00 PM GMT+3,6 / 20\n';
      expect(() => parseGoogleFormCsv(csv)).toThrow(/Row 3/);
    });

    it('treats a blank score cell as no score, not an error', () => {
      const csv = 'Timestamp,Score,Q1\n2026/09/27 3:00:00 PM GMT+3,,answer\n';
      const parsed = parseGoogleFormCsv(csv);
      expect(parsed.responses[0]!.totalScore).toBeNull();
      expect(parsed.totalPoints).toBeNull();
    });

    it('skips blank rows', () => {
      const csv =
        'Timestamp,Q1\n2026/09/27 3:00:00 PM GMT+3,a\n\n2026/09/27 3:01:00 PM GMT+3,b\n';
      const parsed = parseGoogleFormCsv(csv);
      expect(parsed.responses).toHaveLength(2);
    });

    it('parses "D/M/YYYY 24h" timestamps with no zone as Africa/Cairo local time (D-67)', () => {
      // 27/9/2026 = 27 September 2026, day/month - never "27th month".
      // Cairo is UTC+3 in September (DST).
      const csv = 'Timestamp,Q1\n27/9/2026 15:45:12,answer\n';
      const parsed = parseGoogleFormCsv(csv);
      expect(parsed.responses[0]!.submittedAt).toBe('2026-09-27T12:45:12.000Z');
    });

    it('reads an ambiguous day/month date as day-first, not month-first (D-67)', () => {
      // 10/01/2026 is 10 January, never October 1st. Cairo is UTC+2 in January.
      const csv = 'Timestamp,Q1\n10/01/2026 14:31:00,answer\n';
      const parsed = parseGoogleFormCsv(csv);
      expect(parsed.responses[0]!.submittedAt).toBe('2026-01-10T12:31:00.000Z');
    });

    it('honours Cairo DST for a summer date (D-67)', () => {
      // Cairo is UTC+3 in July (DST), vs UTC+2 in January above.
      const csv = 'Timestamp,Q1\n15/07/2026 12:00:00,answer\n';
      const parsed = parseGoogleFormCsv(csv);
      expect(parsed.responses[0]!.submittedAt).toBe('2026-07-15T09:00:00.000Z');
    });

    it('rejects an invalid day/month combination, naming the row (D-67)', () => {
      const csv = 'Timestamp,Q1\n31/02/2026 10:00:00,answer\n';
      expect(() => parseGoogleFormCsv(csv)).toThrow(/Row 2/);
    });

    it('keeps a "GMT+N" timestamp\'s explicit offset exactly as before (D-67)', () => {
      const csv = 'Timestamp,Q1\n2026/01/10 2:31:00 PM GMT+3,answer\n';
      const parsed = parseGoogleFormCsv(csv);
      // GMT+3 given explicitly, even though Cairo itself is UTC+2 in January -
      // an explicit offset is never second-guessed against the zone table.
      expect(parsed.responses[0]!.submittedAt).toBe('2026-01-10T11:31:00.000Z');
    });

    it('accepts a plain "Email" header as the respondent email column (D-67)', () => {
      const csv = 'Timestamp,Email,Q1\n2026/09/27 3:00:00 PM GMT+3,ta@example.com,answer\n';
      const parsed = parseGoogleFormCsv(csv);
      expect(parsed.responses[0]!.respondentEmail).toBe('ta@example.com');
      expect(parsed.questions.map((q) => q.title)).toEqual(['Q1']);
    });

    it('rejects more than 2000 rows', () => {
      const lines = ['Timestamp,Q1'];
      for (let i = 0; i < 2001; i++) {
        lines.push(`2026/09/27 3:00:00 PM GMT+3,a${i}`);
      }
      expect(() => parseGoogleFormCsv(lines.join('\n'))).toThrow(/2000 rows/);
    });

    it('rejects more than 200 columns', () => {
      const header = Array.from({ length: 201 }, (_, i) => `Q${i}`).join(',');
      expect(() => parseGoogleFormCsv(`${header}\n`)).toThrow(/200 columns/);
    });
  });
});
