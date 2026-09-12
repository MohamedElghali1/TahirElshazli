'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { AuditAction, AuditLogEntry } from '@/lib/types';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  RowsSkeleton,
} from '@/components/ui';
import type { ChipTone } from '@/components/ui';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import { PageBody } from '@/components/app/page-parts';
import { TableScroll, Td, Th, Tr } from '@/components/app/table';
import { PageTitle } from '@/components/app/page-chrome';

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
};

/**
 * Tone is by *consequence*, not by verb: green creates or grants, red removes
 * or destroys, amber edits something that already existed, blue is a neutral
 * record of work done. Reading a column of these should let Dr. Tahir find the
 * destructive entries without reading a single label.
 */
const ACTION_TONE: Record<AuditAction, ChipTone> = {
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

  const { data, error, loading, reload } = useApi(
    (token) => api.admin.auditLog(token, { cursor }),
    [cursor],
  );

  const entries = data?.entries ?? [];

  return (
    <>
      <PageTitle icon={ClockCounterClockwiseIcon} title="Activity log" />
      <PageBody dense className="flex flex-col gap-[var(--sp-2)]">
        <div className="flex h-[var(--topbar-h)] items-center justify-between px-[var(--sp-2)]">
          <span className="inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-1)] rounded-[var(--r-lg)] bg-[var(--bg-primary)] py-[var(--sp-1)] ps-[var(--sp-1)] pe-[var(--sp-2)] text-[var(--fs-base)] font-medium text-fg-2">
            Every recorded action
          </span>
          <span className="text-[var(--fs-base)] text-fg-3">
            Who did it, and when
          </span>
        </div>

        {loading && entries.length === 0 && <RowsSkeleton rows={6} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {!loading && !error && entries.length === 0 && (
          <EmptyState
            title="Nothing recorded yet"
            body="Assigning an assistant, grading work or publishing a recording all leave an entry here."
          />
        )}
        {entries.length > 0 && (
          <>
            <TableScroll minWidth={720}>
              <thead>
                <tr className="border-b border-[var(--border-medium)]">
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th align="end">Change</Th>
                  <Th align="end">When</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td>
                      <Chip tone={ACTION_TONE[entry.action] ?? 'neutral'}>
                        {entry.actorRole === 'teacher' ? 'Teacher' : 'Assistant'}
                      </Chip>
                    </Td>
                    <Td className="text-fg">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </Td>
                    <Td>
                      <span className="block max-w-[32ch] truncate text-fg-4">
                        {entry.targetType} {entry.targetId}
                      </span>
                    </Td>
                    <Td align="end">
                      <ScoreChange entry={entry} />
                    </Td>
                    <Td align="end">
                      <span className="whitespace-nowrap text-fg-3">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableScroll>

            {(stack.length > 1 || data?.nextCursor) && (
              <div className="flex items-center justify-between gap-[var(--sp-3)] px-[var(--sp-2)] py-[var(--sp-2)]">
                <Button
                  size="sm"
                  disabled={stack.length === 1}
                  onClick={() => setStack((s) => s.slice(0, -1))}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  disabled={!data?.nextCursor}
                  loading={loading}
                  onClick={() =>
                    setStack((s) => [...s, data?.nextCursor ?? undefined])
                  }
                >
                  Older
                </Button>
              </div>
            )}
          </>
        )}
      </PageBody>
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
    <span className="num shrink-0 text-[var(--fs-xs)] text-fg-2">
      {before === null || before === undefined ? '--' : String(before)} → {String(after)}
    </span>
  );
}
