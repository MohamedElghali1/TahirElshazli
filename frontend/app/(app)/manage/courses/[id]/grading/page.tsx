'use client';

import { use, useState } from 'react';
import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  ASSESSMENT_TYPE_LABEL,
  formatDateTime,
  formatPercent,
} from '@/lib/format';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Panel,
  RowsSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';

/**
 * The grading queue.
 *
 * This is the TA's central permission under CLAUDE.md §2.2 and the first
 * non-admin mutation the audit log records (§5.4) - every mark posted here
 * writes a `submission.graded` entry naming who set it and what it was before.
 *
 * Status is never computed in the browser. `awaiting`/`graded` and `isLate`
 * arrive already derived from the server's own timestamps (§5.10); the filter
 * below narrows a server-derived value rather than recomputing one.
 */
export default function CourseGradingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [status, setStatus] = useState<GradingStatus | ''>('awaiting');
  const [editing, setEditing] = useState<GradingQueueItem | null>(null);

  const { data, error, loading, reload } = useApi(
    (token) => api.staff.submissions(token, id, status || undefined),
    [id, status],
  );

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
      {/* Per-assessment averages across every student - CLAUDE.md §5.6, the
          number that says whether a task was hard or easy. */}
      <Panel title="Assessment averages" bodyClassName="">
        {loading && <RowsSkeleton rows={3} />}
        {error && (
          <ErrorState
            message={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            onRetry={error.isNotFound ? undefined : reload}
          />
        )}
        {data && data.assessments.length === 0 && (
          <EmptyState
            title="No assessments yet"
            body="Once this course has homework, assignments or quizzes, their cohort averages appear here."
          />
        )}
        {data && data.assessments.length > 0 && (
          <TableScroll minWidth={560}>
            <thead>
              <tr className="border-b border-[var(--border-light)]">
                <Th>Assessment</Th>
                <Th>Type</Th>
                <Th align="end">Submitted</Th>
                <Th align="end">Graded</Th>
                <Th align="end">Class average</Th>
              </tr>
            </thead>
            <tbody>
              {data.assessments.map((assessment) => (
                <Tr key={assessment.assessmentId}>
                  <Td className="text-[var(--fg-primary)]">{assessment.title}</Td>
                  <Td>
                    <Chip tone="neutral">
                      {ASSESSMENT_TYPE_LABEL[assessment.type]}
                    </Chip>
                  </Td>
                  <Td align="end">
                    <span className="num">{assessment.submissionCount}</span>
                  </Td>
                  <Td align="end">
                    <span className="num">{assessment.gradedCount}</span>
                  </Td>
                  <Td align="end">
                    <span className="num text-[var(--fg-primary)]">
                      {formatPercent(assessment.averageScorePercent)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableScroll>
        )}
      </Panel>

      <Panel
        title="Submissions"
        action={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as GradingStatus | '')}
            className="w-auto min-w-[150px]"
            aria-label="Filter submissions by status"
          >
            <option value="awaiting">Awaiting grading</option>
            <option value="graded">Graded</option>
            <option value="">All</option>
          </Select>
        }
        bodyClassName=""
      >
        {loading && <RowsSkeleton rows={5} />}
        {data && data.items.length === 0 && (
          <EmptyState
            title={
              status === 'awaiting' ? 'Nothing waiting' : 'No submissions here'
            }
            body={
              status === 'awaiting'
                ? 'Every submission on this course has been marked.'
                : 'Work submitted by students on this course will appear here.'
            }
          />
        )}
        {data && data.items.length > 0 && (
          <ul className="rows">
            {data.items.map((item) => (
              <li key={item.submissionId}>
                <SubmissionRow item={item} onGrade={() => setEditing(item)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing && (
        <GradeDialog
          item={editing}
          onClose={() => setEditing(null)}
          onGraded={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </PageBody>
  );
}

function SubmissionRow({
  item,
  onGrade,
}: {
  item: GradingQueueItem;
  onGrade: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
          {item.studentName}
        </span>
        <span className="mt-[var(--sp-1)] block truncate text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {item.assessmentTitle} · submitted {formatDateTime(item.lastSubmittedAt)}
        </span>
      </span>

      {item.isLate && <Chip tone="red">Late</Chip>}
      <Chip tone={item.status === 'graded' ? 'green' : 'amber'}>
        {item.status === 'graded' ? 'Graded' : 'Awaiting'}
      </Chip>

      <span className="num w-[68px] text-end text-[var(--fs-base)] text-[var(--fg-primary)]">
        {item.score === null ? '--' : `${item.score}/${item.maxScore}`}
      </span>

      {item.fileUrl && (
        <a
          href={item.fileUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
        >
          Open work
          <ArrowSquareOutIcon size={12} />
        </a>
      )}

      <Button size="sm" variant={item.status === 'graded' ? 'ghost' : 'primary'} onClick={onGrade}>
        {item.status === 'graded' ? 'Re-grade' : 'Grade'}
      </Button>
    </div>
  );
}

/**
 * The marking form.
 *
 * The annotated file is a URL field, not an upload, and that is honest rather
 * than lazy: CLAUDE.md §5.5 wants in-platform PDF annotation and §3 puts the
 * files in Cloudflare R2 - neither exists yet. The field records the separate
 * annotated artifact §5.5 asks for without pretending to be the editor.
 */
function GradeDialog({
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
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
      onGraded();
    } catch (cause) {
      // The score ceiling is the assessment's own maxScore and is enforced
      // server-side, so its message is the useful one to surface verbatim.
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not save that mark. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grade-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--bg-scrim)] p-[var(--sp-4)] sm:items-center"
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-medium)] bg-[var(--bg-secondary)]">
        <header className="flex items-start justify-between gap-[var(--sp-4)] border-b border-[var(--border-light)] px-[var(--sp-4)] py-[var(--sp-3)]">
          <div className="min-w-0">
            <h2
              id="grade-title"
              className="truncate text-[var(--fs-base)] font-semibold text-[var(--fg-primary)]"
            >
              {item.studentName}
            </h2>
            <p className="mt-[var(--sp-1)] truncate text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              {item.assessmentTitle} · out of {item.maxScore}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
        </header>

        <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--sp-4)] p-[var(--sp-4)]">
          {item.answerText && (
            <div className="rounded-[var(--r-xs)] bg-[var(--bg-wash)] p-[var(--sp-3)] text-[var(--fs-xs)] leading-[var(--lh-base)] text-[var(--fg-secondary)]">
              {item.answerText}
            </div>
          )}

          <Field label="Score" htmlFor="score" hint={`0 to ${item.maxScore}`}>
            <Input
              id="score"
              name="score"
              type="number"
              min={0}
              max={item.maxScore}
              step={1}
              required
              autoFocus
              defaultValue={item.score ?? ''}
            />
          </Field>

          <Field label="Feedback" htmlFor="feedback">
            <Textarea
              id="feedback"
              name="feedback"
              rows={4}
              defaultValue={item.feedback ?? ''}
              placeholder="What went well, and what to work on."
            />
          </Field>

          <Field
            label="Annotated copy"
            htmlFor="annotatedFileUrl"
            hint="Optional link to the marked-up file. The student's original is never replaced."
          >
            <Input
              id="annotatedFileUrl"
              name="annotatedFileUrl"
              type="url"
              inputMode="url"
              defaultValue={item.annotatedFileUrl ?? ''}
              placeholder="https://"
            />
          </Field>

          {error && <FormError>{error}</FormError>}

          <div className="flex justify-end gap-[var(--sp-2)]">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Save mark
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
