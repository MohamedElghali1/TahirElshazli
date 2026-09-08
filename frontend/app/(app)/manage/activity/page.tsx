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
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import type { ChipTone } from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

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
};

const ACTION_TONE: Record<AuditAction, ChipTone> = {
  'course_staff.assigned': 'green',
  'course_staff.unassigned': 'red',
  'submission.graded': 'blue',
  'recording.created': 'green',
  'recording.updated': 'amber',
  'recording.deleted': 'red',
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
      <PageHeader
        title="Activity log"
        subtitle="Every recorded action by an assistant or admin, with who did it and when."
      />
      <PageBody>
        <Panel bodyClassName="">
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
              <ul className="rows">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <div className="flex flex-wrap items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
                      <Chip tone={ACTION_TONE[entry.action] ?? 'neutral'}>
                        {entry.actorRole === 'teacher' ? 'Teacher' : 'Assistant'}
                      </Chip>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[var(--fs-base)] text-[var(--fg-primary)]">
                          {ACTION_LABEL[entry.action] ?? entry.action}
                        </span>
                        <span className="mt-[var(--sp-1)] block truncate text-[var(--fs-xs)] text-[var(--fg-muted)]">
                          {entry.actorId} · {entry.targetType} {entry.targetId}
                          {entry.courseId && ` · ${entry.courseId}`}
                        </span>
                      </span>
                      <ScoreChange entry={entry} />
                      <span className="shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {(stack.length > 1 || data?.nextCursor) && (
                <div className="flex items-center justify-between gap-[var(--sp-3)] border-t border-[var(--border-light)] p-[var(--sp-4)]">
                  <Button
                    disabled={stack.length === 1}
                    onClick={() => setStack((s) => s.slice(0, -1))}
                  >
                    Newer
                  </Button>
                  <Button
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
        </Panel>
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
    <span className="num shrink-0 text-[var(--fs-xs)] text-[var(--fg-secondary)]">
      {before === null || before === undefined ? '--' : String(before)} → {String(after)}
    </span>
  );
}
