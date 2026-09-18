import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GoogleFormsClient } from '../integrations/google/google-forms.client.js';
import { InMemoryWorkRepository } from './repositories/in-memory-work.repository.js';
import type { NewExternalResult } from './interfaces/work-repository.interface.js';

/**
 * The two pieces of this feature that fail silently, tested without a network.
 *
 * Neither needs Google: one is string parsing and the other is repository
 * behaviour. That is deliberate - these are the parts most likely to break and
 * least likely to be noticed, so the tests for them must not be the ones that
 * get skipped because no credentials are configured.
 */

describe('Google Form link parsing', () => {
  const client = new GoogleFormsClient();

  /**
   * The whole reason this parser exists. A form has two different identifiers,
   * and the one a teacher naturally copies - the link they send students - is
   * the wrong one. Pasting it yields a 404 from Google with nothing to indicate
   * the id was the wrong *kind* rather than simply wrong.
   */
  it('accepts the editing link, which is the one the API can use', () => {
    expect(
      client.parseFormId(
        'https://docs.google.com/forms/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz/edit',
      ),
    ).toBe('1AbC_dEfGhIjKlMnOpQrStUvWxYz');
  });

  it('accepts a bare form id', () => {
    expect(client.parseFormId('1AbC_dEfGhIjKlMnOpQrStUvWxYz')).toBe(
      '1AbC_dEfGhIjKlMnOpQrStUvWxYz',
    );
  });

  it('rejects the responder link and says which link to copy instead', () => {
    let message = '';
    try {
      client.parseFormId(
        'https://docs.google.com/forms/d/e/1FAIpQLSf_LONGPUBLISHEDID/viewform',
      );
    } catch (error) {
      message = (error as BadRequestException).message;
    }
    // The message is the feature: it has to name the fix, not just refuse.
    expect(message).toContain('/edit');
    expect(message).toMatch(/students use|fill in/i);
  });

  it('rejects a forms.gle short link, which redirects to the wrong id', () => {
    let message = '';
    try {
      client.parseFormId('https://forms.gle/aBcDeFgH');
    } catch (error) {
      message = (error as BadRequestException).message;
    }
    expect(message).toContain('/edit');
  });

  it('rejects something that is not a form at all', () => {
    expect(() => client.parseFormId('https://example.com/not-a-form')).toThrow(
      BadRequestException,
    );
  });

  it('rejects an empty string rather than treating it as a bare id', () => {
    expect(() => client.parseFormId('   ')).toThrow(BadRequestException);
  });
});

describe('Mirroring external results', () => {
  let repo: InMemoryWorkRepository;

  const response = (
    externalId: string,
    overrides: Partial<NewExternalResult> = {},
  ): NewExternalResult => ({
    assessmentId: 'assess-1',
    provider: 'google_form',
    externalId,
    studentId: null,
    respondentId: 'someone@example.com',
    score: 8,
    maxScore: 10,
    submittedAt: '2026-09-12T10:00:00.000Z',
    raw: {},
    ...overrides,
  });

  beforeEach(() => {
    repo = new InMemoryWorkRepository();
  });

  /**
   * The silent-data-loss case, and the one worth having a test for above all
   * the others here.
   *
   * A staff member reconciles an unmatched response by hand. Google knows
   * nothing about that, so the next sync sends `studentId: null` again - and a
   * naive overwrite would quietly undo the attribution. Nobody would see an
   * error; the response would simply drift back into the unmatched queue, and
   * the student's mark would vanish from the report between one refresh and the
   * next.
   */
  it('preserves a manual attribution across a re-sync', async () => {
    await repo.replaceResults('assess-1', 'google_form', [response('r1')]);
    const [unmatched] = await repo.findUnmatchedResults('assess-1');
    await repo.attachResultToStudent(unmatched.id, 'student-1');

    // Google sends the same response again, still with no identity attached.
    await repo.replaceResults('assess-1', 'google_form', [response('r1')]);

    const after = await repo.findResults('assess-1');
    expect(after).toHaveLength(1);
    expect(after[0].studentId).toBe('student-1');
    expect(await repo.findUnmatchedResults('assess-1')).toHaveLength(0);
  });

  it('keeps a row identity stable across a re-sync', async () => {
    await repo.replaceResults('assess-1', 'google_form', [response('r1')]);
    const first = (await repo.findResults('assess-1'))[0];
    await repo.replaceResults('assess-1', 'google_form', [
      response('r1', { score: 9 }),
    ]);
    const second = (await repo.findResults('assess-1'))[0];
    // Same row, updated - not a new row. A reconciliation screen may be holding
    // the id, and renumbering on every refresh would break it.
    expect(second.id).toBe(first.id);
    expect(second.score).toBe(9);
  });

  it('drops a response deleted upstream', async () => {
    await repo.replaceResults('assess-1', 'google_form', [
      response('r1'),
      response('r2'),
    ]);
    await repo.replaceResults('assess-1', 'google_form', [response('r1')]);
    const remaining = await repo.findResults('assess-1');
    expect(remaining.map((r) => r.externalId)).toEqual(['r1']);
  });

  it('refuses to re-attribute a response that already has a student', async () => {
    await repo.replaceResults('assess-1', 'google_form', [response('r1')]);
    const [row] = await repo.findResults('assess-1');
    await repo.attachResultToStudent(row.id, 'student-1');
    // Null, not a silent reassignment: moving a mark from one student to
    // another is not something a reconciliation screen should do by accident.
    expect(await repo.attachResultToStudent(row.id, 'student-2')).toBeNull();
  });

  /**
   * The tally is what the analytics screen reads. `unmatched` being non-zero
   * means every other figure on that screen is understated, so it has to be
   * counted separately rather than folded into the total.
   */
  it('counts matched and unmatched separately, and averages only the matched', async () => {
    await repo.replaceResults('assess-1', 'google_form', [
      response('r1', { studentId: 'student-1', score: 10 }),
      response('r2', { studentId: 'student-2', score: 6 }),
      // Nobody recognised this address, so it must not move the average.
      response('r3', { studentId: null, score: 0 }),
    ]);
    const tally = await repo.tallyResults('assess-1');
    expect(tally.matched).toBe(2);
    expect(tally.unmatched).toBe(1);
    expect(tally.averageScore).toBe(8);
    expect(tally.averageMaxScore).toBe(10);
  });

  it('reports a null average when no response carries a score', async () => {
    await repo.replaceResults('assess-1', 'google_form', [
      response('r1', { studentId: 'student-1', score: null, maxScore: null }),
    ]);
    const tally = await repo.tallyResults('assess-1');
    expect(tally.matched).toBe(1);
    // Null rather than 0: a non-quiz form has nothing to average, and 0 would
    // read as everyone having scored nothing.
    expect(tally.averageScore).toBeNull();
  });

  it('scopes a student read to that student', async () => {
    await repo.replaceResults('assess-1', 'google_form', [
      response('r1', { studentId: 'student-1' }),
      response('r2', { studentId: 'student-2' }),
    ]);
    const mine = await repo.findResultsForStudent(['assess-1'], 'student-1');
    expect(mine).toHaveLength(1);
    expect(mine[0].externalId).toBe('r1');
  });

  it('returns a copy, so a caller cannot mutate the stored row', async () => {
    await repo.replaceResults('assess-1', 'google_form', [
      response('r1', { studentId: 'student-1' }),
    ]);
    const [row] = await repo.findResults('assess-1');
    row.studentId = 'someone-else';
    const [again] = await repo.findResults('assess-1');
    expect(again.studentId).toBe('student-1');
  });
});
