'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { AuditAction, AuditLogEntry } from '@/lib/types';
import type { TagTone } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

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
  'submission.returned': 'returned marked work',
  'submission.annotated': 'marked up a submission',
  'recording.created': 'published a recording',
  'recording.updated': 'edited a recording',
  'recording.deleted': 'deleted a recording',
  'live_session.scheduled': 'scheduled a session',
  'live_session.updated': 'moved a session',
  'live_session.cancelled': 'cancelled a session',
  // Unit 10's draft lifecycle. Missing from the mirror until `OPS-1`'s drift
  // check found it, so these entries had rendered with no label at all.
  'announcement.created': 'drafted an announcement',
  'announcement.updated': 'edited an announcement',
  'announcement.deleted': 'deleted a draft announcement',
  'announcement.posted': 'posted an announcement',
  'group.created': 'created a group',
  'group.updated': 'edited a group',
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
  'work.results_imported': 'imported Google Form results from a CSV',
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
  'account.google_linked': 'connected Google sign-in',
  'account.google_unlinked': 'disconnected Google sign-in',
  // Unit 8. A draft timetable is planned, then published; attendance is marked.
  'session.planned': 'planned a session',
  'session.published': 'published the timetable',
  'attendance.marked': 'marked attendance',
  // Unit 9: weekly reports (`REM-031`).
  'weekly_report.published': 'published weekly reports',
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
  // Returning is the moment a student sees a mark - green, like other
  // actions that make something reach students.
  'submission.returned': 'green',
  'submission.annotated': 'blue',
  'recording.created': 'green',
  'recording.updated': 'amber',
  'recording.deleted': 'red',
  'live_session.scheduled': 'green',
  'live_session.updated': 'amber',
  'live_session.cancelled': 'red',
  'announcement.created': 'green',
  'announcement.updated': 'amber',
  'announcement.deleted': 'red',
  'announcement.posted': 'blue',
  'group.created': 'green',
  'group.updated': 'amber',
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
  'work.results_imported': 'blue',
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
  // Who can sign in as the account: granting it is green, removing it red.
  'account.google_linked': 'green',
  'account.google_unlinked': 'red',
  // Amber for the draft stage, green once it is out; marking is a neutral record.
  'session.planned': 'amber',
  'session.published': 'green',
  'attendance.marked': 'blue',
  // Publishing is the moment the report reaches the student - green, like
  // `submission.returned` and `session.published` above.
  'weekly_report.published': 'green',
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

  // The audit entry carries only actorId + role: names come from the staff
  // directory (assistants and admins) plus the signed-in user (the teacher).
  const { user } = useSession();
  const { data: staff } = useApi((token) => api.admin.assistants(token), []);
  const names = new Map<string, string>((staff ?? []).map((a) => [a.id, a.name]));
  if (user) names.set(user.id, user.name);

  return (
    <>
      <PageTitle title="Activity log" />
      <section aria-labelledby="aa-h" className="cl-panel pb-4">
        <PanelHead id="aa-h" title="Assistant activity" className="mb-2">
          <span className="cl-muted text-[14px]">Every recorded action · who did it, and when</span>
        </PanelHead>

        {actorId && (
          <p className="cl-soft mb-2">
            Showing activity for one assistant.{' '}
            <Link href="/manage/activity" className="cl-glink">
              Clear filter
            </Link>
          </p>
        )}

        {loading && entries.length === 0 && !error && <ClSkeleton rows={5} label="Loading the activity log" />}
        {error && (
          <ClError
            message={error.isAuth ? "You don't have access to this page." : error.message}
            onRetry={error.isAuth ? undefined : reload}
          />
        )}
        {!loading && !error && entries.length === 0 && (
          <ClEmpty
            icon="activity"
            title="Nothing recorded yet"
            hint="Assigning an assistant, grading work or publishing a recording all leave an entry here."
          />
        )}
        {entries.map((entry) => {
          const tone = TONE_STYLE[ACTION_TONE[entry.action] ?? 'gray'];
          return (
            <div key={entry.id} className="cl-grow" style={{ cursor: 'default' }}>
              <span className={`cl-ic40 ${tone.cls}`} style={tone.style}>
                <ClIcon name="activity" small />
              </span>
              <span className="cl-grow-main">
                <span className="block">
                  {ACTION_LABEL[entry.action] ?? entry.action} <ScoreChange entry={entry} />
                </span>
                <span className="cl-sub block truncate">
                  {names.get(entry.actorId) ?? (entry.actorRole === 'teacher' ? 'Teacher' : 'Assistant')} · {entry.targetType} {entry.targetId}
                </span>
              </span>
              <span className="cl-muted whitespace-nowrap text-[13.5px]">{formatDateTime(entry.createdAt)}</span>
            </div>
          );
        })}

        {entries.length > 0 && (stack.length > 1 || data?.nextCursor) && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              className="cl-btns"
              disabled={stack.length === 1}
              onClick={() => setStack((s) => s.slice(0, -1))}
            >
              Newer
            </button>
            <button
              type="button"
              className="cl-btns"
              disabled={!data?.nextCursor || loading}
              onClick={() => setStack((s) => [...s, data?.nextCursor ?? undefined])}
            >
              {loading ? 'Loading…' : 'Older'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

/** Action tone (by consequence) -> the artifact's round icon tone. */
const TONE_STYLE: Record<TagTone, { cls: string; style?: React.CSSProperties }> = {
  green: { cls: 'cl-tone-mint' },
  red: { cls: '', style: { background: 'var(--cl-bad-bg)', color: 'var(--cl-bad-deep)' } },
  amber: { cls: 'cl-tone-peach' },
  blue: { cls: 'cl-tone-blue' },
  violet: { cls: 'cl-tone-sky' },
  gray: { cls: 'cl-tone-badge' },
};

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
    <span className="num cl-muted text-[13px]">
      {before === null || before === undefined ? '—' : String(before)} → {String(after)}
    </span>
  );
}
