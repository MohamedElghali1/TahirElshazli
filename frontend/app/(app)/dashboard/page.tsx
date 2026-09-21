'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  MATERIAL_CATEGORY_LABEL,
  formatDate,
  formatPercent,
  formatRelative,
  formatTime,
} from '@/lib/format';
import type {
  AppNotification,
  AssessmentListItem,
  CourseListItem,
  LiveSession,
  MaterialCategory,
  StudentHomeEntry,
} from '@/lib/types';
import {
  Panel,
  EmptyState,
  Loader,
  Tag,
  type TagTone,
  Meter,
  Button,
  ButtonLink,
  Icon,
  type IconName,
} from '@/components/ui';
import { PageActions, PageTitle } from '@/components/app/page-chrome';
import { TeacherPortrait } from '@/components/student/teacher-portrait';
import { JoinSessionAction, SessionStamp } from '@/components/student/join-session';
import { PageTransition, StaggerList, StaggerItem, motion } from '@/components/student/motion';
import { CourseLink } from '@/components/student/course-link';

/* ========================================================================
   Overview (`docs/PRODUCT_SPEC.md` §6 calls the target "action-first:
   continue-watching, three action cards, due-today, dismissible
   announcement" — a content redesign out of this unit's scope). This is the
   existing multi-course home screen, ported off the legacy components; it is
   also where `lib/roles.ts` sends a signed-in student, so the route stays
   `/dashboard` even though the rail's nav item reads "Overview".

     left/top     hero      - live session if one is running or imminent,
                              otherwise an urgent announcement, otherwise a
                              greeting.
     left/bottom  quick access - the handful of destinations a student
                              actually wants, one course scoped via
                              `CourseLink` (`SHELL-3`).
     right/top    inbox     - work and announcements that need the student.
     right/bottom materials - the course's files, one row per category.
   ======================================================================== */

/** A session inside this window counts as "starting soon" and takes the hero. */
const SOON_MS = 60 * 60 * 1000;

/** An announcement older than this is news, not an interruption. */
const URGENT_MS = 48 * 60 * 60 * 1000;

/** Due inside this window is worth an amber tag rather than a plain date. */
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

const MAX_INBOX = 4;

const MATERIAL_ICON: Record<MaterialCategory, IconName> = {
  course_notes: 'FileText',
  study_materials: 'Book',
  important_files: 'Folder',
};

const MATERIAL_TONE: Record<MaterialCategory, TagTone> = {
  course_notes: 'blue',
  study_materials: 'violet',
  important_files: 'amber',
};

/* --- time ---------------------------------------------------------------
   A clock read during render resolves one way on the server and another on
   the client, and every time-dependent branch below - is the session live,
   is this due soon - would hydrate differently, so `useSyncExternalStore`,
   whose server snapshot React reuses for the hydrating render.

   The snapshot is quantized to the tick interval rather than returning a raw
   `Date.now()`. `0` is the server snapshot and means "no clock yet", which
   renders the greeting - the one hero state that depends on no clock at all. */

const CLOCK_MS = 30_000;

function useNow(): number {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const id = setInterval(onStoreChange, CLOCK_MS);
    return () => clearInterval(id);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS,
    () => 0,
  );
}

type SessionPhase = 'live' | 'soon' | 'scheduled';

function phaseOf(session: LiveSession, now: number): SessionPhase {
  if (now === 0) return 'scheduled';
  const start = new Date(session.scheduledAt).getTime();
  const end = start + session.durationMinutes * 60_000;
  if (now >= start && now <= end) return 'live';
  if (start > now && start - now <= SOON_MS) return 'soon';
  return 'scheduled';
}

function minutesUntil(iso: string, now: number): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
}

/* --- the inbox model ----------------------------------------------------
   Assessments and announcements are different resources on the server and
   the same thing to a student: something addressed to them that they have
   not dealt with. Normalised into one row shape so the panel can sort across
   both rather than showing two stacked lists. */

interface InboxItem {
  key: string;
  href: string;
  title: string;
  meta: string;
  tagLabel: string;
  tagTone: TagTone;
  /** Lower sorts first. Overdue work outranks everything. */
  rank: number;
}

