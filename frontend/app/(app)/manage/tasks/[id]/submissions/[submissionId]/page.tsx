'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { Annotation, AnnotationKind } from '@/lib/types';
import {
  Button,
  ButtonGroup,
  Callout,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Tag,
  TextArea,
  TextInput,
  cx,
  type IconName,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { MarkingSurface, type NewMark, type Tool } from '@/components/marking/marking-surface';

const TOOLS: { tool: Tool; label: string; icon?: IconName }[] = [
  { tool: 'select', label: 'Select' },
  { tool: 'tick', label: 'Tick', icon: 'Check' },
  { tool: 'cross', label: 'Cross', icon: 'X' },
  { tool: 'comment', label: 'Comment', icon: 'Message' },
  { tool: 'pen', label: 'Pen', icon: 'Pencil' },
  { tool: 'highlight', label: 'Highlight', icon: 'Edit' },
  { tool: 'eraser', label: 'Eraser', icon: 'TrashX' },
];

const KIND_LABEL: Record<AnnotationKind, string> = {
  comment: 'Comment',
  tick: 'Tick',
  cross: 'Cross',
  pen: 'Pen stroke',
  highlight: 'Highlight',
};

function message(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : 'Something went wrong. Please try again.';
}

/**
 * The marking view (`MARK-4`, `MARK-5`): the student's original, untouched,
 * with the marks drawn over it as data (`D-2`) - never a flattened file.
 *
 * - Every pin and stroke is saved as it is drawn; nothing important is held
 *   only in the browser.
 * - **Save** and **Save and return** are two operations (`MARK-2`): Save
 *   stores the mark; Return is what lets the student see it. If the return
 *   fails after the save, the screen says the work is saved but not returned.
 * - The eraser removes the caller's own marks only (`D-42` (a)).
 * - Marking up a returned paper is allowed and audited (`D-42` (b)); the
 *   student sees the change at once, and the screen says so.
 *
 * Loaded from the per-task queue (A-14), which also gives previous and next.
 */
export default function MarkingPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = use(params);
  // Keyed by the paper: moving to the next student must start clean - no
  // typed mark, unsaved stroke or page number carried over from the last one
  // (review R-1), whether or not the router reuses this component.
  return <MarkingView key={submissionId} id={id} submissionId={submissionId} />;
}

