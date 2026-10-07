'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatRelative } from '@/lib/format';
import type { MarkbookCell, MarkbookStudent, MarkbookTask } from '@/lib/types';
import { Score, Select } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, ClTabs, PanelHead } from '@/components/classroom/ui';

/**
 * `/manage/marks` (`BOOK-2`): the mark book - every member of one group
 * against every task set for it, one group at a time. Redesign V2 "MARKS".
 *
 * - **Performance only.** Marks are `Score`s over their denominator; there is
 *   no completion bar anywhere on this screen (CLAUDE.md §11.1, rule 2).
 * - **A missing mark is an em-dash**, never `0`, said once in the footnote.
 * - Google Form columns are **mirrored** and say when they were last checked
 *   (`D-46`); the average covers only work marked here (`D-45`).
 * - The course and group pickers list only what the caller holds (`D-33`), and
 *   the server refuses anything else with the same 404 as a missing group.
 *
 * The artifact's "Group" column is not drawn: the book is one group at a time,
 * so the column would repeat the selected tab on every row.
 */
const TABS_MAX = 6;

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
  const groupList = groups.data ?? [];

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

  const mirrored = (data?.tasks ?? []).filter((t) => t.source === 'mirrored');
  const unmatched = mirrored.filter((t) => (t.unmatchedCount ?? 0) > 0);
  const cols = `minmax(170px,1.4fr) repeat(${data?.tasks.length ?? 0}, minmax(110px,1fr)) minmax(130px,1fr)`;
  const groupName = groupList.find((g) => g.id === groupId)?.name;

  return (
    <>
      <PageTitle title="Mark book" />
      <section aria-labelledby="mk-h" className="cl-panel">
        <PanelHead id="mk-h" title={groupName ? `Mark book · ${groupName}` : 'Mark book'}>
          <button type="button" className="cl-glink" disabled={!data || exporting} onClick={() => void exportCsv()}>
            <ClIcon name="download" small />
            {exporting ? 'Exporting' : 'Export'}
          </button>
        </PanelHead>

        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          {courseId && groupList.length > TABS_MAX && (
            <Select
              aria-label="Group"
              className="w-[220px]"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              options={[{ value: '', label: 'Choose a group' }, ...groupList.map((g) => ({ value: g.id, label: g.name }))]}
            />
          )}
        </div>
        {courseId && groupList.length > 0 && groupList.length <= TABS_MAX && (
          <ClTabs
            label="Group"
            className="mb-4"
            value={groupId}
            onChange={setGroupId}
            tabs={groupList.map((g) => ({ value: g.id, label: g.name }))}
          />
        )}
        {courses.error && <ClError message={courses.error.message} onRetry={courses.reload} />}
        {groups.error && <ClError message={groups.error.message} onRetry={groups.reload} />}
        {exportError && <ClError message={exportError} />}

        {!groupId && <ClEmpty icon="marks" tone="cl-tone-blue" title="Choose a course and a group" />}
        {groupId && book.loading && !data && <ClSkeleton rows={4} label="Loading the mark book" />}
        {book.error && <ClError message={book.error.message} onRetry={book.reload} />}
        {data && data.students.length === 0 && <ClEmpty icon="people" title="Nobody is in this group yet" />}
        {data && data.students.length > 0 && (
          <div className="overflow-x-auto">
            <div className="cl-gt" style={{ minWidth: 300 + data.tasks.length * 110 }}>
              <div className="hd" style={{ gridTemplateColumns: cols }}>
                <span>Student</span>
                {data.tasks.map((t) => (
                  <span key={t.assessmentId} className="r flex flex-col items-end" title={t.title}>
                    <span className="max-w-[140px] truncate">{t.title}</span>
                    <span className="cl-muted text-[12px]">
                      {t.maxScore !== null ? `/ ${t.maxScore}` : ''}
                      {t.source === 'mirrored' ? ' · Google Form' : ''}
                    </span>
                  </span>
                ))}
                <span className="r">Average of marked work</span>
              </div>
              {data.students.map((s) => (
                <div key={s.studentId} className="rw" style={{ gridTemplateColumns: cols }}>
                  <span dir="auto" className="truncate">
                    {s.name}
                  </span>
                  {data.tasks.map((t) => {
                    const c = cellFor(s, t);
                    return (
                      <span key={t.assessmentId} className="r inline-flex items-center justify-end gap-1">
                        <Score value={c?.score ?? null} of={c?.score != null ? c.maxScore : undefined} />
                        {c?.status === 'marked' && (
                          <span className="cl-muted text-[12px]" title="Saved, not yet returned to the student">
                            Not returned
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {/* A share, so a percentage - of performance, never of completion. */}
                  <span className="r">
                    {s.averagePercent === null ? <Score value={null} /> : <span className="num">{s.averagePercent}%</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data && (
          <div className="cl-muted mt-4 flex flex-col gap-1 px-2 text-[13px]">
            <p className="m-0">— means not marked yet. &ldquo;Not returned&rdquo; marks are saved but the student cannot see them yet.</p>
            <p className="m-0">The average covers only work marked here. Google Form scores are shown but not included.</p>
            {mirrored.map((t) => (
              <p key={t.assessmentId} className="m-0">
                {t.title}: copied from Google Forms,{' '}
                {t.lastSyncedAt ? `last checked ${formatRelative(t.lastSyncedAt)}` : 'never checked yet'}.
              </p>
            ))}
            {unmatched.map((t) => (
              <p key={`u-${t.assessmentId}`} className="m-0" style={{ color: 'var(--cl-warn)' }}>
                {t.title}: {t.unmatchedCount} response{t.unmatchedCount === 1 ? '' : 's'} matched no student, so
                some cells here may be understated.
              </p>
            ))}
            {data.omittedTasks.length > 0 && (
              <p className="m-0">
                {data.omittedTasks.length} link task{data.omittedTasks.length === 1 ? ' is' : 's are'} not shown: they
                have no mark.
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