function assessmentItem(
  assessment: AssessmentListItem,
  courseTitle: string,
  now: number,
): InboxItem | null {
  const href = `/homework/${assessment.id}`;
  const kind =
    assessment.type === 'quiz' ? 'Quiz' : assessment.type === 'assignment' ? 'Assignment' : 'Homework';

  // CLAUDE.md §5.10 - `status` is derived on the server and rendered here,
  // never recomputed. `locked` and `submitted` are deliberately absent: one
  // the student cannot act on, the other they already have.
  if (assessment.status === 'corrected') {
    return {
      key: assessment.id,
      href,
      title: assessment.title,
      meta: `${kind} · ${courseTitle} · marked`,
      tagLabel:
        assessment.scorePercentage === null
          ? 'Result ready'
          : `Scored ${formatPercent(assessment.scorePercentage)}`,
      tagTone: 'green',
      rank: 3,
    };
  }

  if (assessment.status !== 'available') return null;

  const dueMs = new Date(assessment.dueAt).getTime() - now;

  if (assessment.isOverdue) {
    return {
      key: assessment.id,
      href,
      title: assessment.title,
      meta: `${kind} · ${courseTitle} · was due ${formatDate(assessment.dueAt)}`,
      tagLabel: 'Overdue',
      tagTone: 'red',
      rank: 0,
    };
  }

  const soon = now !== 0 && dueMs <= DUE_SOON_MS;
  return {
    key: assessment.id,
    href,
    title: assessment.title,
    meta: `${kind} · ${courseTitle} · due ${formatDate(assessment.dueAt)}`,
    tagLabel: soon ? `Due ${formatRelative(assessment.dueAt, now)}` : 'To do',
    tagTone: soon ? 'amber' : 'gray',
    rank: soon ? 1 : 2,
  };
}

function announcementItem(notification: AppNotification): InboxItem {
  return {
    key: notification.id,
    href: notification.link ?? '/notifications',
    title: notification.title,
    meta: `Announcement · ${formatRelative(notification.createdAt)}`,
    tagLabel: 'New',
    tagTone: 'violet',
    rank: 1,
  };
}

/* ======================================================================== */

