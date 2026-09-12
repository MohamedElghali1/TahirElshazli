'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  CalendarBlankIcon,
  ChartLineIcon,
  ClipboardTextIcon,
  FileTextIcon,
  FolderSimpleIcon,
  SquaresFourIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatPercent, formatRelative } from '@/lib/format';
import type {
  AppNotification,
  AssessmentListItem,
  LiveSession,
  StudentHomeEntry,
} from '@/lib/types';
import {
  Chip,
  type ChipTone,
  ErrorState,
  RowsSkeleton,
  cx,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { PageActions, PageTitle } from '@/components/app/page-chrome';
import { TeacherPortrait } from '@/components/app/teacher-portrait';
import {
  JoinSessionAction,
  SessionStamp,
  phaseOf,
} from '@/components/app/join-session';
import { PageTransition } from '@/components/app/motion';

/* ========================================================================
   Layout - cloned from the reference screen the client supplied (2026-09-13).

   Two columns, the left narrower: a portrait card over a list of section
   shortcuts, and beside it the work that needs doing over the enrolled
   courses. The header carries one primary action - Join Session - with the
   session's time beside it, exactly as the reference places it.

   What is deliberately *not* cloned is the reference's data. Its cards are a
   CRM's; ours are a student's, and every number below comes from `GET
   /dashboard` rather than being arranged to fill a shape. Where the reference
   had a control we have no feature for, the row is absent rather than inert.
   ======================================================================== */

/** How often the clock ticks. A minute is enough for "starts in 20 minutes". */
const CLOCK_MS = 60_000;
/** An announcement is "new" for this long. */
const URGENT_MS = 48 * 60 * 60 * 1000;

function useNow(): number {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const id = setInterval(onStoreChange, CLOCK_MS);
    return () => clearInterval(id);
  }, []);

  // The server has no clock the client agrees with, so SSR renders 0 and every
  // time-dependent branch below reads it as "unknown" rather than "now".
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS,
    () => 0,
  );
}

/* --- the task model ------------------------------------------------------
   Assessments and announcements are two resources on the server and one idea
   to a student: something addressed to them that they have not dealt with.
   Normalised to one row shape so the panel sorts across both instead of
   stacking two lists. */

interface TaskItem {
  key: string;
  href: string;
  title: string;
  meta: string;
  chipLabel: string;
  chipTone: ChipTone;
  /** Lower sorts first. Overdue work outranks everything. */
  rank: number;
}

function assessmentTask(
  assessment: AssessmentListItem,
  courseTitle: string,
  now: number,
): TaskItem | null {
  // Status is the server's (CLAUDE.md §5.10) - never recomputed here.
  if (assessment.status === 'corrected' || assessment.status === 'submitted') {
    return null;
  }
  if (assessment.status === 'locked') return null;

  const overdue = assessment.isOverdue;
  const due = now === 0 ? '' : formatRelative(assessment.dueAt);

  return {
    key: `a-${assessment.id}`,
    href: `/learn/${assessment.courseId}/assessments/${assessment.id}`,
    title: assessment.title,
    meta: overdue
      ? `${courseTitle} · was due ${due}`
      : `${courseTitle}${due ? ` · due ${due}` : ''}`,
    chipLabel: overdue ? 'Overdue' : 'To do',
    chipTone: overdue ? 'red' : 'amber',
    rank: overdue ? 0 : 1,
  };
}

function announcementTask(notification: AppNotification): TaskItem {
  return {
    key: `n-${notification.id}`,
    href: '/notifications',
    title: notification.title,
    meta: notification.message,
    chipLabel: 'Announcement',
    chipTone: 'blue',
    rank: 2,
  };
}

