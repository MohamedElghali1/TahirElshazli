'use client';

import React, { use, useState, useMemo, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatRelative } from '@/lib/format';
import type {
  StaffTask,
  StudentWorkRow,
  ExternalResult,
  WorkStatus,
  CourseRosterResponse,
  ImportResultsPreview,
  QuestionAnalytics
} from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Tag,
  Select,
  type TagTone,
  Meter,
  Score,
  SyncStatus,
  Table,
  type Column
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/** One raw answer, as the CSV importer and the live sync both write it (`D-60`). */
interface RawAnswer {
  questionId: string;
  values: string[];
  score: number | null;
  correct: boolean | null;
}

interface RawQuestionMeta {
  id: string;
  title: string;
}

interface AnsweredRaw {
  answers: RawAnswer[];
  questions?: RawQuestionMeta[];
  source?: string;
}

/** Narrows `ExternalResult.raw` to the shape the Individual view needs. */
function isAnsweredRaw(raw: unknown): raw is AnsweredRaw {
  return (
    !!raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { answers?: unknown }).answers)
  );
}

const WORK_STATUS: Record<WorkStatus, { label: string; tone: TagTone }> = {
  not_available: { label: 'Not available', tone: 'gray' },
  not_started: { label: 'Not started', tone: 'gray' },
  submitted: { label: 'Submitted', tone: 'amber' },
  graded: { label: 'Graded', tone: 'green' },
};

export default function TaskResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: tasks, error, loading, reload } = useApi((t) => api.staff.tasks(t), []);
  const task = tasks?.find((t) => t.id === id) ?? null;

  return (
    <>
      <PageTitle title={task?.title ?? 'Results'} backHref="/manage/tasks" />
      <div className="flex flex-col gap-4 p-6">
        {loading && !tasks && (
          <div className="flex justify-center p-8">
            <Loader label="Loading task" />
          </div>
        )}
        {error && (
          <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />
        )}
        {tasks && !task && <EmptyState icon="ListDetails" title="Task not found" />}
        
        {task && task.workType !== 'google_form' && (
          <EmptyState icon="ListDetails" title="No form results" description="This task does not use a Google Form." />
        )}
        
        {task && task.workType === 'google_form' && (
          <GoogleFormResults task={task} />
        )}
      </div>
    </>
  );
}