export default function DashboardPage() {
  const { user } = useSession();
  const now = useNow();

  /* One request for the whole screen — `GET /dashboard` composes every
     enrolled course's stats, material counts, next session and assessment
     list, plus the mailbox, server-side. */
  const {
    data: home,
    error,
    loading,
    reload,
  } = useApi((token) => api.dashboard.home(token), []);

  const entries = useMemo(() => home?.entries ?? [], [home]);
  const courses = useMemo(() => (home ? entries.map((e) => e.course) : null), [home, entries]);
  const mailbox = home?.notifications ?? null;

  /* --- the one session the hero and the header both speak about ------- */
  const nextSession = useMemo(() => {
    const upcoming = entries
      .filter((e): e is StudentHomeEntry & { nextLiveSession: LiveSession } =>
        Boolean(e.nextLiveSession),
      )
      .map((e) => ({ session: e.nextLiveSession, courseTitle: e.course.title }))
      .sort(
        (a, b) => new Date(a.session.scheduledAt).getTime() - new Date(b.session.scheduledAt).getTime(),
      );
    return upcoming[0] ?? null;
  }, [entries]);

  const sessionPhase = nextSession ? phaseOf(nextSession.session, now) : 'scheduled';
  const sessionIsImminent = sessionPhase === 'live' || sessionPhase === 'soon';

  /* --- the announcement that earns the hero when no session does ------ */
  const urgentAnnouncement = useMemo(() => {
    if (now === 0) return null;
    return (
      (mailbox?.notifications ?? []).find(
        (n) =>
          n.type === 'announcement' && !n.read && now - new Date(n.createdAt).getTime() <= URGENT_MS,
      ) ?? null
    );
  }, [mailbox, now]);

  /* --- inbox ---------------------------------------------------------- */
  const inbox = useMemo(() => {
    const items: InboxItem[] = [];

    entries.forEach((entry) => {
      entry.assessments.forEach((assessment) => {
        const item = assessmentItem(assessment, entry.course.title, now);
        if (item) items.push(item);
      });
    });

    (mailbox?.notifications ?? [])
      .filter((n) => n.type === 'announcement' && !n.read)
      .forEach((n) => items.push(announcementItem(n)));

    return items.sort((a, b) => a.rank - b.rank);
  }, [entries, mailbox, now]);

  const needsAction = inbox.filter((i) => i.rank <= 2).length;
  const courseCount = courses?.length ?? 0;
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <PageTransition>
      <PageTitle title="Overview" />
      <PageActions>
        <JoinSessionAction session={nextSession?.session ?? null} phase={sessionPhase} />
        <SessionStamp session={nextSession?.session ?? null} />
      </PageActions>

      <div className="flex flex-col gap-6 p-6">
        {loading && (
          <div className="flex justify-center p-12">
            <Loader label="Loading your courses" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}

        {courses && courses.length === 0 && (
          <EmptyState
            icon="Book"
            title="No courses yet"
            description="Once you are accepted onto a course, it appears here with its timetable, work and recordings."
            action={
              <ButtonLink href="/help" variant="primary">
                Get in touch
              </ButtonLink>
            }
          />
        )}

        {courses && courses.length > 0 && (
          <>
            {/* ---- the two-column board -------------------------------- */}
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <StaggerList className="flex h-full flex-col gap-4">
                <StaggerItem>
                  <Hero
                    firstName={firstName}
                    session={nextSession}
                    phase={sessionPhase}
                    announcement={sessionIsImminent ? null : urgentAnnouncement}
                    needsAction={needsAction}
                    now={now}
                    primaryCourseId={courses[0].id}
                  />
                </StaggerItem>
                <StaggerItem className="flex flex-1 flex-col">
                  <QuickAccess entries={entries} />
                </StaggerItem>
              </StaggerList>

              <StaggerList className="flex h-full flex-col gap-4" delay={0.1}>
                <StaggerItem>
                  <InboxPanel items={inbox} courseCount={courseCount} unread={mailbox?.unreadCount ?? 0} />
                </StaggerItem>
                <StaggerItem className="flex flex-1 flex-col">
                  <MaterialsPanel entries={entries} />
                </StaggerItem>
              </StaggerList>
            </div>

            {/* ---- the courses themselves ------------------------------ */}
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-fg-3">
                Your courses
              </h2>
              <StaggerList className="grid gap-4 lg:grid-cols-2" delay={0.2}>
                {courses.map((course) => (
                  <StaggerItem key={course.id}>
                    <CourseCard course={course} />
                  </StaggerItem>
                ))}
              </StaggerList>
            </section>
          </>
        )}
      </div>
    </PageTransition>
  );
}

/* --- hero ---------------------------------------------------------------
   Three states, in priority order: a session that is running or imminent,
   else an urgent announcement, else a greeting. The announcement is shown
   here *and* left in the inbox below - surfacing it is not the same as
   reading it. */

