'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  ASSESSMENT_STATUS_CHIP,
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDateTime,
  formatFileSize,
} from '@/lib/format';
import type { AssessmentDetail, SubmissionView } from '@/lib/types';
import {
  Panel,
  EmptyState,
  Loader,
  Tag,
  Button,
  TextInput,
  TextArea,
  InlineBanner,
  Breadcrumb,
  PageHeader,
  Icon,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { MarkedCopy } from '@/components/marking/marked-copy';

// `ASSESSMENT_STATUS_CHIP` (`lib/format.ts`, untouched by the redesign) still
// speaks the legacy tone name `'neutral'` — the new `Tag` scale calls it `'gray'`.
const TONE: Record<string, TagTone> = {
  neutral: 'gray',
  blue: 'blue',
  amber: 'amber',
  green: 'green',
  red: 'red',
  violet: 'violet',
};

export default function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.assessments.get(token, assessmentId),
    [assessmentId],
  );

  if (loading) {
    return (
      <>
        <PageTitle title="Homework" backHref="/homework" />
        <div className="flex justify-center p-12">
          <Loader label="Loading" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageTitle title="Homework" backHref="/homework" />
        <div className="p-6">
          <EmptyState
            icon="AlertTriangle"
            title={
              error.isNotFound
                ? 'This task is not available to you. It may not have opened yet.'
                : error.message
            }
            action={!error.isNotFound && <Button onClick={reload}>Try again</Button>}
          />
        </div>
      </>
    );
  }
  if (!data) return null;

  return (
    <>
      <PageTitle title={data.title} backHref="/homework" />
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          breadcrumb={
            <Breadcrumb items={[{ href: '/homework', label: 'Homework' }, { label: data.title }]} />
          }
          title={data.title}
          description={
            <span className="flex flex-wrap items-center gap-2">
              {ASSESSMENT_TYPE_LABEL[data.type]}
              <Tag tone={TONE[ASSESSMENT_STATUS_CHIP[data.status]] ?? 'gray'}>
                {ASSESSMENT_STATUS_LABEL[data.status]}
              </Tag>
              {data.isOverdue && data.status === 'available' && <Tag tone="red">Past due</Tag>}
            </span>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <Brief assessment={data} />
            <SubmitPanel assessment={data} onSubmitted={reload} />
          </div>

          <div className="flex flex-col gap-6">
            <Marking assessment={data} />
            {data.submission && <History submission={data.submission} />}
          </div>
        </div>
      </div>
    </>
  );
}

