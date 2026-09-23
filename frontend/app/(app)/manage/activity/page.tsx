'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { AuditAction, AuditLogEntry } from '@/lib/types';
import { Button, EmptyState, InlineBanner, Loader, Table, Tag, type Column, type TagTone } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * The activity log - CLAUDE.md §5.4's actual ask: the teacher must be able to
 * see which assistant did what.
 *
 * Append-only and admin-only. The repository interface has no update and no
 * delete, so there is nothing this screen could offer to edit history with.
 *
 * Paging is keyset, not offset: the log only ever grows, and an offset page-2
 * read repeats rows the moment anything is written between requests.
 */
const ACTION_LABEL: Record<AuditAction, string> = {
  'course_staff.assigned': 'assigned an assistant',
  'course_staff.unassigned': 'removed an assistant',
  'submission.graded': 'graded a submission',
  'recording.created': 'published a recording',
  'recording.updated': 'edited a recording',
  'recording.deleted': 'deleted a recording',
  'live_session.scheduled': 'scheduled a session',
  'live_session.updated': 'moved a session',
  'live_session.cancelled': 'cancelled a session',
  'announcement.posted': 'posted an announcement',
  'group.created': 'created a group',
  'group.renamed': 'renamed a group',
  'group.course_added': 'enrolled a group in a course',
  'group.course_removed': 'removed a group from a course',
  'group.student_assigned': 'placed a student in a group',
  'group.student_removed': 'removed a student from a group',
  'assessment.created': 'created work',
  'assessment.updated': 'edited work',
  'assessment.targeted': 'changed which groups work is set for',
  'assessment.deleted': 'deleted work',
  'external_result.attached': 'attached an external result',
  'google.connected': 'connected a Google account',
  'google.disconnected': 'disconnected a Google account',
  'blog_post.created': 'wrote an achievement post',
  'blog_post.updated': 'edited an achievement post',
  'blog_post.media_set': 'changed a post gallery',
  'blog_post.deleted': 'deleted an achievement post',
  'student.accepted': 'accepted a registration',
  'student.rejected': 'rejected a registration',
  'student.updated': 'edited a student',
  'student.created': 'created a student',
  'assistant.invited': 'invited an assistant',
  'assistant.invitation_accepted': 'accepted an invitation',
  'assistant.invitation_resent': 'resent an invitation',
  'assistant.scope_changed': "changed an assistant's reach",
  'assistant.removed': 'cancelled an invitation',
  'course.created': 'created a course',
  'course.updated': 'edited a course',
  'task_draft.created': 'created a draft task',
  'task_draft.updated': 'edited a draft task',
  'task_draft.deleted': 'deleted a draft task',
};

/**
 * Tone is by *consequence*, not by verb: green creates or grants, red removes
 * or destroys, amber edits something that already existed, blue is a neutral
 * record of work done. Reading a column of these should let Dr. Tahir find the
 * destructive entries without reading a single label.
 */
const ACTION_TONE: Record<AuditAction, TagTone> = {
  'course_staff.assigned': 'green',
  'course_staff.unassigned': 'red',
  'submission.graded': 'blue',
  'recording.created': 'green',
  'recording.updated': 'amber',
  'recording.deleted': 'red',
  'live_session.scheduled': 'green',
  'live_session.updated': 'amber',
  'live_session.cancelled': 'red',
  'announcement.posted': 'blue',
  'group.created': 'green',
  'group.renamed': 'amber',
  'group.course_added': 'green',
  'group.course_removed': 'red',
  'group.student_assigned': 'green',
  'group.student_removed': 'red',
  'assessment.created': 'green',
  'assessment.updated': 'amber',
  'assessment.targeted': 'amber',
  'assessment.deleted': 'red',
  'external_result.attached': 'blue',
  // Violet for the integration pair: connecting hands a third party a
  // long-lived credential, which is neither a create nor an edit of anything
  // inside this platform and should not read as routine (CLAUDE.md §5.4).
  'google.connected': 'violet',
  'google.disconnected': 'violet',
  'blog_post.created': 'green',
  'blog_post.updated': 'amber',
  'blog_post.media_set': 'amber',
  'blog_post.deleted': 'red',
  'student.accepted': 'green',
  'student.rejected': 'red',
  'student.updated': 'amber',
  'student.created': 'green',
  'assistant.invited': 'green',
  'assistant.invitation_accepted': 'green',
  'assistant.invitation_resent': 'blue',
  'assistant.scope_changed': 'amber',
  'assistant.removed': 'red',
  'course.created': 'green',
  'course.updated': 'amber',
  // The draft library follows the `assessment.*` precedent above.
  'task_draft.created': 'green',
  'task_draft.updated': 'amber',
  'task_draft.deleted': 'red',
};

