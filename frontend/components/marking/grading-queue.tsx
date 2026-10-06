'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import { Button, Icon, InlineBanner, Loader, Tag, TextArea, TextInput } from '@/components/ui';

/**
 * One row of a grading queue and the dialog that marks it. Shared by the
 * course Grading tab (`manage/courses/[id]/grading`) and the cross-course
 * Submissions screen (`manage/submissions`).
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

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      {/* The marking page renders the hand-in itself (photos, PDF, typed answer). */}
      <Link href={markHref} className="min-w-0 flex-1 rounded-sm">
        <span className="block truncate text-base font-medium text-fg hover:underline">{item.studentName}</span>
        <span className="mt-1 block truncate text-xs text-fg-3">
          {context && `${context} · `}
          {item.assessmentTitle} · submitted {formatDateTime(item.lastSubmittedAt)}
        </span>
      </Link>

      {/* Amber: late is a fact about the queue, not a failure (CLAUDE.md §11.1). */}
      {item.isLate && <Tag tone="amber">Late</Tag>}
      {item.status !== 'graded' ? (
        <Tag tone="amber">Awaiting</Tag>
      ) : item.returnedAt ? (
        <Tag tone="green">Returned</Tag>
      ) : (
        // Saved, not yet visible to the student.
        <Tag tone="blue">Marked, not returned</Tag>
      )}

      <span className="num w-[68px] text-end text-base text-fg">
        {item.score === null ? '—' : `${item.score}/${item.maxScore}`}
      </span>

      <Link
        href={markHref}
        className="inline-flex items-center gap-1 text-xs text-fg-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:text-fg"
      >
        Open work
        <Icon name="ArrowUpRight" size={12} />
      </Link>

      <Button size="small" variant={item.status === 'graded' ? 'tertiary' : 'primary'} onClick={onGrade}>
        {item.status === 'graded' ? 'Re-grade' : 'Grade'}
      </Button>
      {item.status === 'graded' && !item.returnedAt && (
        <Button size="small" variant="primary" disabled={returning} onClick={() => void giveBack()}>
          {returning ? <Loader size={3} label="Returning" /> : 'Return'}
        </Button>
      )}
      {error && (
        <InlineBanner tone="danger" className="w-full">
          {error}
        </InlineBanner>
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
  const panelRef = useRef<HTMLDivElement>(null);
  // The parent passes a fresh `onClose` every render; reading it through a ref
  // keeps the effect below mounted once, so focus is captured and restored once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap, Escape to close, focus returned to the opener — the same
  // behaviour as `CurriculumDrawer` in app/(app)/lessons/page.tsx.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grade-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-surface-overlay p-4 sm:items-center"
    >
      <div
        ref={panelRef}
        className="w-full max-w-[520px] overflow-hidden rounded-md border border-border-medium bg-surface"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-light px-4 py-3">
          <div className="min-w-0">
            <h2 id="grade-title" className="truncate text-base font-semibold text-fg">
              {item.studentName}
            </h2>
            <p className="mt-1 truncate text-xs text-fg-3">
              {item.assessmentTitle} · out of {item.maxScore}
            </p>
          </div>
          <Button size="small" variant="tertiary" onClick={onClose} type="button">
            Cancel
          </Button>
        </header>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-4">
          {item.answerText && (
            <div className="rounded-sm bg-wash-hover p-3 text-xs leading-body text-fg-2">{item.answerText}</div>
          )}

          <TextInput
            label="Score"
            id="score"
            name="score"
            type="number"
            min={0}
            max={item.maxScore}
            step={1}
            required
            defaultValue={item.score ?? ''}
            hint={`0 to ${item.maxScore}`}
          />

          <TextArea
            label="Feedback"
            id="feedback"
            name="feedback"
            rows={4}
            defaultValue={item.feedback ?? ''}
            placeholder="What went well, and what to work on."
          />

          <TextInput
            label="Annotated copy"
            id="annotatedFileUrl"
            name="annotatedFileUrl"
            type="url"
            inputMode="url"
            defaultValue={item.annotatedFileUrl ?? ''}
            placeholder="https://"
            hint="Optional link to a marked-up file. To draw on the paper, use the task's Submissions page. The student's original is never replaced."
          />

          {error && <InlineBanner tone="danger">{error}</InlineBanner>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            {item.returnedAt ? (
              <Button type="submit" variant="primary" value="save" disabled={busy}>
                {busy ? <Loader size={3} label="Saving" /> : 'Save mark'}
              </Button>
            ) : (
              <>
                <Button type="submit" value="save" disabled={busy}>
                  Save mark
                </Button>
                <Button type="submit" variant="primary" value="return" disabled={busy}>
                  {busy ? <Loader size={3} label="Saving" /> : 'Save and return'}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
