'use client';

import React, { use, useState, useMemo } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatRelative } from '@/lib/format';
import type { 
  StaffTask, 
  StudentWorkRow, 
  ExternalResult,
  WorkStatus,
  CourseRosterResponse
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
            <div className="flex items-center gap-4">
              <SyncStatus state={syncState} lastSynced={analytics.lastSyncedAt ? formatRelative(analytics.lastSyncedAt) : undefined} />
              <Button onClick={handleSync} variant="primary" disabled={syncing}>Sync now</Button>
            </div>
          </div>
          
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
      
      {analytics.unmatched > 0 && (
        <UnmatchedPanel unmatched={unmatched} roster={roster} onMatch={handleReload} />
      )}
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
                <RawDataView raw={result.raw} />
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