export default function ActivityLogPage() {
  /**
   * A stack of the cursors walked so far; the last one is the page on screen.
   *
   * One page at a time, rather than accumulating every page into a growing
   * list. Accumulating would have to distinguish "next page, append" from
   * "same page re-fetched, replace" - and getting that wrong duplicates audit
   * entries on screen, which is a bad thing for a log to appear to do.
   */
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  const cursor = stack[stack.length - 1];

  // Scoped to one actor when linked from the assistants screen (`PEOPLE-5`) -
  // "which assistant did what", CLAUDE.md §5.4's actual ask. Absent, this is
  // just the full feed.
  const actorId = useSearchParams().get('actorId') ?? undefined;

  const { data, error, loading, reload } = useApi(
    (token) => api.admin.auditLog(token, { actorId, cursor }),
    [actorId, cursor],
  );

  const entries = data?.entries ?? [];

  const columns: Column<AuditLogEntry>[] = [
    {
      label: 'Who',
      render: (entry) => (
        <Tag tone={ACTION_TONE[entry.action] ?? 'gray'}>
          {entry.actorRole === 'teacher' ? 'Teacher' : 'Assistant'}
        </Tag>
      ),
    },
    { label: 'Action', render: (entry) => ACTION_LABEL[entry.action] ?? entry.action },
    {
      label: 'Target',
      render: (entry) => (
        <span className="block max-w-[32ch] truncate text-fg-4">
          {entry.targetType} {entry.targetId}
        </span>
      ),
    },
    { label: 'Change', align: 'end', render: (entry) => <ScoreChange entry={entry} /> },
    {
      label: 'When',
      align: 'end',
      render: (entry) => <span className="whitespace-nowrap text-fg-3">{formatDateTime(entry.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageTitle title="Activity log" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-fg-2">Every recorded action</span>
          <span className="text-base text-fg-3">Who did it, and when</span>
        </div>

        {actorId && (
          <InlineBanner tone="blue">
            Showing activity for one assistant.{' '}
            <Link href="/manage/activity" className="underline-offset-4 hover:underline">
              Clear filter
            </Link>
          </InlineBanner>
        )}

        {loading && entries.length === 0 && (
          <div className="flex justify-center p-8">
            <Loader label="Loading the activity log" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}
        {!loading && !error && entries.length === 0 && (
          <EmptyState
            icon="History"
            title="Nothing recorded yet"
            description="Assigning an assistant, grading work or publishing a recording all leave an entry here."
          />
        )}
        {entries.length > 0 && (
          <>
            <Table columns={columns} rows={entries} rowKey={(entry) => entry.id} />

            {(stack.length > 1 || data?.nextCursor) && (
              <div className="flex items-center justify-between gap-3">
                <Button
                  size="small"
                  disabled={stack.length === 1}
                  onClick={() => setStack((s) => s.slice(0, -1))}
                >
                  Newer
                </Button>
                <Button
                  size="small"
                  disabled={!data?.nextCursor}
                  onClick={() => setStack((s) => [...s, data?.nextCursor ?? undefined])}
                >
                  {loading ? <Loader size={3} label="Loading" /> : 'Older'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * The before/after pair, where there is one worth reading at a glance. A mark
 * that moved is the thing a disputed grade turns on.
 */
function ScoreChange({ entry }: { entry: AuditLogEntry }) {
  if (entry.action !== 'submission.graded') return null;
  const before = entry.before?.score;
  const after = entry.after?.score;
  if (after === undefined || after === null) return null;
  return (
    <span className="num shrink-0 text-xs text-fg-2">
      {before === null || before === undefined ? '—' : String(before)} → {String(after)}
    </span>
  );
}
