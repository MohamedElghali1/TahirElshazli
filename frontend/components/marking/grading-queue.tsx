'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import { initialsOf } from '@/components/shell/classroom';
import { ClModal } from '@/components/classroom/ui';

/**
 * One row of a grading queue and the dialog that marks it. Shared by the
 * course Grading tab (`manage/courses/[id]/grading`) and the cross-course
 * Submissions screen (`manage/submissions`). Redesign V2: a `cl-grow` row and
 * a `ClModal` dialog.
 */

export const GRADING_STATUS_FILTER: { value: GradingStatus | ''; label: string }[] = [
  { value: 'awaiting', label: 'Awaiting grading' },
  { value: 'graded', label: 'Graded' },
  { value: '', label: 'All' },
];

export function SubmissionRow({
  item,
  context,
  onGrade,
  onReturned,
}: {
  item: GradingQueueItem;
  /** Prepended to the subtitle - the course, on a queue spanning several. */
  context?: string;
  onGrade: () => void;
  onReturned: () => void;
}) {
  const { token } = useSession();
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markHref = `/manage/tasks/${item.assessmentId}/submissions/${item.submissionId}`;

  // `MARK-2`: saving and returning are two operations. Since `D-44` every row
  // listed here is one the caller may return, so the action can live here.
  async function giveBack() {
    if (!token) return;
    setReturning(true);
    setError(null);
    try {
      await api.staff.returnSubmission(token, item.submissionId);
      onReturned();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not return that work. Please try again.');
      setReturning(false);
    }
  }

  const status =
    item.status !== 'graded'
      ? { text: 'Awaiting', color: 'var(--cl-warn)' }
      : item.returnedAt
        ? { text: 'Returned', color: 'var(--cl-ok)' }
        : // Saved, not yet visible to the student.
          { text: 'Marked, not returned', color: 'var(--cl-blue)' };

  return (
    <div>
      <div className="cl-grow flex-wrap">
        {/* The marking page renders the hand-in itself (photos, PDF, typed answer). */}
        <Link href={markHref} className="flex min-w-0 flex-1 items-center gap-4 text-fg no-underline hover:no-underline">
          <span className="cl-av" aria-hidden>
            {initialsOf(item.studentName)}
          </span>
          <span className="cl-grow-main">
            <span className="block truncate">{item.studentName}</span>
            <span className="cl-sub truncate">
              {context && `${context} · `}
              {item.assessmentTitle} · submitted {formatDateTime(item.lastSubmittedAt)}
              {/* Amber: late is a fact about the queue, not a failure (CLAUDE.md §11.1). */}
              {item.isLate && <span style={{ color: 'var(--cl-warn)' }}> · Late</span>}
            </span>
          </span>
        </Link>

        <span className="shrink-0 text-end">
          <span className="block text-[14px]" style={{ color: status.color }}>
            {status.text}
          </span>
          <span className="cl-muted block text-[13px]">{item.score === null ? '—' : `${item.score}/${item.maxScore}`}</span>
        </span>

        <Link href={markHref} className="cl-glink shrink-0">
          Open work
        </Link>

        <button type="button" className={item.status === 'graded' ? 'cl-btns' : 'cl-btnp'} onClick={onGrade}>
          {item.status === 'graded' ? 'Re-grade' : 'Mark'}
        </button>
        {item.status === 'graded' && !item.returnedAt && (
          <button type="button" className="cl-btnp" disabled={returning} onClick={() => void giveBack()}>
            {returning ? 'Returning…' : 'Return'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 px-2 pb-2 text-[13px]" style={{ color: 'var(--cl-bad)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The marking form.
 *
 * **Save** stores the mark; **Save and return** also hands it back, and only a
 * returned mark reaches the student (`MARK-2`). Two calls, two operations: if
 * the return fails after the save, the form says the work is saved but not
 * returned. Once returned, a re-grade is visible at once (A-4), so there is a
 * single Save.
 *
 * Mark-up drawn on the paper lives on the task's Submissions page (`MARK-4`).
 * The annotated-copy URL stays: no document retires it, and existing marks use
 * it.
 */
export function GradeDialog({
  item,
  onClose,
  onGraded,
}: {
  item: GradingQueueItem;
  onClose: () => void;
  onGraded: () => void;
}) {
  const { token } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // ClModal owns Escape; focus the score on open and give focus back on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    bodyRef.current?.querySelector<HTMLElement>('input')?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    // Which button sent the form: Save, or Save and return.
    const andReturn =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'return';
    const form = new FormData(event.currentTarget);
    const annotated = String(form.get('annotatedFileUrl') ?? '').trim();
    setError(null);
    setBusy(true);
    try {
      await api.staff.grade(token, item.submissionId, {
        score: Number(form.get('score')),
        feedback: String(form.get('feedback') ?? '').trim() || undefined,
        annotatedFileUrl: annotated || undefined,
      });
    } catch (cause) {
      // The score ceiling is the assessment's own maxScore and is enforced
      // server-side, so its message is the useful one to surface verbatim.
      setError(cause instanceof ApiError ? cause.message : 'Could not save that mark. Please try again.');
      setBusy(false);
      return;
    }
    if (andReturn) {
      try {
        await api.staff.returnSubmission(token, item.submissionId);
      } catch (cause) {
        const why = cause instanceof ApiError ? cause.message : 'Please try again.';
        setError(`Saved, but not returned: ${why} The student cannot see it yet.`);
        setBusy(false);
        return;
      }
    }
    onGraded();
  }

  return (
    <ClModal
      open
      onClose={onClose}
      title={item.studentName}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          {item.returnedAt ? (
            <button type="submit" form="grade-form" className="cl-btnp" value="save" disabled={busy}>
              {busy ? 'Saving…' : 'Save mark'}
            </button>
          ) : (
            <>
              <button type="submit" form="grade-form" className="cl-btns" value="save" disabled={busy}>
                Save mark
              </button>
              <button type="submit" form="grade-form" className="cl-btnp" value="return" disabled={busy}>
                {busy ? 'Saving…' : 'Save and return'}
              </button>
            </>
          )}
        </>
      }
    >
      <div ref={bodyRef}>
        <p className="cl-muted m-0 mb-4 text-[13.5px]">
          {item.assessmentTitle} · out of {item.maxScore}
        </p>
        <form id="grade-form" onSubmit={submit} noValidate className="cl-fgrid">
          {item.answerText && <div className="cl-soft">{item.answerText}</div>}

          <label className="cl-fl">
            Score
            <input
              className="cl-inp"
              id="score"
              name="score"
              type="number"
              min={0}
              max={item.maxScore}
              step={1}
              required
              defaultValue={item.score ?? ''}
            />
            <span className="text-[12.5px]">{`0 to ${item.maxScore}`}</span>
          </label>

          <label className="cl-fl">
            Feedback
            <textarea
              className="cl-inp"
              id="feedback"
              name="feedback"
              rows={4}
              defaultValue={item.feedback ?? ''}
              placeholder="What went well, and what to work on."
            />
          </label>

          <label className="cl-fl">
            Annotated copy
            <input
              className="cl-inp"
              id="annotatedFileUrl"
              name="annotatedFileUrl"
              type="url"
              inputMode="url"
              defaultValue={item.annotatedFileUrl ?? ''}
              placeholder="https://"
            />
            <span className="text-[12.5px]">
              Optional link to a marked-up file. To draw on the paper, use the task&apos;s Submissions page. The
              student&apos;s original is never replaced.
            </span>
          </label>

          {error && (
            <p role="alert" className="m-0 text-[13.5px]" style={{ color: 'var(--cl-bad)' }}>
              {error}
            </p>
          )}
        </form>
      </div>
    </ClModal>
  );
}