export default function DashboardPage() {
  const { user } = useSession();
  const now = useNow();

  /* One request for the whole screen - `GET /dashboard` composes it from the
     same per-course services the individual screens use, so these numbers
     cannot drift from the pages they link to (CLAUDE.md §7.1). */
  const {
    data: home,
    error,
    loading,
    reload,
  } = useApi((token) => api.dashboard.home(token), []);

  const entries = useMemo(() => home?.entries ?? [], [home]);
  const mailbox = home?.notifications ?? null;
  const firstName = user?.name.split(' ')[0] ?? '';
  const teacherName = entries[0]?.course.teacherName ?? 'Dr. Tahir Elshazli';

  /* --- the one session the header speaks about ------------------------ */
  const nextSession = useMemo(() => {
    const upcoming = entries
      .filter((e): e is StudentHomeEntry & { nextLiveSession: LiveSession } =>
        Boolean(e.nextLiveSession),
      )
      .map((e) => ({ session: e.nextLiveSession, courseTitle: e.course.title }))
      .sort(
        (a, b) =>
          new Date(a.session.scheduledAt).getTime() -
          new Date(b.session.scheduledAt).getTime(),
      );
    return upcoming[0] ?? null;
  }, [entries]);

  const sessionPhase = nextSession
    ? phaseOf(nextSession.session, now)
    : 'scheduled';

  /* The course the left column's shortcuts point into: the one with the next
     session if there is one, else the first enrolled. Named in each row's
     subtitle, so a student with three courses is never guessing which one a
     shortcut opens. */
  const primary = useMemo(() => {
    if (nextSession) {
      const match = entries.find(
        (e) => e.course.id === nextSession.session.courseId,
      );
      if (match) return match;
    }
    return entries[0] ?? null;
  }, [entries, nextSession]);

  /* --- tasks ----------------------------------------------------------- */
  const tasks = useMemo(() => {
    const items: TaskItem[] = [];
    entries.forEach((entry) => {
      entry.assessments.forEach((assessment) => {
        const item = assessmentTask(assessment, entry.course.title, now);
        if (item) items.push(item);
      });
    });
    (mailbox?.notifications ?? [])
      .filter(
        (n) =>
          n.type === 'announcement' &&
          !n.read &&
          (now === 0 || now - new Date(n.createdAt).getTime() <= URGENT_MS),
      )
      .forEach((n) => items.push(announcementTask(n)));
    return items.sort((a, b) => a.rank - b.rank);
  }, [entries, mailbox, now]);

  const courseCount = entries.length;

  return (
    <PageTransition>
      <PageTitle icon={SquaresFourIcon} title="Dashboard" />
      {/* Button first, stamp second - the order the reference sets. */}
      <PageActions>
        <JoinSessionAction
          session={nextSession?.session ?? null}
          phase={sessionPhase}
        />
        <SessionStamp session={nextSession?.session ?? null} />
      </PageActions>

      <PageBody dense className="flex flex-col gap-[var(--sp-4)]">
        {loading && <RowsSkeleton rows={5} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {/* `items-stretch` (the grid default, said out loud) makes both
            columns the same height; the trailing section in each then carries
            `flex-1` so it absorbs the slack instead of leaving one side
            hanging below the other. That is what makes the four cards read as
            one aligned block rather than two ragged stacks. */}
        {home && (
          <div className="grid items-stretch gap-[var(--sp-4)] lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-[var(--sp-4)]">
              <WelcomeCard
                firstName={firstName}
                teacherName={teacherName}
                taskCount={tasks.length}
                courseCount={courseCount}
                primary={primary}
              />
              {primary && <Shortcuts entry={primary} />}
            </div>

            <div className="flex flex-col gap-[var(--sp-6)]">
              <TaskList tasks={tasks} courseCount={courseCount} />
              <CourseList entries={entries} />
            </div>
          </div>
        )}
      </PageBody>
    </PageTransition>
  );
}

/* --- the portrait card ---------------------------------------------------
   The reference's centred record card: an image, a greeting, one line of
   context and a row of actions. */

function WelcomeCard({
  firstName,
  teacherName,
  taskCount,
  courseCount,
  primary,
}: {
  firstName: string;
  teacherName: string;
  taskCount: number;
  courseCount: number;
  primary: StudentHomeEntry | null;
}) {
  const line =
    courseCount === 0
      ? 'You are not enrolled on a course yet.'
      : taskCount === 0
        ? 'Nothing is waiting for you right now.'
        : `${taskCount} ${taskCount === 1 ? 'thing needs' : 'things need'} your attention.`;

  return (
    <section className="flex flex-col items-center rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-[var(--sp-6)] py-[var(--sp-8)] text-center">
      <TeacherPortrait name={teacherName} />
      <h2 className="mt-[var(--sp-4)] text-[var(--fs-md)] font-semibold text-fg">
        Welcome, {firstName || 'there'}.
      </h2>
      <p className="mt-[var(--sp-1)] text-[var(--fs-base)] text-fg-3">{line}</p>

      <div className="mt-[var(--sp-4)] flex flex-wrap items-center justify-center gap-[var(--sp-2)]">
        {primary ? (
          <>
            <CardAction
              href={`/learn/${primary.course.id}/assessments`}
              icon={<ClipboardTextIcon size={14} aria-hidden />}
            >
              Work
            </CardAction>
            <CardAction
              href={`/learn/${primary.course.id}/recordings`}
              icon={<VideoCameraIcon size={14} aria-hidden />}
            >
              Recordings
            </CardAction>
            <CardAction
              href={`/learn/${primary.course.id}/materials`}
              icon={<FileTextIcon size={14} aria-hidden />}
            >
              Materials
            </CardAction>
          </>
        ) : (
          <CardAction
            href="/catalog"
            icon={<FolderSimpleIcon size={14} aria-hidden />}
          >
            Browse courses
          </CardAction>
        )}
      </div>
    </section>
  );
}

function CardAction({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex h-[var(--h-md)] items-center gap-[var(--sp-1)] rounded-[var(--r-md)]',
        'border border-[var(--border-medium)] px-[var(--sp-3)]',
        'text-[var(--fs-base)] font-medium text-fg-2',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
        'hover:bg-[var(--bg-wash-nav)] hover:text-fg',
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/* --- section shortcuts ---------------------------------------------------
   The reference's list of related records, under the card. Each row names the
   course it opens, because a student with three of them should not have to
   guess which one a bare "Recordings" goes to. */

function Shortcuts({ entry }: { entry: StudentHomeEntry }) {
  const { course, stats, quickAccess } = entry;
  const materialCount =
    quickAccess.course_notes +
    quickAccess.study_materials +
    quickAccess.important_files;

  const rows = [
    {
      href: `/learn/${course.id}/recordings`,
      tone: 'text-chip-red-fg',
      icon: <VideoCameraIcon size={16} weight="fill" aria-hidden />,
      title: 'Recordings',
      body:
        stats.newRecordings > 0
          ? `${stats.newRecordings} new to watch`
          : 'Catch up on any lesson',
    },
    {
      href: `/learn/${course.id}/assessments`,
      tone: 'text-chip-amber-fg',
      icon: <ClipboardTextIcon size={16} weight="fill" aria-hidden />,
      title: 'Work',
      body:
        stats.homeworkPending > 0
          ? `${stats.homeworkPending} still to hand in`
          : 'Everything is handed in',
    },
    {
      href: `/learn/${course.id}/report`,
      tone: 'text-chip-violet-fg',
      icon: <ChartLineIcon size={16} weight="fill" aria-hidden />,
      title: 'Report',
      body:
        stats.overallReportPercentage === null
          ? 'Nothing marked yet'
          : `Averaging ${formatPercent(stats.overallReportPercentage)}`,
    },
    {
      href: `/learn/${course.id}/sessions`,
      tone: 'text-chip-teal-fg',
      icon: <CalendarBlankIcon size={16} weight="fill" aria-hidden />,
      title: 'Timetable',
      body: 'Live sessions and attendance',
    },
    {
      href: `/learn/${course.id}/materials`,
      tone: 'text-chip-green-fg',
      icon: <FileTextIcon size={16} weight="fill" aria-hidden />,
      title: 'Materials',
      body:
        materialCount > 0
          ? `${materialCount} file${materialCount === 1 ? '' : 's'}`
          : 'Nothing uploaded yet',
    },
  ];

  return (
    <section className="flex flex-1 flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)]">
      <p className="px-[var(--sp-3)] pt-[var(--sp-3)] text-[var(--fs-xxs)] font-semibold uppercase tracking-wide text-fg-4">
        {course.title}
      </p>
      <ul className="rows mt-[var(--sp-2)] flex-1">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex items-center gap-[var(--sp-3)] px-[var(--sp-3)] py-[var(--sp-2)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash-nav)]"
            >
              <span
                className={cx(
                  'flex h-[var(--h-md)] w-[var(--h-md)] shrink-0 items-center justify-center',
                  'rounded-[var(--r-sm)] bg-[var(--bg-wash-nav)]',
                  row.tone,
                )}
              >
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--fs-base)] font-medium text-fg">
                  {row.title}
                </span>
                <span className="block truncate text-[var(--fs-xs)] text-fg-3">
                  {row.body}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --- the work that needs doing ------------------------------------------ */

function TaskList({
  tasks,
  courseCount,
}: {
  tasks: TaskItem[];
  courseCount: number;
}) {
  return (
    <section>
      <h2 className="text-[var(--fs-base)] font-semibold text-fg">
        {tasks.length} required {tasks.length === 1 ? 'task' : 'tasks'}
        <span className="text-fg-3">
          {' · '}
          {courseCount} {courseCount === 1 ? 'course' : 'courses'}
        </span>
      </h2>

      {tasks.length === 0 ? (
        <p className="mt-[var(--sp-3)] rounded-[var(--r-md)] border border-[var(--border-medium)] px-[var(--sp-4)] py-[var(--sp-4)] text-[var(--fs-base)] text-fg-3">
          Nothing is due. New work and announcements land here.
        </p>
      ) : (
        <ul className="mt-[var(--sp-3)] flex flex-col gap-[var(--sp-2)]">
          {tasks.map((task) => (
            <li key={task.key}>
              <Link
                href={task.href}
                className={cx(
                  'block rounded-[var(--r-md)] border border-[var(--border-medium)]',
                  'px-[var(--sp-4)] py-[var(--sp-3)]',
                  'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
                  'hover:bg-[var(--bg-wash-nav)]',
                )}
              >
                <span className="block text-[var(--fs-base)] font-semibold text-fg">
                  {task.title}
                </span>
                <span className="mt-[var(--sp-1)] block text-[var(--fs-base)] text-fg-3">
                  {task.meta}
                </span>
                <span className="mt-[var(--sp-2)] block">
                  <Chip tone={task.chipTone}>{task.chipLabel}</Chip>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --- the courses themselves --------------------------------------------- */

function CourseList({ entries }: { entries: StudentHomeEntry[] }) {
  return (
    <section className="flex flex-1 flex-col">
      <h2 className="text-[var(--fs-base)] font-semibold text-fg">
        Your courses
      </h2>
      <p className="mt-[var(--sp-1)] text-[var(--fs-base)] text-fg-3">
        Everything you are enrolled on
      </p>

      {entries.length === 0 ? (
        <p className="mt-[var(--sp-3)] flex-1 rounded-[var(--r-md)] border border-[var(--border-medium)] px-[var(--sp-4)] py-[var(--sp-4)] text-[var(--fs-base)] text-fg-3">
          You are not enrolled on anything yet.{' '}
          <Link href="/catalog" className="text-accent underline-offset-2 hover:underline">
            Browse the catalog
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-[var(--sp-3)] flex-1 overflow-hidden rounded-[var(--r-md)] border border-[var(--border-medium)]">
          {entries.map((entry, i) => (
            <li
              key={entry.course.id}
              className={cx(i > 0 && 'border-t border-[var(--border-medium)]')}
            >
              <Link
                href={`/learn/${entry.course.id}`}
                className="flex items-center gap-[var(--sp-3)] px-[var(--sp-3)] py-[var(--sp-2)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-wash-nav)]"
              >
                <span className="flex h-[var(--h-md)] w-[var(--h-md)] shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-wash-nav)] text-chip-blue-fg">
                  {entry.nextLiveSession ? (
                    <CalendarBlankIcon size={16} weight="fill" aria-hidden />
                  ) : (
                    <FolderSimpleIcon size={16} weight="fill" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--fs-base)] font-medium text-fg">
                    {entry.course.title}
                  </span>
                  <span className="block truncate text-[var(--fs-xs)] text-fg-3">
                    {entry.course.teacherName}
                  </span>
                </span>
                {/* Progress, never merged with performance (CLAUDE.md §5.1) -
                    and the two learning modes keep their own words, because
                    "80% watched" and "80% attended" are different facts
                    (§5.2), which is why `CourseProgress` is a union and not a
                    number. */}
                <span className="shrink-0 whitespace-nowrap text-[var(--fs-xs)] text-fg-3">
                  <span className="num">
                    {formatPercent(
                      entry.course.progress.type === 'recorded'
                        ? entry.course.progress.completionPercentage
                        : entry.course.progress.attendancePercentage,
                    )}
                  </span>{' '}
                  {entry.course.progress.type === 'recorded'
                    ? 'complete'
                    : 'attended'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