function GoogleFormResults({ task }: { task: StaffTask }) {
  const { token } = useSession();

  const analyticsQuery = useApi((t) => api.staff.workAnalytics(t, task.id), [task.id]);
  const resultsQuery = useApi((t) => api.staff.workResults(t, task.id), [task.id]);
  const unmatchedQuery = useApi((t) => api.staff.workUnmatched(t, task.id), [task.id]);
  const rosterQuery = useApi((t) => api.staff.roster(t, task.courseId), [task.courseId]);

  const [syncing, setSyncing] = useState(false);

  // A Google Form task is either bound live to the Forms API (`googleForm`
  // given at authoring time) or CSV-only (`D-60`): the two differ in exactly
  // one place a frontend read can see — a live-bound task resolves its
  // address against Google and never stores it as `externalUrl`, while a
  // CSV-only task stores the responder link there (`assessment-authoring
  // .service.ts`'s `externalUrl` write, see T8 report). "Sync now" talks to
  // an API this task may not have.
  const hasApiBinding = task.workType === 'google_form' && task.externalUrl === null;

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportResultsPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The Individual view for a matched student (`D-60`/`T8`): fetched on
  // click from the row's `resultId`, not pre-loaded for every row — the same
  // "nobody has clicked it yet" reasoning `GET /staff/results/:resultId`'s
  // own comment gives for keeping it off the roster read.
  const [viewing, setViewing] = useState<{ studentName: string; result: ExternalResult } | null>(null);
  const [viewingBusy, setViewingBusy] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);

  async function handleViewResult(studentName: string, resultId: string) {
    if (!token) return;
    setViewingBusy(true);
    setViewingError(null);
    try {
      const result = await api.staff.result(token, resultId);
      setViewing({ studentName, result });
    } catch (e) {
      setViewingError(e instanceof ApiError ? e.message : 'Could not load that response.');
    } finally {
      setViewingBusy(false);
    }
  }

  const handleReload = () => {
    analyticsQuery.reload();
    resultsQuery.reload();
    unmatchedQuery.reload();
  };

  async function handleSync() {
    if (!token) return;
    try {
      setSyncing(true);
      await api.staff.workSync(token, task.id);
      handleReload();
    } catch {
      handleReload(); // Reload to pick up any broken state if sync fails
    } finally {
      setSyncing(false);
    }
  }

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be re-picked after Cancel
    if (!file || !token) return;
    setImportFile(file);
    setImportPreview(null);
    setImportError(null);
    setImportBusy(true);
    try {
      const preview = (await api.staff.importResults(token, task.id, file, {
        dryRun: true,
      })) as ImportResultsPreview;
      setImportPreview(preview);
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : 'Could not read that file.');
      setImportFile(null);
    } finally {
      setImportBusy(false);
    }
  }

  async function handleConfirmImport() {
    if (!token || !importFile) return;
    setImportBusy(true);
    setImportError(null);
    try {
      await api.staff.importResults(token, task.id, importFile, { dryRun: false });
      setImportPreview(null);
      setImportFile(null);
      handleReload();
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : 'Import failed.');
    } finally {
      setImportBusy(false);
    }
  }

  function handleCancelImport() {
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
  }

  if (analyticsQuery.loading && !analyticsQuery.data) {
    return <div className="flex justify-center p-8"><Loader label="Loading results" /></div>;
  }
  
  if (analyticsQuery.error && !analyticsQuery.data) {
    return <EmptyState icon="AlertTriangle" title={analyticsQuery.error.message} action={<Button onClick={handleReload}>Try again</Button>} />;
  }

  const analytics = analyticsQuery.data;
  if (!analytics) return null;

  const results = resultsQuery.data ?? [];
  const unmatched = unmatchedQuery.data ?? [];
  const roster = rosterQuery.data ?? null;

  const syncState = syncing ? 'syncing' : (analytics.lastSyncError ? 'broken' : 'ok');

  const RESULT_COLUMNS: Column<StudentWorkRow>[] = [
    {
      label: 'Student',
      render: (r) => <span className="font-medium text-fg">{r.studentName}</span>
    },
    {
      label: 'Status',
      render: (r) => <Tag tone={WORK_STATUS[r.status].tone}>{WORK_STATUS[r.status].label}</Tag>
    },
    {
      label: 'Score',
      render: (r) => <Score value={r.score} of={r.maxScore} />
    },
    {
      label: 'Submitted',
      render: (r) => <span className="text-fg-2">{r.submittedAt ? formatDate(r.submittedAt) : '—'}</span>
    },
    {
      render: (r) =>
        r.resultId ? (
          <Button
            variant="tertiary"
            disabled={viewingBusy}
            onClick={() => handleViewResult(r.studentName, r.resultId!)}
          >
            View
          </Button>
        ) : null
    }
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Summary">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-6 text-base text-fg">
              <div className="flex flex-col">
                <span className="text-xs text-fg-3">Expected</span>
                <span className="font-medium">{analytics.expected}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-fg-3">Completed</span>
                <span className="font-medium">{analytics.completed}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-fg-3">Not completed</span>
                <span className="font-medium">{analytics.notCompleted}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {hasApiBinding && (
                  <>
                    <SyncStatus state={syncState} lastSynced={analytics.lastSyncedAt ? formatRelative(analytics.lastSyncedAt) : undefined} />
                    <Button onClick={handleSync} variant="primary" disabled={syncing}>Sync now</Button>
                  </>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  accept=".csv,text/csv"
                  onChange={handleFilePicked}
                />
                <Button
                  icon="Upload"
                  variant={hasApiBinding ? 'secondary' : 'primary'}
                  disabled={importBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  {importBusy ? 'Reading…' : 'Import responses (CSV)'}
                </Button>
              </div>
              <span className="text-xs text-fg-4">
                In Google Forms: Responses → Download responses (.csv).
              </span>
            </div>
          </div>

          {importError && <InlineBanner tone="danger">{importError}</InlineBanner>}

          {importPreview && (
            <div className="flex flex-col gap-3 border-t border-border-light pt-4 mt-2">
              <div className="flex flex-wrap gap-6 text-base text-fg">
                <div className="flex flex-col">
                  <span className="text-xs text-fg-3">Rows</span>
                  <span className="font-medium">{importPreview.rows}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-fg-3">Matched</span>
                  <span className="font-medium">{importPreview.matched}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-fg-3">Unmatched</span>
                  <span className="font-medium">{importPreview.unmatched}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-fg-3">Questions</span>
                  <span className="font-medium">{importPreview.questions}</span>
                </div>
              </div>
              {importPreview.errors.length > 0 && (
                <InlineBanner tone="amber">
                  <div className="flex flex-col gap-1 py-1">
                    {importPreview.errors.map((line, i) => (
                      <span key={i}>{line}</span>
                    ))}
                  </div>
                </InlineBanner>
              )}
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={handleConfirmImport} disabled={importBusy}>
                  {importBusy ? 'Importing…' : 'Import'}
                </Button>
                <Button variant="tertiary" onClick={handleCancelImport} disabled={importBusy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-8 border-t border-border-light pt-4 mt-2">
            <div className="flex-1 max-w-sm">
              <div className="mb-2 text-sm font-medium text-fg-2">Completion</div>
              <Meter value={analytics.completionRate ?? 0} name="Completion" width={200} />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-fg-2">Average Score</div>
              <Score value={analytics.averageScore} of={analytics.averageMaxScore} />
            </div>
          </div>
          
          {analytics.unmatched > 0 && (
            <InlineBanner tone="amber" className="mt-2">
              {analytics.unmatched} response(s) could not be attributed — every completion figure above is understated.
            </InlineBanner>
          )}

          <div className="flex flex-col gap-4 border-t border-border-light pt-4 mt-2">
            <div className="text-sm font-medium text-fg-2">Responses by question</div>
            {analytics.questions.length === 0 ? (
              <EmptyState
                icon="ChartPie"
                title="No per-question data yet."
                description="Import the responses CSV to see answers by question."
              />
            ) : (
              analytics.questions.map((q) => <QuestionSummary key={q.id} question={q} />)
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Results">
        <Table
          columns={RESULT_COLUMNS}
          rows={results}
          rowKey={(r) => r.studentId}
          empty={<EmptyState icon="Users" title="No results" />}
        />
      </Panel>

      {viewingError && <InlineBanner tone="danger">{viewingError}</InlineBanner>}

      {viewing && (
        <Panel
          title={viewing.studentName}
          action={<Button variant="tertiary" onClick={() => setViewing(null)}>Close</Button>}
        >
          {isAnsweredRaw(viewing.result.raw) ? (
            <IndividualResponseView
              raw={viewing.result.raw}
              score={viewing.result.score}
              maxScore={viewing.result.maxScore}
            />
          ) : (
            <RawDataView raw={viewing.result.raw} />
          )}
        </Panel>
      )}

      {analytics.unmatched > 0 && (
        <UnmatchedPanel unmatched={unmatched} roster={roster} onMatch={handleReload} />
      )}
    </div>
  );
}

/**
 * One question's answer distribution (Google Forms' "Summary" view, `D-60`).
 * A distribution of raw text answers, not a completion rate and not a mark —
 * the bar fill is a neutral tone on purpose, never the accent (reserved for
 * the one action on a screen) or a status colour.
 */
function QuestionSummary({ question }: { question: QuestionAnalytics }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-fg">{question.title}</span>
        <span className="text-xs text-fg-3">{question.answered} response(s)</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {question.distribution.map((entry) => (
          <div key={entry.value} className="flex items-center gap-2">
            <span dir="auto" className="min-w-[120px] max-w-[260px] flex-1 break-words text-sm text-fg-2">
              {entry.value || '—'}
            </span>
            <span
              role="img"
              aria-label={`${entry.count} of ${question.answered}`}
              className="h-1.5 w-[160px] shrink-0 overflow-hidden rounded-full bg-wash-track"
            >
              <span
                className="block h-full rounded-full bg-fg-4"
                style={{
                  width: `${question.answered > 0 ? Math.round((entry.count / question.answered) * 100) : 0}%`,
                }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-xs text-fg-3">{entry.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnmatchedPanel({
  unmatched, 
  roster, 
  onMatch 
}: { 
  unmatched: ExternalResult[]; 
  roster: CourseRosterResponse | null;
  onMatch: () => void;
}) {
  const { token } = useSession();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  if (unmatched.length === 0) return null;

  return (
    <Panel title="Unmatched responses">
      <div className="flex flex-col divide-y divide-border-light">
        {unmatched.map(result => (
          <div key={result.id} className="flex flex-col p-4 gap-4 hover:bg-surface-2 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <div className="text-fg-3 text-xs mb-1">Respondent</div>
                  <div className="text-fg font-medium">{result.respondentId || 'Unknown'}</div>
                </div>
                <div>
                  <div className="text-fg-3 text-xs mb-1">Submitted</div>
                  <div className="text-fg-2">{formatDate(result.submittedAt)}</div>
                </div>
                <div>
                  <div className="text-fg-3 text-xs mb-1">Score</div>
                  <Score value={result.score} of={result.maxScore} />
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <MatchRow result={result} roster={roster} onMatched={onMatch} token={token} />
                <Button 
                  variant="tertiary" 
                  onClick={() => setExpandedId(expandedId === result.id ? null : result.id)}
                >
                  {expandedId === result.id ? 'Hide' : 'View'}
                </Button>
              </div>
            </div>
            
            {expandedId === result.id && (
              <div className="bg-surface-2 rounded-md p-4 text-xs mt-2 border border-border-light">
                {isAnsweredRaw(result.raw) ? (
                  <IndividualResponseView
                    raw={result.raw}
                    score={result.score}
                    maxScore={result.maxScore}
                  />
                ) : (
                  <RawDataView raw={result.raw} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MatchRow({ 
  result, 
  roster, 
  onMatched, 
  token 
}: { 
  result: ExternalResult; 
  roster: CourseRosterResponse | null; 
  onMatched: () => void; 
  token: string | null; 
}) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const opts = [{ value: '', label: 'Select student...' }];
    if (roster) {
      opts.push(...roster.entries.map(e => ({
        value: e.studentId,
        label: `${e.name} — ${e.email}`
      })));
    }
    return opts;
  }, [roster]);

  async function handleMatch() {
    if (!token || !selectedStudentId) return;
    try {
      setBusy(true);
      setError(null);
      await api.staff.attachResult(token, result.id, selectedStudentId);
      onMatched();
      setSelectedStudentId('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not match.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-[300px]">
      <div className="flex items-center justify-end gap-2">
        <Select
          aria-label="Match to student"
          className="w-full flex-1"
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
          options={options}
          disabled={busy}
        />
        <Button 
          variant="primary" 
          onClick={handleMatch} 
          disabled={!selectedStudentId || busy}
        >
          {busy ? 'Matching…' : 'Match'}
        </Button>
      </div>
      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
    </div>
  );
}

function RawDataView({ raw }: { raw: unknown }) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 m-0">
        {Object.entries(raw as Record<string, unknown>).map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="font-medium text-fg-2">{k}</dt>
            <dd className="text-fg break-all m-0">{String(v)}</dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }
  return <pre className="font-mono text-fg-3 overflow-x-auto whitespace-pre-wrap m-0">{JSON.stringify(raw, null, 2)}</pre>;
}

/**
 * One response, Google Forms' "Individual" view (`D-60`): every answer under
 * the question's own title, and the total as a mark over its denominator —
 * never a bare percentage, and never `0` for a response that was never
 * scored (`Score` already renders that as an em-dash).
 */
function IndividualResponseView({
  raw,
  score,
  maxScore,
}: {
  raw: AnsweredRaw;
  score: number | null;
  maxScore: number | null;
}) {
  const titleFor = (questionId: string) =>
    raw.questions?.find((q) => q.id === questionId)?.title ?? questionId;

  return (
    <div className="flex flex-col gap-3 text-base">
      <div className="flex items-center justify-between gap-2 border-b border-border-light pb-2">
        <span className="text-sm font-medium text-fg-2">Total</span>
        <Score value={score} of={maxScore} />
      </div>
      {raw.answers.map((answer) => (
        <div key={answer.questionId} className="flex flex-col gap-0.5">
          <div className="text-xs font-medium text-fg-3">{titleFor(answer.questionId)}</div>
          <div dir="auto" className="break-words text-sm text-fg">
            {answer.values.join(', ') || '—'}
          </div>
        </div>
      ))}
    </div>
  );
}