function Hero({
  firstName,
  session,
  phase,
  announcement,
  needsAction,
  now,
  primaryCourseId,
}: {
  firstName: string;
  session: { session: LiveSession; courseTitle: string } | null;
  phase: SessionPhase;
  announcement: AppNotification | null;
  needsAction: number;
  now: number;
  primaryCourseId: string;
}) {
  const live = session && (phase === 'live' || phase === 'soon');

  return (
    <section className="flex min-h-[228px] flex-col items-center justify-center rounded-md border border-border-medium bg-surface-2 px-6 py-8 text-center">
      {live && session ? (
        <>
          <HeroBadge tone={phase === 'live' ? 'red' : 'amber'}>
            <Icon name="Video" size={24} />
          </HeroBadge>
          <Tag tone={phase === 'live' ? 'red' : 'amber'} className="mt-4">
            {phase === 'live' ? 'Live now' : 'Starting soon'}
          </Tag>
          <h2 className="mt-3 text-md font-semibold text-fg">{session.session.title}</h2>
          <p className="mt-1 text-base text-fg-3">
            {session.courseTitle} ·{' '}
            <span className="num">
              {phase === 'live'
                ? `${formatTime(session.session.scheduledAt)} · ${session.session.durationMinutes} min`
                : `starts in ${minutesUntil(session.session.scheduledAt, now)} min`}
            </span>
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <a
              href={session.session.zoomLink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-6 items-center gap-2 rounded-md bg-accent px-3 text-xs font-medium text-fg-invert transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-accent-hover"
            >
              Join now
              <Icon name="ArrowUpRight" size={12} />
            </a>
            <CourseLink courseId={session.session.courseId} href="/timetable">
              <HeroLinkBody>
                <Icon name="CalendarEvent" size={12} />
                Timetable
              </HeroLinkBody>
            </CourseLink>
          </div>
        </>
      ) : announcement ? (
        <>
          <HeroBadge tone="violet">
            <Icon name="Message" size={24} />
          </HeroBadge>
          <Tag tone="violet" className="mt-4">
            Announcement
          </Tag>
          <h2 className="mt-3 text-md font-semibold text-fg">{announcement.title}</h2>
          <p className="mt-1 line-clamp-2 max-w-[46ch] text-base text-fg-3">{announcement.message}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href={announcement.link ?? '/notifications'}>
              <HeroLinkBody>
                Read it
                <Icon name="ChevronRight" size={12} />
              </HeroLinkBody>
            </Link>
            <Link href="/notifications">
              <HeroLinkBody>
                <Icon name="Bell" size={12} />
                All announcements
              </HeroLinkBody>
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* Dr. Tahir's illustration, as the client supplied it. It replaces
              the student's own initials disc: the greeting is from the
              teacher, and a student does not need their own monogram shown
              back to them. */}
          <TeacherPortrait name="Dr. Tahir Elshazli" />
          <h2 className="mt-4 text-md font-semibold text-fg">
            {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
          </h2>
          <p className="mt-1 text-base text-fg-3">
            {needsAction > 0
              ? `${needsAction} ${needsAction === 1 ? 'thing needs' : 'things need'} you today.`
              : 'Nothing is due. A good time to watch a lesson back.'}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <CourseLink courseId={primaryCourseId} href="/lessons">
              <HeroLinkBody>
                <Icon name="ChevronRight" size={12} />
                Continue
              </HeroLinkBody>
            </CourseLink>
            <CourseLink courseId={primaryCourseId} href="/homework">
              <HeroLinkBody>
                <Icon name="Clipboard" size={12} />
                Work
              </HeroLinkBody>
            </CourseLink>
            <CourseLink courseId={primaryCourseId} href="/lessons">
              <HeroLinkBody>
                <Icon name="Video" size={12} />
                Recordings
              </HeroLinkBody>
            </CourseLink>
          </div>
        </>
      )}
    </section>
  );
}

function HeroLinkBody({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-2 rounded-md px-3 text-xs text-fg-2 shadow-[inset_0_0_0_1px_var(--border-medium)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:border-border-strong hover:text-fg hover:bg-wash-hover">
      {children}
    </span>
  );
}

function HeroBadge({ tone, children }: { tone: TagTone; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex h-[64px] w-[64px] items-center justify-center rounded-full"
      style={{
        background: `var(--status-${tone}-wash)`,
        color: `var(--status-${tone}-text)`,
      }}
    >
      {children}
    </span>
  );
}

/* --- quick access -------------------------------------------------------
   The four places a student goes most, one click from the landing screen.
   With more than one course the destination is ambiguous, so the sub-label
   names the course it opens and `CourseLink` scopes the rail's switcher to
   it before navigating. */

function QuickAccess({ entries }: { entries: StudentHomeEntry[] }) {
  const primary = entries[0].course;
  const stats = entries[0]?.stats;
  const many = entries.length > 1;
  const scope = many ? primary.title : null;

  const rows = [
    {
      href: '/lessons',
      icon: 'Video' as IconName,
      tone: 'blue' as TagTone,
      label: 'Recordings',
      sub: scope ?? 'Watch any lesson back',
      count: stats?.newRecordings ? `${stats.newRecordings} new` : null,
    },
    {
      href: '/homework',
      icon: 'Clipboard' as IconName,
      tone: 'amber' as TagTone,
      label: 'Work',
      sub: scope ?? 'Homework, assignments and quizzes',
      count: stats?.homeworkPending ? `${stats.homeworkPending} to do` : null,
    },
    {
      href: '/timetable',
      icon: 'CalendarEvent' as IconName,
      tone: 'blue' as TagTone,
      label: 'Timetable',
      sub: scope ?? 'Live sessions and attendance',
      count: null,
    },
    {
      href: '/marks',
      icon: 'ChartPie' as IconName,
      tone: 'green' as TagTone,
      label: 'Marks',
      sub: scope ?? 'Progress and performance',
      count: stats?.overallReportPercentage != null ? formatPercent(stats.overallReportPercentage) : null,
    },
  ];

  return (
    <Panel title="Quick access" bodyClassName="" className="h-full">
      <ul className="divide-y divide-border-light">
        {rows.map((row) => (
          <li key={row.href}>
            <AccessRow courseId={primary.id} {...row} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AccessRow({
  courseId,
  href,
  icon,
  tone,
  label,
  sub,
  count,
}: {
  courseId: string;
  href: string;
  icon: IconName;
  tone: TagTone;
  label: string;
  sub: string;
  count: string | null;
}) {
  return (
    <CourseLink
      courseId={courseId}
      href={href}
      className="flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
    >
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
        style={{ background: `var(--status-${tone}-wash)`, color: `var(--status-${tone}-text)` }}
      >
        <Icon name={icon} size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-fg">{label}</span>
        <span className="block truncate text-xs text-fg-3">{sub}</span>
      </span>
      {count && <span className="num shrink-0 text-xs text-fg-2">{count}</span>}
      <Icon name="ChevronRight" size={12} className="shrink-0 text-fg-4" />
    </CourseLink>
  );
}

/* --- inbox ---------------------------------------------------------------
   Work that is open or newly marked, and announcements not yet read. Each
   row is a different errand, so each gets its own card. */

function InboxPanel({
  items,
  courseCount,
  unread,
}: {
  items: InboxItem[];
  courseCount: number;
  unread: number;
}) {
  const shown = items.slice(0, MAX_INBOX);
  const more = items.length - shown.length;

  return (
    <section className="rounded-md border border-border-medium bg-surface-2 p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">
          {items.length === 0 ? 'Nothing waiting' : `${items.length} ${items.length === 1 ? 'item' : 'items'} for you`}
        </h2>
        <span className="text-xs text-fg-3">
          across {courseCount} {courseCount === 1 ? 'course' : 'courses'}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="mt-4 text-base text-fg-3">
          No open work and no unread announcements. Anything new lands here.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shown.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="block rounded-sm border border-border-medium bg-surface px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:border-border-strong hover:bg-surface-3"
              >
                <p className="truncate text-base font-medium text-fg">{item.title}</p>
                <p className="mt-1 truncate text-xs text-fg-3">{item.meta}</p>
                <Tag tone={item.tagTone} className="mt-2">
                  {item.tagLabel}
                </Tag>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(more > 0 || unread > 0) && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-fg-4">{more > 0 ? `${more} more` : ''}</span>
          <Link
            href="/notifications"
            className="inline-flex items-center gap-1 text-xs text-fg-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:text-fg"
          >
            Open inbox
            {unread > 0 && <span className="num">({unread})</span>}
            <Icon name="ChevronRight" size={11} />
          </Link>
        </div>
      )}
    </section>
  );
}

/* --- materials ------------------------------------------------------------
   With one course the rows are its three material categories; with several
   they are the courses themselves. */

function MaterialsPanel({ entries }: { entries: StudentHomeEntry[] }) {
  const single = entries.length === 1;

  return (
    <Panel className="h-full" title="Materials" action={<span className="text-xs text-fg-3">Notes and files</span>} bodyClassName="">
      {single ? (
        <ul className="divide-y divide-border-light">
          {(Object.keys(MATERIAL_CATEGORY_LABEL) as MaterialCategory[]).map((category) => (
            <li key={category}>
              <CourseLink
                courseId={entries[0].course.id}
                href={`/materials?category=${category}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
                  style={{
                    background: `var(--status-${MATERIAL_TONE[category]}-wash)`,
                    color: `var(--status-${MATERIAL_TONE[category]}-text)`,
                  }}
                >
                  <Icon name={MATERIAL_ICON[category]} size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-fg">
                    {MATERIAL_CATEGORY_LABEL[category]}
                  </span>
                  <span className="block truncate text-xs text-fg-3">{entries[0].course.title}</span>
                </span>
                <span className="num shrink-0 text-xs text-fg-2">
                  {entries[0].quickAccess[category] ?? 0}
                </span>
                <Icon name="ChevronRight" size={12} className="shrink-0 text-fg-4" />
              </CourseLink>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border-light">
          {entries.map((entry) => {
            const total = Object.values(entry.quickAccess).reduce((sum, n) => sum + n, 0);
            return (
              <li key={entry.course.id}>
                <CourseLink
                  courseId={entry.course.id}
                  href="/materials"
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
                    style={{ background: 'var(--status-blue-wash)', color: 'var(--status-blue-text)' }}
                  >
                    <Icon name="Folder" size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-fg">{entry.course.title}</span>
                    <span className="block truncate text-xs text-fg-3">{entry.course.teacherName}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-fg-2">{total}</span>
                  <Icon name="ChevronRight" size={12} className="shrink-0 text-fg-4" />
                </CourseLink>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* --- course card --------------------------------------------------------- */

function CourseCard({ course }: { course: CourseListItem }) {
  const { progress } = course;

  // CLAUDE.md §5.2 - the enrollment's mode decides what "progress" means, but
  // `CourseProgress` (`lib/types.ts`) carries no mode field to read it from -
  // it always returns both completion and attendance figures. Absent that
  // discriminant, this infers it from which figures the course actually has:
  // a course with lessons is treated as recorded, one with none (sessions
  // only, or neither) as live. Disclosed rather than guessed silently - see
  // this slice's final report.
  const isRecorded = progress.totalLessons > 0 || progress.totalSessions === 0;
  const percentage = isRecorded ? progress.completionPercentage : progress.attendancePercentage;
  const detail = isRecorded
    ? `${progress.completedLessons} of ${progress.totalLessons} lessons done`
    : `${progress.attendedSessions} of ${progress.totalSessions} sessions attended`;

  return (
    <motion.div whileHover={{ scale: 1.01 }} transition={{ duration: 0.2, ease: [0.2, 0, 0.2, 1] }}>
      <CourseLink
        courseId={course.id}
        href="/lessons"
        className="group flex h-full flex-col rounded-md border border-border-medium bg-surface-2 p-4 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:border-border-strong"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-md font-semibold text-fg">{course.title}</h3>
            <p className="mt-1 text-xs text-fg-3">{course.teacherName}</p>
          </div>
          <Tag tone={isRecorded ? 'violet' : 'blue'}>{isRecorded ? 'Recorded' : 'Live'}</Tag>
        </div>

        <p className="mt-3 line-clamp-2 text-base text-fg-2">{course.description}</p>

        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-xs text-fg-3">{isRecorded ? 'Course completion' : 'Attendance'}</span>
          <span className="num text-md text-fg">{formatPercent(percentage)}</span>
        </div>
        <div className="mt-2">
          <Meter value={percentage} name={isRecorded ? 'Course completion' : 'Attendance'} />
        </div>
        <p className="num mt-2 text-xxs text-fg-4">{detail}</p>

        <span className="mt-4 inline-flex items-center gap-2 text-base text-fg-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] group-hover:text-fg">
          Open course
          <Icon name="ChevronRight" size={14} />
        </span>
      </CourseLink>
    </motion.div>
  );
}
