'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { ASSESSMENT_TYPE_LABEL, formatDateTime, formatPercent } from '@/lib/format';
import type { GradingQueueItem, GradingStatus } from '@/lib/types';
import {
  Button,
  EmptyState,
  Icon,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Table,
  Tag,
  TextArea,
  TextInput,
} from '@/components/ui';

const STATUS_FILTER: { value: GradingStatus | ''; label: string }[] = [
  { value: 'awaiting', label: 'Awaiting grading' },
  { value: 'graded', label: 'Graded' },
  { value: '', label: 'All' },
];

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
export default function CourseGradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [status, setStatus] = useState<GradingStatus | ''>('awaiting');
  const [editing, setEditing] = useState<GradingQueueItem | null>(null);

  const { data, error, loading, reload } = useApi(
    (token) => api.staff.submissions(token, id, status || undefined),
    [id, status],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Per-assessment averages across every student - CLAUDE.md §5.6, the
          number that says whether a task was hard or easy. */}
      <Panel title="Assessment averages" bodyClassName="">
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading assessment averages" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={
              error.isNotFound
                ? 'This course does not exist, or it is not assigned to you.'
                : error.message
            }
            action={error.isNotFound ? undefined : <Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.assessments.length === 0 && (
          <EmptyState
            icon="ListDetails"
            title="No assessments yet"
            description="Once this course has homework, assignments or quizzes, their cohort averages appear here."
          />
        )}
        {data && data.assessments.length > 0 && (
          <Table
            rowKey={(row) => row.assessmentId}
            rows={data.assessments}
            columns={[
              { label: 'Assessment', render: (a) => a.title },
              { label: 'Type', render: (a) => <Tag tone="gray">{ASSESSMENT_TYPE_LABEL[a.type]}</Tag> },
              { label: 'Submitted', align: 'end', render: (a) => <span className="num">{a.submissionCount}</span> },
              { label: 'Graded', align: 'end', render: (a) => <span className="num">{a.gradedCount}</span> },
              {
                label: 'Class average',
                align: 'end',
                render: (a) => <span className="num text-fg">{formatPercent(a.averageScorePercent)}</span>,
              },
            ]}
          />
        )}
      </Panel>

      <Panel
        title="Submissions"
        action={
          <Select
            aria-label="Filter submissions by status"
            className="w-auto min-w-[150px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as GradingStatus | '')}
            options={STATUS_FILTER}
          />
        }
        bodyClassName=""
      >
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading submissions" />
          </div>
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            icon="Inbox"
            title={status === 'awaiting' ? 'Nothing waiting' : 'No submissions here'}
            description={
              status === 'awaiting'
                ? 'Every submission on this course has been marked.'
                : 'Work submitted by students on this course will appear here.'
            }
          />
        )}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-border-light">
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
    </div>
  );
}

function SubmissionRow({ item, onGrade }: { item: GradingQueueItem; onGrade: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-fg">{item.studentName}</span>
        <span className="mt-1 block truncate text-xs text-fg-3">
          {item.assessmentTitle} · submitted {formatDateTime(item.lastSubmittedAt)}
        </span>
      </span>

      {item.isLate && <Tag tone="red">Late</Tag>}
      <Tag tone={item.status === 'graded' ? 'green' : 'amber'}>{item.status === 'graded' ? 'Graded' : 'Awaiting'}</Tag>

      <span className="num w-[68px] text-end text-base text-fg">
        {item.score === null ? '—' : `${item.score}/${item.maxScore}`}
      </span>

      {item.fileUrl && (
        <a
          href={item.fileUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs text-fg-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:text-fg"
        >
          Open work
          <Icon name="ArrowUpRight" size={12} />
        </a>
      )}

      <Button size="small" variant={item.status === 'graded' ? 'tertiary' : 'primary'} onClick={onGrade}>
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
      setError(cause instanceof ApiError ? cause.message : 'Could not save that mark. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grade-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-surface-overlay p-4 sm:items-center"
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-md border border-border-medium bg-surface">
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
            autoFocus
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
            hint="Optional link to the marked-up file. The student's original is never replaced."
          />

          {error && <InlineBanner tone="danger">{error}</InlineBanner>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? <Loader size={3} label="Saving" /> : 'Save mark'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
