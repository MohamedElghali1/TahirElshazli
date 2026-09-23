import { csvField, MISSING_MARK, toMarkbookCsv } from './markbook-csv.js';
import type { Markbook } from './groups.service.js';

const BOOK: Markbook = {
  groupId: 'group-1',
  groupName: 'Group one',
  courseId: 'course-1',
  courseTitle: 'IGCSE',
  tasks: [
    { assessmentId: 'a1', title: 'Essay, part "one"', workType: 'file_upload', source: 'platform', maxScore: 20, dueAt: '2026-09-01T00:00:00Z', lastSyncedAt: null, unmatchedCount: null },
    { assessmentId: 'a2', title: '=HYPERLINK("http://x")', workType: 'file_upload', source: 'platform', maxScore: 10, dueAt: '2026-09-02T00:00:00Z', lastSyncedAt: null, unmatchedCount: null },
    { assessmentId: 'q1', title: 'Quiz', workType: 'google_form', source: 'mirrored', maxScore: null, dueAt: '2026-09-03T00:00:00Z', lastSyncedAt: '2026-09-04T00:00:00Z', unmatchedCount: 1 },
  ],
  omittedTasks: [],
  students: [
    {
      studentId: 's1',
      name: 'ليلى فهمي',
      averagePercent: 0,
      cells: [
        { assessmentId: 'a1', score: 0, maxScore: 20, status: 'returned' },
        { assessmentId: 'a2', score: null, maxScore: 10, status: 'not_submitted' },
        { assessmentId: 'q1', score: 7, maxScore: 9, status: 'scored' },
      ],
    },
    {
      studentId: 's2',
      name: '+1 Student',
      averagePercent: null,
      cells: [
        { assessmentId: 'a1', score: null, maxScore: 20, status: 'submitted' },
        { assessmentId: 'a2', score: null, maxScore: 10, status: 'not_submitted' },
        { assessmentId: 'q1', score: null, maxScore: null, status: 'no_response' },
      ],
    },
  ],
};

describe('mark book CSV (BOOK-3)', () => {
  const csv = toMarkbookCsv(BOOK);
  const lines = csv.slice(1).split('\r\n');

  it('starts with a UTF-8 BOM and uses CRLF line ends', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.slice(1)).not.toMatch(/[^\r]\n/);
  });

  it('writes a header of the student, each task with its denominator, and the average', () => {
    expect(lines[0]).toBe(
      'Student,"Essay, part ""one"" (/20)","\'=HYPERLINK(""http://x"") (/10)",Quiz [Google Form],Average of marked work (%)',
    );
  });

  it('keeps an Arabic name intact and renders a zero as 0, never a dash', () => {
    expect(lines[1]).toBe(`ليلى فهمي,0,${MISSING_MARK},7,0`);
  });

  it('renders every missing mark as an em-dash, never 0 and never empty', () => {
    expect(lines[2]).toBe(`'+1 Student,${MISSING_MARK},${MISSING_MARK},${MISSING_MARK},${MISSING_MARK}`);
  });

  it.each([
    ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
    ['+1', "'+1"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tTab', "'\tTab"],
    ['\rCR', `"'\rCR"`],
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
  ])('neutralises and quotes %j', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });
});
