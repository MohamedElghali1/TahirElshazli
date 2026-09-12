'use client';

import { use, useState } from 'react';
import {
  ClockCounterClockwiseIcon,
  FileArrowDownIcon,
  PaperPlaneTiltIcon,
} from '@phosphor-icons/react';
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
import type { ChipTone } from '@/components/ui';
import {
  Button,
  Chip,
  ErrorState,
  Field,
  FormError,
  Input,
  Panel,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

export default function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; assessmentId: string }>;
}) {
  const { id, assessmentId } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.assessments.get(token, assessmentId),
    [assessmentId],
  );

  if (loading) {
    return (
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        <Skeleton className="h-[var(--sp-8)] w-[320px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[160px]" />
      </PageBody>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={
          error.isNotFound
            ? 'This task is not available to you. It may not have opened yet.'
            : error.message
        }
        onRetry={error.isNotFound ? undefined : reload}
      />
    );
  }
  if (!data) return null;

  return (
    <>
      <PageHeader
        title={data.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-[var(--sp-2)]">
            {ASSESSMENT_TYPE_LABEL[data.type]}
            <Chip tone={ASSESSMENT_STATUS_CHIP[data.status] as ChipTone}>
              {ASSESSMENT_STATUS_LABEL[data.status]}
            </Chip>
            {data.isOverdue && data.status === 'available' && (
              <Chip tone="red">Past due</Chip>
            )}
          </span>
        }
        breadcrumb={[
          { href: `/learn/${id}/assessments`, label: 'Work' },
          { href: `/learn/${id}/assessments/${assessmentId}`, label: data.title },
        ]}
      />

      <PageBody className="grid gap-[var(--sp-6)] xl:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-[var(--sp-6)]">
          <Brief assessment={data} />
          <SubmitPanel assessment={data} onSubmitted={reload} />
        </div>

        <div className="flex flex-col gap-[var(--sp-6)]">
          <Marking assessment={data} />
          {data.submission && <History submission={data.submission} />}
        </div>
      </PageBody>
    </>
  );
}

function Brief({ assessment }: { assessment: AssessmentDetail }) {
  return (
    <Panel title="What to do">
      <p className="text-[var(--fs-base)] leading-[var(--lh-loose)] text-fg-2">
        {assessment.description}
      </p>
      {assessment.instructions && (
        <p className="mt-[var(--sp-4)] whitespace-pre-line text-[var(--fs-base)] leading-[var(--lh-loose)] text-fg-2">
          {assessment.instructions}
        </p>
      )}

      <dl className="mt-[var(--sp-6)] grid grid-cols-2 gap-[var(--sp-4)] border-t border-[var(--border-light)] pt-[var(--sp-4)] sm:grid-cols-4">
        <Fact label="Opens" value={formatDateTime(assessment.availableFrom)} />
        <Fact label="Due" value={formatDateTime(assessment.dueAt)} />
        <Fact label="Closes" value={formatDateTime(assessment.availableTo)} />
        <Fact label="Out of" value={String(assessment.maxScore)} />
      </dl>

      {assessment.topics.length > 0 && (
        <div className="mt-[var(--sp-4)] flex flex-wrap gap-[var(--sp-2)]">
          {assessment.topics.map((topic) => (
            <Chip key={topic} tone="neutral">
              {topic}
            </Chip>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--fs-xxs)] text-fg-3">{label}</dt>
      <dd className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-fg">
        {value}
      </dd>
    </div>
  );
}

/* --- Submission -----------------------------------------------------------
   `canSubmit` is the server's answer, not ours. The form never derives its
   own availability from the timestamps above (CLAUDE.md §5.10).

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
        <p className="text-[var(--fs-base)] text-fg-3">
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
        <p className="mb-[var(--sp-4)] text-[var(--fs-xs)] text-fg-3">
          Submitted {formatDateTime(existing.lastSubmittedAt)}. Sending again
          replaces it, and the previous version is kept in your history.
        </p>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--sp-4)]">
        <Field
          label="Link to your file"
          htmlFor="fileUrl"
          hint={`Accepted: ${assessment.allowedFileTypes.join(', ')} up to ${formatFileSize(assessment.maxFileSizeBytes)}.`}
          error={fieldError}
        >
          <Input
            id="fileUrl"
            name="fileUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            defaultValue={existing?.fileUrl ?? ''}
            aria-invalid={Boolean(fieldError)}
          />
        </Field>

        <Field
          label="Or type your answer"
          htmlFor="answerText"
          hint="Either is fine. Some tasks want both."
        >
          <Textarea
            id="answerText"
            name="answerText"
            rows={8}
            defaultValue={existing?.answerText ?? ''}
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <div className="flex items-center justify-between gap-[var(--sp-4)]">
          <p className="text-[var(--fs-xxs)] text-fg-4">
            You can revise until the window closes.
          </p>
          <Button type="submit" variant="primary" loading={busy}>
            <PaperPlaneTiltIcon size={14} weight="fill" />
            {existing ? 'Send revision' : 'Submit'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* --- Marking: the score, the feedback, and the annotated PDF (§5.5) ------ */

function Marking({ assessment }: { assessment: AssessmentDetail }) {
  const submission = assessment.submission;

  if (!submission || submission.correctedAt === null) {
    return (
      <Panel title="Marking">
        <p className="text-[var(--fs-base)] text-fg-3">
          {submission
            ? 'Not marked yet. Your score and the corrected copy appear here once Dr. Tahir returns it.'
            : 'Nothing submitted yet.'}
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
      <div className="flex items-baseline gap-[var(--sp-3)]">
        <span className="num text-[var(--fs-xl)] leading-none text-fg">
          {submission.score ?? '--'}
          <span className="text-fg-4">/{assessment.maxScore}</span>
        </span>
        {percent !== null && (
          <span className="num text-[var(--fs-base)] text-fg-3">
            {percent}%
          </span>
        )}
      </div>
      <p className="num mt-[var(--sp-2)] text-[var(--fs-xxs)] text-fg-4">
        Returned {formatDateTime(submission.correctedAt)}
      </p>

      {submission.feedback && (
        <p className="mt-[var(--sp-4)] whitespace-pre-line border-t border-[var(--border-light)] pt-[var(--sp-4)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-fg-2">
          {submission.feedback}
        </p>
      )}

      {submission.annotatedFileUrl && (
        <a
          href={submission.annotatedFileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-[var(--sp-4)] inline-flex h-[var(--h-md)] items-center gap-[var(--sp-2)] rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-tertiary)] px-[var(--sp-4)] text-[var(--fs-base)] text-fg transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
        >
          <FileArrowDownIcon size={16} />
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
      <ul className="rows">
        {submission.revisions.map((revision) => (
          <li
            key={revision.id}
            className="flex items-start gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]"
          >
            <ClockCounterClockwiseIcon
              size={14}
              className="mt-[2px] shrink-0 text-fg-4"
            />
            <div className="min-w-0 flex-1">
              <p className="num text-[var(--fs-xs)] text-fg-2">
                Sent {formatDateTime(revision.submittedAt)}
              </p>
              <p className="num mt-[var(--sp-1)] text-[var(--fs-xxs)] text-fg-4">
                Replaced {formatDateTime(revision.replacedAt)}
              </p>
              {revision.fileUrl && (
                <a
                  href={revision.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-[var(--sp-2)] inline-block text-[var(--fs-xs)] text-fg-2 underline underline-offset-2 hover:text-fg"
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