function MarkingView({ id, submissionId }: { id: string; submissionId: string }) {
  const { token, user } = useSession();
  const queue = useApi((t) => api.staff.taskSubmissions(t, id), [id]);
  const listed = useApi((t) => api.staff.annotations.list(t, submissionId), [submissionId]);

  // Local additions and removals on top of the server list, so a saved mark
  // shows at once without a reload.
  const [added, setAdded] = useState<Annotation[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>('select');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [markError, setMarkError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const [score, setScore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState<'save' | 'return' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const data = queue.data;
  const row = data?.rows.find((r) => r.submissionId === submissionId) ?? null;
  // A hand-in may be several files (`D-47`: up to five photos); one at a time.
  const [docIndex, setDocIndex] = useState(0);
  const docs = row?.documents ?? [];
  const doc = docs[Math.min(docIndex, Math.max(docs.length - 1, 0))] ?? null;

  const annotations = useMemo(
    () => [...(listed.data ?? []), ...added].filter((a) => !removed.has(a.id)),
    [listed.data, added, removed],
  );
  const onPaper = annotations.filter((a) => a.fileUrl === doc?.url);
  const onPage = onPaper.filter((a) => a.page === page);
  const comments = onPaper.filter((a) => a.kind === 'comment');
  const numberOf = (aid: string) => {
    const i = comments.findIndex((c) => c.id === aid);
    return i === -1 ? undefined : i + 1;
  };

  const withSubmission = (data?.rows ?? []).filter((r) => r.submissionId);
  const at = withSubmission.findIndex((r) => r.submissionId === submissionId);
  const prev = at > 0 ? withSubmission[at - 1] : null;
  const next = at >= 0 && at < withSubmission.length - 1 ? withSubmission[at + 1] : null;

  const scoreText = score ?? (row?.score != null ? String(row.score) : '');
  const feedbackText = feedback ?? row?.feedback ?? '';
  const scoreValue = Number(scoreText);
  const scoreValid =
    scoreText.trim() !== '' && Number.isInteger(scoreValue) && scoreValue >= 0 && scoreValue <= (data?.maxScore ?? 0);

  const create = async (mark: NewMark): Promise<boolean> => {
    if (!token || !doc) return false;
    setMarkError(null);
    try {
      const saved = await api.staff.annotations.create(token, submissionId, { ...mark, fileUrl: doc.url });
      setAdded((a) => [...a, saved]);
      return true;
    } catch (cause) {
      setMarkError(`That mark was not saved: ${message(cause)}`);
      return false;
    }
  };

  const erase = async (mark: { id: string }): Promise<void> => {
    if (!token) return;
    setMarkError(null);
    try {
      await api.staff.annotations.remove(token, submissionId, mark.id);
      setRemoved((r) => new Set(r).add(mark.id));
    } catch (cause) {
      setMarkError(
        cause instanceof ApiError && cause.status === 403
          ? 'You can only erase your own marks.'
          : `That mark was not erased: ${message(cause)}`,
      );
    }
  };

  const save = async (andReturn: boolean) => {
    if (!token || !scoreValid) return;
    setSaving(andReturn ? 'return' : 'save');
    setSaveError(null);
    setNotice(null);
    try {
      await api.staff.grade(token, submissionId, { score: scoreValue, feedback: feedbackText || undefined });
    } catch (cause) {
      setSaveError(`The mark was not saved: ${message(cause)}`);
      setSaving(null);
      return;
    }
    if (andReturn) {
      try {
        await api.staff.returnSubmission(token, submissionId);
        setNotice('Saved and returned. The student can see the mark now.');
      } catch (cause) {
        // Two operations: the mark is saved even though the return failed.
        setSaveError(`Saved, but not returned: ${message(cause)} The student cannot see it yet.`);
      }
    } else {
      setNotice(
        row?.returnedAt
          ? 'Saved. This work is already returned, so the student sees the change now.'
          : 'Saved. The student will see it when you return it.',
      );
    }
    setSaving(null);
    setScore(null);
    setFeedback(null);
    queue.reload();
  };

  return (
    <>
      <PageTitle title={row ? row.studentName : 'Marking'} backHref={`/manage/tasks/${id}/submissions`} />
      <div className="flex flex-col gap-4 p-6">
        {(queue.loading || listed.loading) && !row && (
          <div className="flex justify-center p-8">
            <Loader label="Loading the paper" />
          </div>
        )}
        {(queue.error || listed.error) && (
          <EmptyState
            icon="AlertTriangle"
            title={(queue.error ?? listed.error)!.message}
            action={
              <Button
                onClick={() => {
                  queue.reload();
                  listed.reload();
                }}
              >
                Try again
              </Button>
            }
          />
        )}
        {data && !row && !queue.loading && <EmptyState icon="ListDetails" title="Submission not found" />}
        {data && row && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base text-fg-3">
                <span dir="auto" className="text-fg">
                  {row.studentName}
                </span>{' '}
                · {row.groupName} · handed in {row.lastSubmittedAt ? formatDateTime(row.lastSubmittedAt) : '—'}
                {row.isLate && (
                  <>
                    {' '}
                    <Tag tone="amber">Late</Tag>
                  </>
                )}
              </p>
              <div className="flex gap-2">
                {prev && (
                  <Link href={`/manage/tasks/${id}/submissions/${prev.submissionId}`} className="text-base text-accent">
                    Previous student
                  </Link>
                )}
                {next && (
                  <Link href={`/manage/tasks/${id}/submissions/${next.submissionId}`} className="text-base text-accent">
                    Next student
                  </Link>
                )}
              </div>
            </div>

            {row.staleAnnotationCount > 0 && (
              <InlineBanner tone="amber" icon="History">
                The student resubmitted after marking began. {row.staleAnnotationCount} mark
                {row.staleAnnotationCount === 1 ? ' is' : 's are'} on the previous version and kept.
              </InlineBanner>
            )}
            {row.returnedAt && (
              <InlineBanner tone="blue" icon="InfoCircle">
                Returned {formatDateTime(row.returnedAt)}. Changes you make now are visible to the student at once.
              </InlineBanner>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel
                title="The student's work"
                action={
                  doc?.annotatable ? (
                    <ButtonGroup aria-label="Marking tools">
                      {TOOLS.map((t) => (
                        <Button
                          key={t.tool}
                          size="small"
                          variant="tertiary"
                          icon={t.icon}
                          active={tool === t.tool}
                          onClick={() => setTool(t.tool)}
                        >
                          {t.label}
                        </Button>
                      ))}
                    </ButtonGroup>
                  ) : undefined
                }
              >
                <div className="flex flex-col gap-3">
                  {markError && (
                    <InlineBanner tone="danger" icon="AlertTriangle">
                      {markError}
                    </InlineBanner>
                  )}
                  {docs.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Files in this hand-in">
                      {docs.map((d, i) => (
                        <Button
                          key={d.url}
                          size="small"
                          variant="tertiary"
                          active={doc?.url === d.url}
                          onClick={() => {
                            setDocIndex(i);
                            setPage(1);
                          }}
                        >
                          {d.kind === 'image' ? `Photo ${i + 1}` : d.kind === 'pdf' ? 'PDF' : `File ${i + 1}`}
                          <span className="num text-fg-4">
                            {' '}
                            {annotations.filter((a) => a.fileUrl === d.url).length}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                  {doc ? (
                    <MarkingSurface
                      key={doc.url}
                      doc={doc}
                      page={page}
                      onPageCount={setPageCount}
                      marks={onPage}
                      tool={tool}
                      canErase={(m) => onPage.some((a) => a.id === m.id && a.createdBy === user?.id)}
                      onCreate={create}
                      onErase={erase}
                      numberOf={numberOf}
                      highlightId={focused}
                    />
                  ) : (
                    <Callout tone="neutral" title="No file was handed in">
                      Only a typed answer, below.
                    </Callout>
                  )}
                  {pageCount > 1 && (
                    <div className="flex items-center justify-center gap-3">
                      <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        Previous page
                      </Button>
                      <span className="num text-base text-fg-3">
                        Page {page}
                        <span className="text-fg-4">/{pageCount}</span>
                      </span>
                      <Button size="small" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                        Next page
                      </Button>
                    </div>
                  )}
                  {row.answerText && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-fg-4">Typed answer</span>
                      {/* Text, never HTML (SECURITY.md §2.5). */}
                      <p dir="auto" className="whitespace-pre-wrap text-base text-fg">
                        {row.answerText}
                      </p>
                    </div>
                  )}
                </div>
              </Panel>

              <div className="flex flex-col gap-4">
                <Panel title="Mark and feedback">
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save(false);
                    }}
                  >
                    <TextInput
                      label="Mark"
                      inputMode="numeric"
                      value={scoreText}
                      onChange={(e) => setScore(e.target.value)}
                      suffix={<span className="num text-fg-4">/{data.maxScore}</span>}
                      error={scoreText.trim() !== '' && !scoreValid ? `A whole number from 0 to ${data.maxScore}` : null}
                    />
                    <TextArea
                      label="Feedback"
                      dir="auto"
                      rows={5}
                      maxLength={4000}
                      value={feedbackText}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                    {saveError && (
                      <InlineBanner tone="danger" icon="AlertTriangle">
                        {saveError}
                      </InlineBanner>
                    )}
                    {notice && (
                      <InlineBanner tone="green" icon="CircleCheck">
                        {notice}
                      </InlineBanner>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.returnedAt ? (
                        // Already returned: a re-grade is visible at once (A-4),
                        // so there is one action, and nothing left to return.
                        <Button type="submit" variant="primary" disabled={!scoreValid || saving !== null}>
                          {saving === 'save' ? 'Saving' : 'Save'}
                        </Button>
                      ) : (
                        <>
                          <Button type="submit" disabled={!scoreValid || saving !== null}>
                            {saving === 'save' ? 'Saving' : 'Save'}
                          </Button>
                          <Button
                            variant="primary"
                            disabled={!scoreValid || saving !== null}
                            onClick={() => void save(true)}
                          >
                            {saving === 'return' ? 'Returning' : 'Save and return'}
                          </Button>
                        </>
                      )}
                    </div>
                  </form>
                </Panel>

                <Panel title={`Marks on this paper (${onPaper.length})`} padded={false}>
                  {onPaper.length === 0 ? (
                    <p className="p-3 text-base text-fg-4">No marks yet.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {onPaper
                        .slice()
                        .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt))
                        .map((a) => (
                          <li
                            key={a.id}
                            onMouseEnter={() => setFocused(a.id)}
                            onMouseLeave={() => setFocused(null)}
                            className={cx(
                              'flex items-start justify-between gap-2 border-b border-border-light p-2',
                              focused === a.id && 'bg-surface-2',
                            )}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-col items-start text-start"
                              onClick={() => setPage(a.page)}
                            >
                              <span className="text-base text-fg">
                                {a.kind === 'comment' ? `${numberOf(a.id)}. ` : ''}
                                {KIND_LABEL[a.kind]}
                                <span className="text-fg-4"> · page {a.page}</span>
                              </span>
                              {a.kind === 'comment' && (
                                <span dir="auto" className="break-words text-base text-fg-2">
                                  {a.text}
                                </span>
                              )}
                              <span className="text-xs text-fg-4">{a.createdByName}</span>
                            </button>
                            {a.createdBy === user?.id && (
                              <Button size="small" variant="tertiary" onClick={() => void erase(a)}>
                                Erase
                              </Button>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
