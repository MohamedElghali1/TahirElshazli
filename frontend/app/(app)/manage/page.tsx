'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate, formatTime, formatWeekday } from '@/lib/format';
import type { GradingQueueItem, GroupSummary, LiveSession } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { CARD_COLORS, ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, ClStat, PanelHead } from '@/components/classroom/ui';

/**
 * The staff Overview — Redesign V2, the teacher artifact's Overview: "To
 * review", "Next session" (+ the next few), "Groups". Shared by Dr. Tahir,
 * admins and assistants; every figure comes from a staff route that is
 * already scoped server-side, so an assistant sees their own groups' work.
 *
 * Kept from the old Overview, in the artifact's vocabulary: the headline
 * counts (courses, students, awaiting grading, recordings — each opening its
 * screen), the platform-vs-assigned scope note, and the course list with its
 * per-course grading queue.
 *
 * No revenue figure here and there must not be (CLAUDE.md §11.1.1). The
 * artifact's group "course progress" bar is not drawn: no staff route returns
 * a per-group completion figure, and a bar with an invented value is worse
 * than none — the card shows what the group record really holds.
 */

const SESSION_WINDOW_DAYS = 14;
const MAX_REVIEW = 5;

interface ReviewRow {
  assessmentId: string;
  title: string;
  isQuiz: boolean;
  courseTitle: string;
  count: number;
  late: number;
}