function Brief({ assessment }: { assessment: AssessmentDetail }) {
  return (
    <Panel title="What to do">
      <p className="text-base leading-body text-fg-2">{assessment.description}</p>
      {assessment.instructions && (
        <p className="mt-4 whitespace-pre-line text-base leading-body text-fg-2">
          {assessment.instructions}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border-light pt-4 sm:grid-cols-4">
        <Fact label="Opens" value={formatDateTime(assessment.availableFrom)} />
        <Fact label="Due" value={formatDateTime(assessment.dueAt)} />
        <Fact label="Closes" value={formatDateTime(assessment.availableTo)} />
        <Fact label="Out of" value={String(assessment.maxScore)} />
      </dl>

      {assessment.topics.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {assessment.topics.map((topic) => (
            <Tag key={topic}>{topic}</Tag>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xxs text-fg-3">{label}</dt>
      <dd className="num mt-1 text-xs text-fg">{value}</dd>
    </div>
  );
}

/* --- Submission -----------------------------------------------------------
   `canSubmit` is the server's answer, not ours (CLAUDE.md §5.10).

   Uploads are a URL field for now: the R2 signed-upload flow does not exist
   yet, and a file input that cannot upload is a lie. The backend's
   `SubmitAssessmentDto` takes `fileUrl` or `answerText`. */

function SubmitPanel({
  assessment,
  onSubmitted,
}: {
  assessment: AssessmentDetail;
  onSubmitted: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const existing = assessment.submission;

  if (!assessment.canSubmit) {
    return (
      <Panel title="Your submission">
        <p className="text-base text-fg-3">
          {existing
            ? 'The submission window has closed. Your work is with Dr. Tahir.'
            : 'This is not open for submission. Check the dates above.'}
        </p>
      </Panel>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fileUrl = String(form.get('fileUrl') ?? '').trim();
    const answerText = String(form.get('answerText') ?? '').trim();

    if (!fileUrl && !answerText) {
      setFieldError('Attach a file link or type your answer.');
      return;
    }
    if (!token) return;
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      await api.assessments.submit(token, assessment.id, {
        ...(fileUrl ? { fileUrl } : {}),
        ...(answerText ? { answerText } : {}),
      });
      onSubmitted();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not send your submission. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={existing ? 'Revise your submission' : 'Your submission'}>
      {existing && (
        <p className="mb-4 text-xs text-fg-3">
          Submitted {formatDateTime(existing.lastSubmittedAt)}. Sending again replaces it, and the
          previous version is kept in your history.
        </p>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextInput
          id="fileUrl"
          name="fileUrl"
          type="url"
          inputMode="url"
          label="Link to your file"
          placeholder="https://"
          hint={`Accepted: ${assessment.allowedFileTypes.join(', ')} up to ${formatFileSize(assessment.maxFileSizeBytes)}.`}
          error={fieldError}
          defaultValue={existing?.fileUrl ?? ''}
        />

        <TextArea
          id="answerText"
          name="answerText"
          label="Or type your answer"
          hint="Either is fine. Some tasks want both."
          rows={8}
          defaultValue={existing?.answerText ?? ''}
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xxs text-fg-4">You can revise until the window closes.</p>
          <Button type="submit" variant="primary" disabled={busy} iconRight="ArrowUpRight">
            {busy ? <Loader size={3} label="Sending" /> : existing ? 'Send revision' : 'Submit'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* --- Marking: shown only once the work is RETURNED (MARK-2) -------------- */

/**
 * Keyed on `returnedAt`, not `correctedAt`: a saved mark is not the student's
 * until it is handed back. The server already withholds the score, feedback,
 * corrected copy and marks until then; this block only chooses the words.
 */
function Marking({ assessment }: { assessment: AssessmentDetail }) {
  const submission = assessment.submission;

  if (!submission || submission.returnedAt === null) {
    return (
      <Panel title="Marking">
        <p className="text-base text-fg-3">
          {!submission
            ? 'Nothing submitted yet.'
            : submission.correctedAt !== null
              ? // Saved but not returned (A-2): resubmission is already closed.
                'Your teacher is marking this. Your score and the marked paper appear here once it is returned.'
              : 'Not marked yet. Your score and the marked paper appear here once it is returned.'}
        </p>
      </Panel>
    );
  }

  const percent =
    submission.score === null || assessment.maxScore === 0
      ? null
      : Math.round((submission.score / assessment.maxScore) * 100);

  return (
    <Panel title="Marking">
      <div className="flex items-baseline gap-3">
        <span className="num text-xl leading-none text-fg">
          {submission.score ?? '—'}
          <span className="text-fg-4">/{assessment.maxScore}</span>
        </span>
        {percent !== null && <span className="num text-base text-fg-3">{percent}%</span>}
      </div>
      <p className="num mt-2 text-xxs text-fg-4">Returned {formatDateTime(submission.returnedAt)}</p>

      {submission.feedback && (
        <p dir="auto" className="mt-4 whitespace-pre-line border-t border-border-light pt-4 text-base leading-body text-fg-2">
          {submission.feedback}
        </p>
      )}

      {submission.fileUrl && submission.annotations.length > 0 && (
        <div className="mt-4 border-t border-border-light pt-4">
          <MarkedCopy fileUrl={submission.fileUrl} annotations={submission.annotations} />
        </div>
      )}

      {submission.annotatedFileUrl && (
        <a
          href={submission.annotatedFileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-8 items-center gap-2 rounded-md px-4 text-base text-fg shadow-[inset_0_0_0_1px_var(--border-light)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
        >
          <Icon name="ArrowDown" size={16} />
          Open the corrected copy
        </a>
      )}
    </Panel>
  );
}

/* --- Revision history. The original is never overwritten (§5.5). --------- */

function History({ submission }: { submission: SubmissionView }) {
  if (submission.revisions.length === 0) return null;

  return (
    <Panel title="Your earlier versions" bodyClassName="">
      <ul className="divide-y divide-border-light">
        {submission.revisions.map((revision) => (
          <li key={revision.id} className="flex items-start gap-3 px-4 py-3">
            <Icon name="History" size={14} className="mt-[2px] shrink-0 text-fg-4" />
            <div className="min-w-0 flex-1">
              <p className="num text-xs text-fg-2">Sent {formatDateTime(revision.submittedAt)}</p>
              <p className="num mt-1 text-xxs text-fg-4">
                Replaced {formatDateTime(revision.replacedAt)}
              </p>
              {revision.fileUrl && (
                <a
                  href={revision.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-fg-2 underline underline-offset-2 hover:text-fg"
                >
                  Open that file
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
