'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatRelative } from '@/lib/format';
import type { MarkbookCell, MarkbookStudent, MarkbookTask } from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Score,
  Select,
  Table,
  TableToolbar,
  Tag,
  type Column,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * `/manage/marks` (`BOOK-2`): the mark book - every member of one group
 * against every task set for it, one group at a time.
 *
 * - **Performance only.** Marks are `Score`s over their denominator; there is
 *   no completion bar anywhere on this screen (CLAUDE.md §11.1, rule 2).
 * - **A missing mark is an em-dash**, never `0`, said once in the footnote.
 * - Google Form columns are **mirrored** and say when they were last checked
 *   (`D-46`); the average covers only work marked here (`D-45`).
 * - The course and group pickers list only what the caller holds (`D-33`), and
 *   the server refuses anything else with the same 404 as a missing group.
 */
export default function MarksPage() {
  const { token } = useSession();
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const courses = useApi((t) => api.staff.courses(t), []);
  const groups = useApi(
    (t) => (courseId ? api.staff.courseGroups(t, courseId) : Promise.resolve([])),
    [courseId],
  );
  const book = useApi(
    (t) => (groupId ? api.staff.markbook(t, groupId) : Promise.resolve(null)),
    [groupId],
  );
  const data = book.data;

  const exportCsv = async () => {
    if (!token || !groupId) return;
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await api.staff.markbookCsv(token, groupId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename ?? 'markbook.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof ApiError ? cause.message : 'The export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const cellFor = (s: MarkbookStudent, t: MarkbookTask): MarkbookCell | undefined =>
    s.cells.find((c) => c.assessmentId === t.assessmentId);

  const columns: Column<MarkbookStudent>[] = [
    { label: 'Student', render: (s) => <span dir="auto">{s.name}</span> },
    ...(data?.tasks ?? []).map(
      (t): Column<MarkbookStudent> => ({
        label: (
          <span className="flex flex-col items-end gap-0.5">
            <span className="max-w-[160px] truncate" title={t.title}>
              {t.title}
            </span>
            <span className="text-fg-4">
              {t.maxScore !== null ? `/${t.maxScore}` : ''}
              {t.source === 'mirrored' ? ' · Google Form' : ''}
            </span>
          </span>
        ),
        align: 'end',
        render: (s) => {
          const c = cellFor(s, t);
          return (
            <span className="inline-flex items-center gap-1">
              <Score value={c?.score ?? null} of={c?.score != null ? c.maxScore : undefined} />
              {c?.status === 'marked' && <Tag tone="blue">Not returned</Tag>}
            </span>
          );
        },
      }),
    ),
    {
      label: 'Average of marked work',
      align: 'end',
      // A share, so a percentage - of performance, never of completion.
      render: (s) =>
        s.averagePercent === null ? <Score value={null} /> : <span className="num">{s.averagePercent}%</span>,
    },
  ];

  const mirrored = (data?.tasks ?? []).filter((t) => t.source === 'mirrored');
  const unmatched = mirrored.filter((t) => (t.unmatchedCount ?? 0) > 0);

  return (
    <>
      <PageTitle title="Mark book" />
      <div className="flex flex-col gap-4 p-6">
        <Panel padded={false}>
          <TableToolbar
            filters={
              <>
                <Select
                  aria-label="Course"
                  className="w-[220px]"
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setGroupId('');
                  }}
                  options={[
                    { value: '', label: 'Choose a course' },
                    ...(courses.data ?? []).map((c) => ({ value: c.id, label: c.title })),
                  ]}
                />
                <Select
                  aria-label="Group"
                  className="w-[220px]"
                  value={groupId}
                  disabled={!courseId}
                  onChange={(e) => setGroupId(e.target.value)}
                  options={[
                    { value: '', label: 'Choose a group' },
                    ...(groups.data ?? []).map((g) => ({ value: g.id, label: g.name })),
                  ]}
                />
              </>
            }
            actions={
              <Button icon="FileText" disabled={!data || exporting} onClick={() => void exportCsv()}>
                {exporting ? 'Exporting' : 'Export CSV'}
              </Button>
            }
          />
          {exportError && (
            <div className="p-2">
              <InlineBanner tone="danger" icon="AlertTriangle">
                {exportError}
              </InlineBanner>
            </div>
          )}
          {!groupId && <EmptyState icon="Table" title="Choose a course and a group" />}
          {groupId && book.loading && !data && (
            <div className="flex justify-center p-8">
              <Loader label="Loading the mark book" />
            </div>
          )}
          {book.error && (
            <EmptyState icon="AlertTriangle" title={book.error.message} action={<Button onClick={book.reload}>Try again</Button>} />
          )}
          {data && (
            <Table
              stickyFirstColumn
              columns={columns}
              rows={data.students}
              rowKey={(s) => s.studentId}
              empty={<EmptyState icon="Users" title="Nobody is in this group yet" />}
            />
          )}
        </Panel>
        {data && (
          <div className="flex flex-col gap-1 text-xs text-fg-4">
            <p>— means not marked yet. &ldquo;Not returned&rdquo; marks are saved but the student cannot see them yet.</p>
            <p>The average covers only work marked here. Google Form scores are shown but not included.</p>
            {mirrored.map((t) => (
              <p key={t.assessmentId}>
                {t.title}: copied from Google Forms,{' '}
                {t.lastSyncedAt ? `last checked ${formatRelative(t.lastSyncedAt)}` : 'never checked yet'}.
              </p>
            ))}
            {unmatched.map((t) => (
              <p key={`u-${t.assessmentId}`} className="text-status-amber-text">
                {t.title}: {t.unmatchedCount} response{t.unmatchedCount === 1 ? '' : 's'} matched no student, so
                some cells here may be understated.
              </p>
            ))}
            {data.omittedTasks.length > 0 && (
              <p>
                {data.omittedTasks.length} link task{data.omittedTasks.length === 1 ? ' is' : 's are'} not shown: they
                have no mark.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