export default function ManageOverviewPage() {
  const { user } = useSession();
  const admin = isAdminRole(user?.role);
  const [range] = useState(() => {
    const from = new Date();
    const to = new Date(from.getTime() + SESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  });

  const overview = useApi((t) => api.staff.overview(t), []);
  const courses = overview.data?.courses ?? null;

  // The grading queue, per course (two courses at this scale), folded by task.
  const queue = useApi(
    async (t): Promise<(GradingQueueItem & { courseTitle: string })[]> => {
      if (!courses) return [];
      const lists = await Promise.all(
        courses.map(async (c) => {
          const q = await api.staff.submissions(t, c.id, 'awaiting');
          return q.items.map((item) => ({ ...item, courseTitle: c.title }));
        }),
      );
      return lists.flat();
    },
    [courses],
  );

  const groups = useApi(
    async (t): Promise<(GroupSummary & { courseTitle: string })[]> => {
      if (!courses) return [];
      const lists = await Promise.all(
        courses.map(async (c) => (await api.staff.courseGroups(t, c.id)).map((g) => ({ ...g, courseTitle: c.title }))),
      );
      return lists.flat().sort((a, b) => a.name.localeCompare(b.name));
    },
    [courses],
  );

  const sessions = useApi((t) => api.staff.sessions.list(t, range), [range]);

  const review = useMemo(() => {
    const byTask = new Map<string, ReviewRow>();
    for (const item of queue.data ?? []) {
      const row = byTask.get(item.assessmentId) ?? {
        assessmentId: item.assessmentId,
        title: item.assessmentTitle,
        isQuiz: item.assessmentType === 'quiz',
        courseTitle: item.courseTitle,
        count: 0,
        late: 0,
      };
      row.count += 1;
      if (item.isLate) row.late += 1;
      byTask.set(item.assessmentId, row);
    }
    return [...byTask.values()].sort((a, b) => b.count - a.count);
  }, [queue.data]);

  const groupName = useMemo(() => {
    const m = new Map<string, string>();
    (groups.data ?? []).forEach((g) => m.set(g.id, g.name));
    return m;
  }, [groups.data]);

  const upcoming = useMemo(
    () =>
      (sessions.data ?? [])
        .filter((s) => s.state === 'published' && new Date(s.endsAt).getTime() >= Date.parse(range.from))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [sessions.data, range.from],
  );
  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1, 4);

  const data = overview.data;
  const firstName = user ? firstNameOf(user.name) : '';

  return (
    <>
      <PageTitle title="Overview" />

      {overview.error && (
        <section className="cl-panel">
          <ClError message={overview.error.message} onRetry={overview.reload} />
        </section>
      )}

      {/* ---- To review -------------------------------------------------- */}
      <section aria-labelledby="ov-rev" className="cl-panel pb-4">
        <PanelHead id="ov-rev" title="To review" className="mb-2">
          <Link href="/manage/announcements" className="cl-glink">
            <ClIcon name="announce" small />
            Announce
          </Link>
          <Link href="/manage/tasks/new" className="cl-glink">
            <ClIcon name="plus" small />
            New task
          </Link>
          <Link href="/manage/submissions" className="cl-glink">
            View all work
          </Link>
        </PanelHead>
        {(queue.loading || !courses) && !queue.data && !overview.error && <ClSkeleton rows={3} label="Loading work to review" />}
        {queue.error && <ClError message={queue.error.message} onRetry={queue.reload} />}
        {queue.data && review.length === 0 && (
          <ClEmpty icon="check" title="Everything is marked" hint="Work students hand in will appear here." />
        )}
        {review.slice(0, MAX_REVIEW).map((r) => (
          <Link key={r.assessmentId} href={`/manage/tasks/${r.assessmentId}/submissions`} className="cl-grow">
            <span className={r.isQuiz ? 'cl-ic40 cl-tone-blue' : 'cl-ic40 cl-tone-peach'}>
              <ClIcon name={r.isQuiz ? 'quiz' : 'pen'} small />
            </span>
            <span className="cl-grow-main">
              <span className="block truncate">{r.title}</span>
              <span className="cl-sub">
                {r.courseTitle}
                {r.late > 0 && ` · ${r.late} late`}
              </span>
            </span>
            <span className="shrink-0 text-[14px]" style={{ color: 'var(--cl-warn)' }}>
              {r.count} to mark
            </span>
          </Link>
        ))}
        {review.length > MAX_REVIEW && (
          <p className="cl-muted m-0 mt-2 px-2 text-[13px]">
            {review.length - MAX_REVIEW} more tasks ·{' '}
            <Link href="/manage/submissions" className="cl-glink text-[13px]">
              Open the queue
            </Link>
          </p>
        )}
      </section>

      {/* ---- Next session ----------------------------------------------- */}
      <section aria-labelledby="ov-ses" className="cl-panel pb-4">
        <PanelHead id="ov-ses" title="Next session">
          <Link href="/manage/live-sessions" className="cl-glink">
            All sessions
          </Link>
        </PanelHead>
        {sessions.loading && !sessions.data && <ClSkeleton rows={2} label="Loading sessions" />}
        {sessions.error && <ClError message={sessions.error.message} onRetry={sessions.reload} />}
        {sessions.data && !next && (
          <ClEmpty
            icon="schedule"
            tone="cl-tone-blue"
            title={`No published session in the next ${SESSION_WINDOW_DAYS} days`}
            action={
              <Link href="/manage/live-sessions?new=1" className="cl-btnp">
                New session
              </Link>
            }
          />
        )}
        {next && (
          <>
            <div className="cl-sess">
              <span className="cl-ic40 cl-ic56" style={{ background: 'var(--cl-active)', color: 'var(--cl-blue)' }}>
                <ClIcon name="live" />
              </span>
              <Link
                href={attendanceHref(next)}
                className="min-w-0 flex-[1_1_240px] text-fg no-underline hover:no-underline"
              >
                <div className="text-[17px]">
                  {groupName.get(next.groupId) ?? 'Group'} — {next.title}
                </div>
                <div className="cl-muted mt-[3px] text-[14px]">{sessionWhen(next)}</div>
              </Link>
              {next.meetingLink ? (
                <a href={next.meetingLink} target="_blank" rel="noopener noreferrer" className="cl-btnp cl-btnp--lg">
                  Start session
                </a>
              ) : (
                <Link href="/manage/live-sessions" className="cl-btns">
                  Add meeting link
                </Link>
              )}
            </div>
            <div className="mt-2.5">
              {later.map((s) => (
                <Link key={s.id} href={attendanceHref(s)} className="cl-grow">
                  <span className="w-[52px] flex-none text-center">
                    <span className="cl-muted block text-[12px]">
                      {new Date(s.scheduledAt).toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className="block text-[18px]">{new Date(s.scheduledAt).getDate()}</span>
                  </span>
                  <span className="cl-grow-main truncate">
                    {groupName.get(s.groupId) ?? 'Group'} — {s.title}
                  </span>
                  <span className="cl-muted text-[14px]">
                    {formatTime(s.scheduledAt)} – {formatTime(s.endsAt)}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ---- Groups ----------------------------------------------------- */}
      <section aria-labelledby="ov-grp" className="cl-panel">
        <PanelHead id="ov-grp" title="Groups" className="mb-5">
          {admin && (
            <Link href="/manage/groups" className="cl-glink">
              <ClIcon name="plus" small />
              New group
            </Link>
          )}
        </PanelHead>
        {groups.loading && !groups.data && <ClSkeleton rows={2} label="Loading groups" />}
        {groups.error && <ClError message={groups.error.message} onRetry={groups.reload} />}
        {groups.data && groups.data.length === 0 && (
          <ClEmpty
            icon="groups"
            tone="cl-tone-blue"
            title={admin ? 'No groups yet' : 'No groups assigned to you'}
            hint={admin ? 'Create a group to start scheduling sessions and setting work.' : 'Dr. Tahir assigns assistants to groups.'}
          />
        )}
        {groups.data && groups.data.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {groups.data.map((g, i) => {
              const c = CARD_COLORS[i % CARD_COLORS.length];
              return (
                <Link key={g.id} href={`/manage/groups/${g.id}/report`} className="cl-card" aria-label={`Open group ${g.name}`}>
                  <span className="cl-cardh" style={{ background: c.bg }}>
                    <span className="ring" style={{ background: c.ring }} />
                    <span className="cl-cardt">{g.name}</span>
                    <span className="cl-cards" style={{ color: 'var(--cl-blue-soft)' }}>
                      {g.memberCount} {g.memberCount === 1 ? 'student' : 'students'}
                    </span>
                  </span>
                  <span className="block min-h-[72px] flex-1 p-4">
                    <span className="block truncate text-[14px]">{g.courseTitle}</span>
                    <span className="cl-muted mt-1 block truncate text-[13px]">
                      {[g.meets, g.room].filter(Boolean).join(' · ') || 'No meeting time set'}
                    </span>
                  </span>
                  <span className="cl-cardf">Open group →</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Courses (the old Overview's figures and course list) ------- */}
      <section aria-labelledby="ov-crs" className="cl-panel pb-4">
        <PanelHead id="ov-crs" title={firstName ? `Welcome back, ${firstName}` : 'Your courses'}>
          <Link href="/manage/courses" className="cl-glink">
            All courses
          </Link>
        </PanelHead>
        {overview.loading && !data && <ClSkeleton rows={2} label="Loading your courses" />}
        {data && (
          <>
            <p className="cl-muted -mt-2 mb-4 px-2 text-[13.5px]">
              {data.scope === 'platform' ? 'Everything across the platform.' : 'Your assigned courses only.'}
            </p>
            <div className="cl-stats mb-4">
              <StatLink href="/manage/courses" value={data.courseCount} label="Courses" />
              {/* /manage/students calls /admin/* — an assistant would get a 403. */}
              <StatLink href={admin ? '/manage/students' : undefined} value={data.studentCount} label="Students" />
              <StatLink href="/manage/submissions" value={data.awaitingGrading} label="Awaiting grading" />
              <StatLink href="/manage/recordings" value={data.recordingCount} label="Recordings" />
            </div>
            <hr className="cl-hr mb-2" />
            {data.courses.length === 0 ? (
              <ClEmpty
                icon="book"
                tone="cl-tone-blue"
                title={admin ? 'No courses yet' : 'Nothing assigned to you'}
                hint={
                  admin
                    ? 'Courses added to the platform will appear here.'
                    : 'Dr. Tahir assigns assistants to courses. Once you are on one, it shows up here.'
                }
              />
            ) : (
              data.courses.map((course) => (
                <Link key={course.id} href={`/manage/courses/${course.id}`} className="cl-grow">
                  <span className="cl-ic40 cl-tone-blue">
                    <ClIcon name="book" small />
                  </span>
                  <span className="cl-grow-main">
                    <span className="block truncate">{course.title}</span>
                    <span className="cl-sub">
                      {course.studentCount} {course.studentCount === 1 ? 'student' : 'students'} · {course.recordingCount}{' '}
                      {course.recordingCount === 1 ? 'recording' : 'recordings'}
                    </span>
                  </span>
                  {course.awaitingGrading > 0 && (
                    <span className="shrink-0 text-[14px]" style={{ color: 'var(--cl-warn)' }}>
                      {course.awaitingGrading} to grade
                    </span>
                  )}
                </Link>
              ))
            )}
          </>
        )}
      </section>
    </>
  );
}

function StatLink({ href, value, label }: { href?: string; value: number; label: string }) {
  const body = <ClStat value={value} label={label} />;
  return href ? (
    <Link href={href} className="-m-2 rounded-xl p-2 text-fg no-underline hover:bg-(--cl-hover) hover:no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

function attendanceHref(s: LiveSession): string {
  return `/manage/live-sessions/${s.id}/attendance?groupId=${s.groupId}&title=${encodeURIComponent(s.title)}&scheduledAt=${encodeURIComponent(s.scheduledAt)}`;
}

function sessionWhen(s: LiveSession): string {
  return `${formatWeekday(s.scheduledAt)} ${formatDate(s.scheduledAt)} · ${formatTime(s.scheduledAt)} – ${formatTime(s.endsAt)}`;
}

// Honorifics a name may lead with ("Dr. Tahir Elshazli") that are not the
// first name (REM-045: the greeting read "Welcome back, Dr.").
const HONORIFICS = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'prof', 'prof.']);

function firstNameOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.find((w) => !HONORIFICS.has(w.toLowerCase())) ?? '';
}
