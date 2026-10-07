'use client';

import { use, useState } from 'react';
import { api, ApiError, mediaSrc } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDateTime,
  formatFileSize,
} from '@/lib/format';
import type { AssessmentDetail, SubmissionFile, SubmissionMode, SubmissionView } from '@/lib/types';
import {
  Loader,
  Tag,
  Button,
  TextInput,
  TextArea,
  InlineBanner,
  Icon,
  FileDrop,
  ButtonLink,
} from '@/components/ui';
import { ClIcon } from '@/components/shell/classroom';
import { BackLink, ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { MarkedCopy } from '@/components/marking/marked-copy';

/** The panel every block of this page sits in: the V2 cl-panel with its small title. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cl-panel">
      <PanelHead title={title} small />
      {children}
    </section>
  );
}

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
        <BackLink href="/homework">Back to the course</BackLink>
        <section className="cl-panel">
          <ClSkeleton label="Loading" />
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageTitle title="Homework" backHref="/homework" />
        <BackLink href="/homework">Back to the course</BackLink>
        <section className="cl-panel">
          {error.isNotFound ? (
            <ClEmpty icon="close" title="This task is not available to you. It may not have opened yet." />
          ) : (
            <ClError message={error.message} onRetry={reload} />
          )}
        </section>
      </>
    );
  }
  if (!data) return null;

  return (
    <>
      <PageTitle title={data.title} backHref="/homework" />
      <BackLink href="/homework">Back to the course</BackLink>
      <Brief assessment={data} />
      <div id="hand-in" className="scroll-mt-6">
        <SubmitPanel assessment={data} onSubmitted={reload} />
      </div>
      <Marking assessment={data} />
      {data.submission && <History submission={data.submission} />}
    </>
  );
}

function statusOf(a: AssessmentDetail): { text: string; color?: string } {
  if (a.status === 'available') {
    return a.isOverdue ? { text: 'Missing', color: 'var(--cl-bad)' } : { text: ASSESSMENT_STATUS_LABEL.available };
  }
  if (a.status === 'submitted') return { text: 'Handed in', color: 'var(--cl-ok)' };
  if (a.status === 'corrected') {
    return { text: `${ASSESSMENT_STATUS_LABEL.corrected} · ${a.score ?? '—'} / ${a.maxScore}`, color: 'var(--cl-ok)' };
  }
  return { text: ASSESSMENT_STATUS_LABEL.locked };
}

function Brief({ assessment }: { assessment: AssessmentDetail }) {
  const quiz = assessment.type === 'quiz';
  const st = statusOf(assessment);
  const work = assessment.work;
  return (
    <section className="cl-panel" aria-labelledby="it-h">
      <div className="cl-ph" style={{ alignItems: 'flex-start' }}>
        <div className="flex min-w-0 items-center gap-3.5">
          <span className={`cl-ic40 cl-ic48 ${quiz ? 'cl-tone-blue' : 'cl-tone-peach'}`}>
            <ClIcon name={quiz ? 'quiz' : 'pen'} />
          </span>
          <div className="min-w-0">
            <h2 id="it-h" className="cl-pt">
              {assessment.title}
            </h2>
            <div className="cl-muted mt-1 text-[14px]">
              {ASSESSMENT_TYPE_LABEL[assessment.type]} · Dr. Tahir Elshazli · posted {formatDateTime(assessment.availableFrom)}
            </div>
          </div>
        </div>
        <span className="text-[14px]" style={st.color ? { color: st.color } : undefined}>
          {st.text}
        </span>
      </div>

      <dl className="m-0 flex flex-wrap gap-x-8 gap-y-3 border-b border-[var(--cl-line)] px-1 pb-4">
        <Fact label="Opens" value={formatDateTime(assessment.availableFrom)} />
        <Fact
          label="Due"
          value={formatDateTime(assessment.dueAt)}
          color={assessment.isOverdue && assessment.status === 'available' ? 'var(--cl-bad)' : undefined}
        />
        <Fact label="Closes" value={formatDateTime(assessment.availableTo)} />
        <Fact label="Points" value={String(assessment.maxScore)} />
      </dl>

      <p className="mx-1 my-[18px] max-w-[760px] text-[15px] leading-[1.65]">{assessment.description}</p>
      {assessment.instructions && (
        <p className="mx-1 my-[18px] max-w-[760px] whitespace-pre-line text-[15px] leading-[1.65]">
          {assessment.instructions}
        </p>
      )}

      {assessment.topics.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {assessment.topics.map((topic) => (
            <Tag key={topic}>{topic}</Tag>
          ))}
        </div>
      )}

      {assessment.attachments.length > 0 && (
        <>
          <div className="cl-flab">Attachments</div>
          {assessment.attachments.map((file) => (
            <div key={file.url} className="cl-chip-row">
              <span className="cl-ic40 cl-ic34 cl-tone-sky">
                <ClIcon name="file" small />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{file.name}</span>
                {file.sizeBytes != null && <span className="cl-muted text-[12.5px]">{formatFileSize(file.sizeBytes)}</span>}
              </span>
              <a href={mediaSrc(file.url)} target="_blank" rel="noreferrer" className="cl-btns">
                Open
              </a>
            </div>
          ))}
        </>
      )}

      {work.kind === 'link' && (
        <div className="mt-3">
          <a href={mediaSrc(work.url)} target="_blank" rel="noreferrer" className="cl-btnp">
            Open link
          </a>
        </div>
      )}
      {work.kind === 'google_form' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a href={work.formUrl || '#'} target="_blank" rel="noreferrer" className="cl-btnp">
            Open Google Form
          </a>
          <span className="cl-muted text-[13.5px]">
            {work.score !== null
              ? `Marked: ${work.score}/${work.maxScore ?? assessment.maxScore}`
              : work.completed
                ? 'Handed in — waiting on Google to mark it'
                : 'Not answered yet'}
          </span>
        </div>
      )}
      {assessment.canSubmit && (
        <div className="mt-3">
          <ButtonLink href="#hand-in" variant="secondary" icon="Upload">
            {assessment.submission ? 'Revise your work' : 'Hand in your work'}
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <dt className="cl-muted text-[12.5px]">{label}</dt>
      <dd className="num m-0 mt-0.5 text-[15px]" style={color ? { color } : undefined}>
        {value}
      </dd>
    </div>
  );
}

/* --- Submission -----------------------------------------------------------
   `canSubmit` is the server's answer, not ours (CLAUDE.md §5.10).

   A task stating no submission modes keeps the old form: a link and/or a
   typed answer. A task stating modes (`D-47`) gets `ModedSubmit`: one way to
   hand in, chosen from the modes, with real uploads (`D-48`). */

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

  if (assessment.work.kind === 'file_upload' && assessment.work.submissionModes.length > 0) {
    return (
      <ModedSubmit
        assessment={assessment}
        modes={assessment.work.submissionModes}
        maxBytes={assessment.work.maxFileSizeBytes}
        onSubmitted={onSubmitted}
      />
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

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type FileKind = 'pdf_upload' | 'docx_upload' | 'photo_upload';

const KIND_NAME: Record<FileKind, string> = {
  pdf_upload: 'a PDF',
  docx_upload: 'a Word document',
  photo_upload: 'photos',
};

/** Which upload mode a chosen file belongs to, from its type or extension. */
function kindOfFile(file: { type: string; name: string }): FileKind | null {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf_upload';
  if (file.type === DOCX_MIME_TYPE || /\.docx$/i.test(file.name)) return 'docx_upload';
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) return 'photo_upload';
  return null;
}

/**
 * The hand-in for a task that states modes (`D-47`, `D-48`). One file input:
 * the mode is read off the file(s) chosen, not picked first. Files upload as
 * they are chosen - each is stored and typed by the server, and becomes work
 * only when this form is sent. A Google Doc link is the one alternative, when
 * the task allows it. Sending again replaces the whole hand-in; the previous
 * one stays in the history.
 *
 * The server is the rule; this form only avoids offering what it will refuse.
 */
function ModedSubmit({
  assessment,
  modes,
  maxBytes,
  onSubmitted,
}: {
  assessment: AssessmentDetail;
  modes: SubmissionMode[];
  maxBytes: number;
  onSubmitted: () => void;
}) {
  const { token } = useSession();
  const existing = assessment.submission;
  const fileModes = modes.filter((m): m is FileKind => m !== 'doc_link');
  const allowLink = modes.includes('doc_link');
  const [files, setFiles] = useState<SubmissionFile[]>(() => existing?.files ?? []);
  const [link, setLink] = useState(existing?.fileUrl ?? '');
  const [note, setNote] = useState(existing?.answerText ?? '');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoCap = 5;
  const accept = [
    fileModes.includes('pdf_upload') && 'application/pdf',
    fileModes.includes('docx_upload') && `.docx,${DOCX_MIME_TYPE}`,
    fileModes.includes('photo_upload') && 'image/jpeg,image/png,image/webp',
  ]
    .filter(Boolean)
    .join(',');
  const typeNames = [
    fileModes.includes('pdf_upload') && 'PDF',
    fileModes.includes('docx_upload') && 'Word document (.docx)',
    fileModes.includes('photo_upload') && 'JPEG, PNG or WebP photos',
  ].filter(Boolean);
  const photos =
    files.length > 0 && kindOfFile({ type: files[0]!.mimeType, name: files[0]!.url }) === 'photo_upload';

  async function choose(chosen: File[]) {
    if (!token || chosen.length === 0) return;
    const kinds = chosen.map(kindOfFile);
    const kind = kinds[0];
    if (!kind || kinds.some((k) => k !== kind)) {
      setError(
        kinds.some((k) => k === null)
          ? `This task takes ${typeNames.join(', ')}.`
          : 'Choose files of one type: a PDF, a Word document, or photos.',
      );
      return;
    }
    if (!fileModes.includes(kind)) {
      setError(`This task does not accept ${KIND_NAME[kind]}. It takes ${typeNames.join(', ')}.`);
      return;
    }
    const single = kind !== 'photo_upload';
    // Photos add to photos already chosen; anything else replaces the hand-in.
    const keep = !single && photos ? files.length : 0;
    if (single && chosen.length > 1) {
      setError(kind === 'pdf_upload' ? 'Hand in one PDF.' : 'Hand in one Word document.');
      return;
    }
    const room = photoCap - keep;
    if (!single && chosen.length > room) {
      setError(`You can add ${room} more photo${room === 1 ? '' : 's'}.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const stored: SubmissionFile[] = [];
      for (const file of chosen) {
        // One at a time, so a refusal names the file it was about.
        stored.push(await api.assessments.uploadFile(token, assessment.id, file));
      }
      setFiles((f) => (keep > 0 ? [...f, ...stored] : stored));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That file could not be uploaded. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (files.length > 0 && allowLink && link.trim()) {
      setError('Hand in a file or a link, not both.');
      return;
    }
    const useLink = allowLink && files.length === 0 && link.trim() !== '';
    if (!useLink && files.length === 0) {
      setError(allowLink ? 'Add your file, or paste the link to your document.' : 'Add your work first.');
      return;
    }
    const body = useLink
      ? { fileUrl: link.trim(), answerText: note.trim() || undefined }
      : { files: files.map((f) => f.url), answerText: note.trim() || undefined };
    setError(null);
    setBusy(true);
    try {
      await api.assessments.submit(token, assessment.id, body);
      onSubmitted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send your submission. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={existing ? 'Revise your submission' : 'Your submission'}>
      {existing && (
        <p className="mb-4 text-xs text-fg-3">
          Submitted {formatDateTime(existing.lastSubmittedAt)}. Sending again replaces all of it, and the
          previous version is kept in your history.
        </p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {fileModes.length > 0 && (
          <div className="flex flex-col gap-2">
            <FileDrop
              title="Upload your work"
              hint={
                <>
                  Click to choose, or drag it here. {typeNames.join(', ')}
                  {fileModes.includes('photo_upload') &&
                    ` (up to ${photoCap} photos; iPhone HEIC photos: choose "Most compatible" in camera settings)`}
                  , up to {formatFileSize(Math.min(maxBytes, 20 * 1024 * 1024))} each.
                </>
              }
              accept={accept}
              multiple={fileModes.includes('photo_upload')}
              busy={uploading}
              disabled={photos && files.length >= photoCap}
              onFiles={(chosen) => void choose(chosen)}
            />
            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((f, i) => {
                  const kind = kindOfFile({ type: f.mimeType, name: f.url });
                  return (
                    <li key={f.url} className="flex items-center justify-between gap-2 text-base text-fg-2">
                      <span>
                        {kind === 'pdf_upload' ? 'PDF' : kind === 'docx_upload' ? 'Word document' : `Photo ${i + 1}`}
                        <span className="text-fg-4"> · uploaded</span>
                      </span>
                      <Button
                        size="small"
                        variant="tertiary"
                        onClick={() => setFiles((all) => all.filter((x) => x.url !== f.url))}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {allowLink && (
          <TextInput
            label={fileModes.length > 0 ? 'Or paste a link to your Google Doc' : 'Link to your Google Doc'}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            hint="Make sure your teacher can open it."
          />
        )}

        <TextArea
          label="A note for your teacher (optional)"
          dir="auto"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xxs text-fg-4">You can revise until the window closes.</p>
          <Button type="submit" variant="primary" disabled={busy || uploading} iconRight="ArrowUpRight">
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
      <div className="cl-soft">
        <div className="flex items-baseline gap-3 text-[15px]">
          <span>Mark:</span>
          <span className="num" style={{ color: 'var(--cl-ok)' }}>
            {submission.score ?? '—'}/{assessment.maxScore}
          </span>
          {percent !== null && <span className="num cl-muted">{percent}%</span>}
        </div>
        <p className="num cl-muted mt-1 text-[12.5px]">Returned {formatDateTime(submission.returnedAt)}</p>
        {submission.feedback && (
          <p dir="auto" className="mt-2 whitespace-pre-line text-[14px] leading-[1.55]">
            {submission.feedback}
          </p>
        )}
      </div>

      {/* Each file of the hand-in that carries marks, in order (`D-47`). `url`
          is the stored form marks anchor on; `readUrl` is where to actually
          fetch it from (`REM-030`). */}
      {[
        ...submission.files.map((f) => ({ url: f.url, readUrl: f.readUrl })),
        ...(submission.fileUrl
          ? [{ url: submission.fileUrl, readUrl: submission.fileReadUrl ?? submission.fileUrl }]
          : []),
      ]
        .filter(
          (doc) =>
            /\.(pdf|jpe?g|png|webp)$/i.test(doc.url) || submission.annotations.some((a) => a.fileUrl === doc.url),
        )
        .map((doc) => (
          <div key={doc.url} className="mt-4 border-t border-border-light pt-4">
            <MarkedCopy fileUrl={doc.url} readUrl={doc.readUrl} annotations={submission.annotations} />
          </div>
        ))}

      {submission.annotatedFileUrl && (
        <a
          href={mediaSrc(submission.annotatedFileUrl)}
          target="_blank"
          rel="noreferrer"
          className="cl-btns mt-4"
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
    <Panel title="Your earlier versions">
      <ul className="m-0 list-none p-0">
        {submission.revisions.map((revision) => (
          <li key={revision.id} className="flex items-start gap-3 py-3">
            <Icon name="History" size={14} className="mt-[2px] shrink-0 text-fg-4" />
            <div className="min-w-0 flex-1">
              <p className="num text-xs text-fg-2">Sent {formatDateTime(revision.submittedAt)}</p>
              <p className="num mt-1 text-xxs text-fg-4">
                Replaced {formatDateTime(revision.replacedAt)}
              </p>
              {revision.files.length > 0 && (
                <p className="mt-1 text-xxs text-fg-4">
                  {revision.files.length} file{revision.files.length === 1 ? '' : 's'}
                </p>
              )}
              {revision.fileUrl && (
                <a
                  href={mediaSrc(revision.fileUrl)}
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
