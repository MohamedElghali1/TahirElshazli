'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  BellIcon,
  BooksIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  ChartLineIcon,
  ClipboardTextIcon,
  FileTextIcon,
  FolderSimpleIcon,
  MegaphoneIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  MATERIAL_CATEGORY_LABEL,
  formatDate,
  formatPercent,
  formatRelative,
  formatTime,
  initials,
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
  Chip,
  type ChipTone,
  EmptyState,
  ErrorState,
  Meter,
  Panel,
  RowsSkeleton,
  ButtonLink,
  cx,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';
import {
  PageTransition,
  StaggerList,
  StaggerItem,
  motion,
} from '@/components/app/motion';

/* ========================================================================
   Layout note - where this shape came from.

   Cloned from the reference screenshot the client annotated, four regions
   in a two-column grid, right column wider than the left:

     left/top     hero      - live session if one is running or imminent,
                              otherwise an urgent announcement, otherwise a
                              greeting. Exactly the priority the annotation
                              specifies.
     left/bottom  quick access - the handful of destinations a student
                              actually wants, so the rail is a fallback and
                              not the only way through the app.
     right/top    inbox     - work and announcements that need the student.
     right/bottom materials - the course's files, one row per category.

   The reference's trailing "+" on each quick-access row is an *add*
   affordance in a CRM. Here every one of those rows navigates, so it
   carries a caret instead: the affordance has to describe what the row
   does, not what the reference's row did.
   ======================================================================== */

/** A session inside this window counts as "starting soon" and takes the hero. */
const SOON_MS = 60 * 60 * 1000;

/** An announcement older than this is news, not an interruption. */
const URGENT_MS = 48 * 60 * 60 * 1000;

/** Due inside this window is worth an amber chip rather than a plain date. */
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

const MAX_INBOX = 4;

const MATERIAL_ICON: Record<MaterialCategory, typeof FileTextIcon> = {
  course_notes: FileTextIcon,
  study_materials: BooksIcon,
  important_files: FolderSimpleIcon,
};

const MATERIAL_TONE: Record<MaterialCategory, ChipTone> = {
  course_notes: 'blue',
  study_materials: 'violet',
  important_files: 'amber',
};

/* --- time ---------------------------------------------------------------
   A clock read during render resolves one way on the server and another on
   the client, and every time-dependent branch below - is the session live,
   is this due soon - would hydrate differently. Same problem
   `components/site/reveal.tsx` hit with `prefers-reduced-motion`, so the
   same answer: `useSyncExternalStore`, whose server snapshot React reuses
   for the hydrating render.

   The snapshot is quantized to the tick interval rather than returning a
   raw `Date.now()`. `getSnapshot` must be stable between store changes or
   React re-renders forever chasing a value that moves every call; rounding
   to the bucket makes it change exactly once per tick. `0` is the server
   snapshot and means "no clock yet", which renders the greeting - the one
   hero state that depends on no clock at all. */

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
   not dealt with. They are normalised into one row shape here so the panel
   can sort across both rather than showing two stacked lists. */

interface InboxItem {
  key: string;
  href: string;
  title: string;
  meta: string;
  chipLabel: string;
  chipTone: ChipTone;
  /** Lower sorts first. Overdue work outranks everything. */
  rank: number;
}

function assessmentItem(
  assessment: AssessmentListItem,
  courseTitle: string,
  now: number,
): InboxItem | null {
  const href = `/learn/${assessment.courseId}/assessments/${assessment.id}`;
  const kind =
    assessment.type === 'quiz'
      ? 'Quiz'
      : assessment.type === 'assignment'
        ? 'Assignment'
        : 'Homework';

  // CLAUDE.md §5.10 - `status` is derived on the server and rendered here,
  // never recomputed. `locked` and `submitted` are deliberately absent: one
  // the student cannot act on, the other they already have.
  if (assessment.status === 'corrected') {
    return {
      key: assessment.id,
      href,
      title: assessment.title,
      meta: `${kind} · ${courseTitle} · marked`,
      chipLabel:
        assessment.scorePercentage === null
          ? 'Result ready'
          : `Scored ${formatPercent(assessment.scorePercentage)}`,
      chipTone: 'green',
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
      chipLabel: 'Overdue',
      chipTone: 'red',
      rank: 0,
    };
  }

  const soon = now !== 0 && dueMs <= DUE_SOON_MS;
  return {
    key: assessment.id,
    href,
    title: assessment.title,
    meta: `${kind} · ${courseTitle} · due ${formatDate(assessment.dueAt)}`,
    chipLabel: soon ? `Due ${formatRelative(assessment.dueAt, now)}` : 'To do',
    chipTone: soon ? 'amber' : 'neutral',
    rank: soon ? 1 : 2,
  };
}

function announcementItem(notification: AppNotification): InboxItem {
  return {
    key: notification.id,
    href: notification.link ?? '/notifications',
    title: notification.title,
    meta: `Announcement · ${formatRelative(notification.createdAt)}`,
    chipLabel: 'New',
    chipTone: 'violet',
    rank: 1,
  };
}

/* ======================================================================== */

export default function DashboardPage() {
  const { user } = useSession();
  const now = useNow();

  /* One request for the whole screen.

     This used to be three `useApi` calls, the middle one fanning out over the
     student's courses - `2N + 2` requests before the board could draw, and a
     staged paint where the panels sat on "Loading files…" until the second
     wave landed. `GET /dashboard` returns the same numbers, composed by the
     same services server-side, so the screen is unchanged and the waterfall
     is gone. */
  const {
    data: home,
    error,
    loading,
    reload,
  } = useApi((token) => api.dashboard.home(token), []);

  const entries = useMemo(() => home?.entries ?? [], [home]);
  // `courses` and `mailbox` keep their old shapes so everything downstream -
  // the cards, the panels, the inbox - reads exactly as it did.
  const courses = useMemo(
    () => (home ? entries.map((e) => e.course) : null),
    [home, entries],
  );
  const mailbox = home?.notifications ?? null;

  /* --- the one session the hero and the header both speak about ------- */
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
  const sessionIsImminent = sessionPhase === 'live' || sessionPhase === 'soon';

  /* --- the announcement that earns the hero when no session does ------ */
  const urgentAnnouncement = useMemo(() => {
    if (now === 0) return null;
    return (
      (mailbox?.notifications ?? []).find(
        (n) =>
          n.type === 'announcement' &&
          !n.read &&
          now - new Date(n.createdAt).getTime() <= URGENT_MS,
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
      <PageHeader
        title="Dashboard"
        subtitle={
          courseCount === 0
            ? 'Your courses, work and recordings live here.'
            : `${courseCount} ${courseCount === 1 ? 'course' : 'courses'}${
                needsAction > 0 ? ` · ${needsAction} to do` : ' · nothing due'
              }`
        }
        action={
          sessionIsImminent && nextSession ? (
            <JoinSessionButton
              session={nextSession.session}
              phase={sessionPhase}
            />
          ) : (
            <ButtonLink href="/catalog" variant="secondary">
              Browse courses
            </ButtonLink>
          )
        }
      />

      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        {loading && <RowsSkeleton rows={4} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}

        {courses && courses.length === 0 && (
          <EmptyState
            title="No courses yet"
            body="Pick a course from the catalog and it appears here with its timetable, work and recordings."
            action={
              <ButtonLink href="/catalog" variant="primary">
                Browse courses
              </ButtonLink>
            }
          />
        )}

        {courses && courses.length > 0 && (
          <>
            {/* ---- the two-column board -------------------------------- */}
            <div className="grid items-start gap-[var(--sp-4)] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <StaggerList className="flex flex-col gap-[var(--sp-4)]">
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
                <StaggerItem>
                  <QuickAccess entries={entries} />
                </StaggerItem>
              </StaggerList>

              <StaggerList className="flex flex-col gap-[var(--sp-4)]" delay={0.1}>
                <StaggerItem>
                  <InboxPanel
                    items={inbox}
                    courseCount={courseCount}
                    unread={mailbox?.unreadCount ?? 0}
                  />
                </StaggerItem>
                <StaggerItem>
                  <MaterialsPanel entries={entries} />
                </StaggerItem>
              </StaggerList>
            </div>

            {/* ---- the courses themselves ------------------------------ */}
            <section>
              <h2 className="mb-[var(--sp-3)] text-[var(--fs-xs)] font-medium uppercase tracking-[0.06em] text-[var(--fg-tertiary)]">
                Your courses
              </h2>
              <StaggerList
                className="grid gap-[var(--sp-4)] lg:grid-cols-2"
                delay={0.2}
              >
                {courses.map((course) => (
                  <StaggerItem key={course.id}>
                    <CourseCard course={course} />
                  </StaggerItem>
                ))}
              </StaggerList>
            </section>
          </>
        )}
      </PageBody>
    </PageTransition>
  );
}

/* --- header CTA ---------------------------------------------------------
   The meeting link is somebody else's origin, so this is an anchor and not
   a `next/link`. It carries the button's classes rather than the component
   because ButtonLink is internal-navigation only. */

function JoinSessionButton({
  session,
  phase,
}: {
  session: LiveSession;
  phase: SessionPhase;
}) {
  return (
    <a
      href={session.zoomLink}
      target="_blank"
      rel="noreferrer noopener"
      className={cx(
        'inline-flex h-[var(--h-md)] items-center justify-center gap-[var(--sp-2)]',
        'whitespace-nowrap rounded-[var(--r-md)] px-[var(--sp-4)] text-[var(--fs-base)] font-medium',
        'bg-[var(--accent)] text-[var(--accent-fg)] transition-[background-color]',
        'duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-[var(--accent-hover)]',
        'active:translate-y-[1px]',
      )}
    >
      {phase === 'live' && <LivePip />}
      <VideoCameraIcon size={14} weight="fill" />
      Join session
      <span className="num text-[var(--fs-xs)] opacity-70">
        {formatTime(session.scheduledAt)}
      </span>
    </a>
  );
}

function LivePip() {
  return (
    <span
      aria-hidden
      className="h-[6px] w-[6px] shrink-0 animate-pulse rounded-[var(--r-full)] bg-current motion-reduce:animate-none"
    />
  );
}

/* --- hero ---------------------------------------------------------------
   Three states, in the priority the annotation sets: a session that is
   running or imminent, else an urgent announcement, else a greeting. The
   announcement is shown here *and* left in the inbox below - surfacing it
   is not the same as reading it. */

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
    <section className="flex min-h-[228px] flex-col items-center justify-center rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] px-[var(--sp-6)] py-[var(--sp-8)] text-center">
      {live && session ? (
        <>
          <HeroBadge tone={phase === 'live' ? 'red' : 'amber'}>
            <VideoCameraIcon size={24} weight="fill" />
          </HeroBadge>
          <Chip tone={phase === 'live' ? 'red' : 'amber'} className="mt-[var(--sp-4)]">
            {phase === 'live' ? 'Live now' : 'Starting soon'}
          </Chip>
          <h2 className="mt-[var(--sp-3)] text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
            {session.session.title}
          </h2>
          <p className="mt-[var(--sp-1)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
            {session.courseTitle} ·{' '}
            <span className="num">
              {phase === 'live'
                ? `${formatTime(session.session.scheduledAt)} · ${session.session.durationMinutes} min`
                : `starts in ${minutesUntil(session.session.scheduledAt, now)} min`}
            </span>
          </p>
          <div className="mt-[var(--sp-4)] flex flex-wrap items-center justify-center gap-[var(--sp-2)]">
            <a
              href={session.session.zoomLink}
              target="_blank"
              rel="noreferrer noopener"
              className={cx(
                'inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-2)] rounded-[var(--r-md)]',
                'bg-[var(--accent)] px-[var(--sp-3)] text-[var(--fs-xs)] font-medium',
                'text-[var(--accent-fg)] transition-[background-color] duration-[var(--dur-fast)]',
                'hover:bg-[var(--accent-hover)]',
              )}
            >
              Join now
              <ArrowSquareOutIcon size={12} />
            </a>
            <HeroLink href={`/learn/${session.session.courseId}/sessions`}>
              <CalendarBlankIcon size={12} />
              Timetable
            </HeroLink>
          </div>
        </>
      ) : announcement ? (
        <>
          <HeroBadge tone="violet">
            <MegaphoneIcon size={24} weight="fill" />
          </HeroBadge>
          <Chip tone="violet" className="mt-[var(--sp-4)]">
            Announcement
          </Chip>
          <h2 className="mt-[var(--sp-3)] text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
            {announcement.title}
          </h2>
          <p className="mt-[var(--sp-1)] line-clamp-2 max-w-[46ch] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
            {announcement.message}
          </p>
          <div className="mt-[var(--sp-4)] flex flex-wrap items-center justify-center gap-[var(--sp-2)]">
            <HeroLink href={announcement.link ?? '/notifications'}>
              Read it
              <ArrowRightIcon size={12} />
            </HeroLink>
            <HeroLink href="/notifications">
              <BellIcon size={12} />
              All announcements
            </HeroLink>
          </div>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="flex h-[64px] w-[64px] items-center justify-center rounded-[var(--r-full)] bg-[var(--accent-wash)] text-[var(--fs-lg)] font-semibold text-[var(--accent)]"
          >
            {initials(firstName || 'Student')}
          </span>
          <h2 className="mt-[var(--sp-4)] text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
            {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
          </h2>
          <p className="mt-[var(--sp-1)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
            {needsAction > 0
              ? `${needsAction} ${needsAction === 1 ? 'thing needs' : 'things need'} you today.`
              : 'Nothing is due. A good time to watch a lesson back.'}
          </p>
          <div className="mt-[var(--sp-4)] flex flex-wrap items-center justify-center gap-[var(--sp-2)]">
            <HeroLink href={`/learn/${primaryCourseId}`}>
              <ArrowRightIcon size={12} />
              Continue
            </HeroLink>
            <HeroLink href={`/learn/${primaryCourseId}/assessments`}>
              <ClipboardTextIcon size={12} />
              Work
            </HeroLink>
            <HeroLink href={`/learn/${primaryCourseId}/recordings`}>
              <VideoCameraIcon size={12} />
              Recordings
            </HeroLink>
          </div>
        </>
      )}
    </section>
  );
}

function HeroBadge({
  tone,
  children,
}: {
  tone: ChipTone;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className="flex h-[64px] w-[64px] items-center justify-center rounded-[var(--r-full)]"
      style={{
        background: `var(--chip-${tone}-bg)`,
        color: `var(--chip-${tone}-fg)`,
      }}
    >
      {children}
    </span>
  );
}

function HeroLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex h-[var(--h-sm)] items-center gap-[var(--sp-2)] rounded-[var(--r-md)]',
        'border border-[var(--border-medium)] px-[var(--sp-3)] text-[var(--fs-xs)]',
        'text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)]',
        'hover:border-[var(--border-strong)] hover:text-[var(--fg-primary)]',
      )}
    >
      {children}
    </Link>
  );
}

/* --- quick access -------------------------------------------------------
   The reference's second left-column block, and the reason it exists: the
   four places a student goes most, one click from the landing screen
   instead of a trip through the rail. With more than one course the
   destination is ambiguous, so the sub-label names the course it opens. */

function QuickAccess({ entries }: { entries: StudentHomeEntry[] }) {
  const primary = entries[0].course;
  const stats = entries[0]?.stats;
  const many = entries.length > 1;
  const scope = many ? primary.title : null;

  const rows = [
    {
      href: `/learn/${primary.id}/recordings`,
      icon: VideoCameraIcon,
      tone: 'blue' as ChipTone,
      label: 'Recordings',
      sub: scope ?? 'Watch any lesson back',
      count: stats?.newRecordings ? `${stats.newRecordings} new` : null,
    },
    {
      href: `/learn/${primary.id}/assessments`,
      icon: ClipboardTextIcon,
      tone: 'amber' as ChipTone,
      label: 'Work',
      sub: scope ?? 'Homework, assignments and quizzes',
      count: stats?.homeworkPending ? `${stats.homeworkPending} to do` : null,
    },
    {
      href: `/learn/${primary.id}/sessions`,
      icon: CalendarBlankIcon,
      tone: 'teal' as ChipTone,
      label: 'Timetable',
      sub: scope ?? 'Live sessions and attendance',
      count: null,
    },
    {
      href: `/learn/${primary.id}/report`,
      icon: ChartLineIcon,
      tone: 'green' as ChipTone,
      label: 'Report',
      sub: scope ?? 'Progress and performance',
      count:
        stats?.overallReportPercentage != null
          ? formatPercent(stats.overallReportPercentage)
          : null,
    },
  ];

  return (
    <Panel title="Quick access" bodyClassName="">
      <ul className="rows">
        {rows.map((row) => (
          <AccessRow key={row.href} {...row} />
        ))}
      </ul>
    </Panel>
  );
}

function AccessRow({
  href,
  icon: Icon,
  tone,
  label,
  sub,
  count,
}: {
  href: string;
  icon: typeof VideoCameraIcon;
  tone: ChipTone;
  label: string;
  sub: string;
  count: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        className="row flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
      >
        <span
          aria-hidden
          className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[var(--r-sm)]"
          style={{
            background: `var(--chip-${tone}-bg)`,
            color: `var(--chip-${tone}-fg)`,
          }}
        >
          <Icon size={12} weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
            {label}
          </span>
          <span className="block truncate text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            {sub}
          </span>
        </span>
        {count && (
          <span className="num shrink-0 text-[var(--fs-xs)] text-[var(--fg-secondary)]">
            {count}
          </span>
        )}
        <CaretRightIcon
          size={12}
          aria-hidden
          className="reveal shrink-0 text-[var(--fg-muted)]"
        />
      </Link>
    </li>
  );
}

/* --- inbox --------------------------------------------------------------
   The reference's stacked task cards, carrying what a student is actually
   handed: work that is open or newly marked, and announcements they have
   not read. Separate cards rather than table rows, because each one is a
   different errand rather than a row in a set. */

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
    <section className="rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)]">
      <header className="flex items-baseline justify-between gap-[var(--sp-3)]">
        <h2 className="text-[var(--fs-base)] font-semibold text-[var(--fg-primary)]">
          {items.length === 0
            ? 'Nothing waiting'
            : `${items.length} ${items.length === 1 ? 'item' : 'items'} for you`}
        </h2>
        <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          across {courseCount} {courseCount === 1 ? 'course' : 'courses'}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="mt-[var(--sp-4)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
          No open work and no unread announcements. Anything new lands here.
        </p>
      ) : (
        <ul className="mt-[var(--sp-3)] flex flex-col gap-[var(--sp-2)]">
          {shown.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cx(
                  'block rounded-[var(--r-sm)] border border-[var(--border-medium)]',
                  'bg-[var(--bg-primary)] px-[var(--sp-4)] py-[var(--sp-3)]',
                  'transition-[border-color,background-color] duration-[var(--dur-fast)]',
                  'hover:border-[var(--border-strong)] hover:bg-[var(--bg-tertiary)]',
                )}
              >
                <p className="truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
                  {item.title}
                </p>
                <p className="mt-[var(--sp-1)] truncate text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                  {item.meta}
                </p>
                <Chip tone={item.chipTone} className="mt-[var(--sp-2)]">
                  {item.chipLabel}
                </Chip>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(more > 0 || unread > 0) && (
        <div className="mt-[var(--sp-3)] flex items-center justify-between">
          <span className="text-[var(--fs-xs)] text-[var(--fg-muted)]">
            {more > 0 ? `${more} more` : ''}
          </span>
          <Link
            href="/notifications"
            className="inline-flex items-center gap-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
          >
            Open inbox
            {unread > 0 && <span className="num">({unread})</span>}
            <ArrowRightIcon size={11} />
          </Link>
        </div>
      )}
    </section>
  );
}

/* --- materials ----------------------------------------------------------
   The reference's "Tools & Skills" list, in the same row grammar. With one
   course the rows are its three material categories; with several they are
   the courses themselves, because a combined count that links to only one
   of them would be a number the destination cannot account for. */

function MaterialsPanel({ entries }: { entries: StudentHomeEntry[] }) {
  const single = entries.length === 1;

  const rows = single
    ? (
        Object.keys(MATERIAL_CATEGORY_LABEL) as MaterialCategory[]
      ).map((category) => ({
        href: `/learn/${entries[0].course.id}/materials`,
        icon: MATERIAL_ICON[category],
        tone: MATERIAL_TONE[category],
        label: MATERIAL_CATEGORY_LABEL[category],
        sub: entries[0].course.title,
        count: String(entries[0].quickAccess[category] ?? 0),
      }))
    : entries.map((entry) => {
        const total = Object.values(entry.quickAccess).reduce(
          (sum, n) => sum + n,
          0,
        );
        return {
          href: `/learn/${entry.course.id}/materials`,
          icon: FolderSimpleIcon,
          tone: 'blue' as ChipTone,
          label: entry.course.title,
          sub: entry.course.teacherName,
          count: String(total),
        };
      });

  return (
    <Panel
      title="Materials"
      action={
        <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          Notes and files
        </span>
      }
      bodyClassName=""
    >
      {rows.length === 0 ? (
        // No "still loading" branch any more: the counts arrive with the
        // courses in one response, so by the time this panel renders the
        // answer is known and an empty list really does mean empty.
        <p className="p-[var(--sp-4)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
          Nothing uploaded yet.
        </p>
      ) : (
        <ul className="rows">
          {rows.map((row) => (
            <AccessRow key={`${row.href}-${row.label}`} {...row} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --- course card --------------------------------------------------------
   Kept from the previous dashboard. The reference has no equivalent block,
   but a student's landing screen without their courses on it would be
   cloning the reference's form and losing its function. */

function CourseCard({ course }: { course: CourseListItem }) {
  const { progress } = course;

  // CLAUDE.md §5.2 - the enrollment's mode decides what "progress" means.
  const isRecorded = progress.type === 'recorded';
  const percentage = isRecorded
    ? progress.completionPercentage
    : progress.attendancePercentage;
  const detail = isRecorded
    ? `${progress.completedLessons} of ${progress.totalLessons} lessons done`
    : `${progress.attendedSessions} of ${progress.totalSessions} sessions attended`;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0.2, 1] }}
    >
      <Link
        href={`/learn/${course.id}`}
        className="group flex h-full flex-col rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)] transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]"
      >
        <div className="flex items-start justify-between gap-[var(--sp-3)]">
          <div className="min-w-0">
            <h3 className="truncate text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
              {course.title}
            </h3>
            <p className="mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              {course.teacherName}
            </p>
          </div>
          <Chip tone={isRecorded ? 'violet' : 'teal'}>
            {isRecorded ? 'Recorded' : 'Live'}
          </Chip>
        </div>

        <p className="mt-[var(--sp-3)] line-clamp-2 text-[var(--fs-base)] text-[var(--fg-secondary)]">
          {course.description}
        </p>

        <div className="mt-[var(--sp-4)] flex items-baseline justify-between">
          <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            {isRecorded ? 'Course completion' : 'Attendance'}
          </span>
          <span className="num text-[var(--fs-md)] text-[var(--fg-primary)]">
            {formatPercent(percentage)}
          </span>
        </div>
        <div className="mt-[var(--sp-2)]">
          <Meter
            value={percentage}
            label={isRecorded ? 'Course completion' : 'Attendance'}
          />
        </div>
        <p className="num mt-[var(--sp-2)] text-[var(--fs-xxs)] text-[var(--fg-muted)]">
          {detail}
        </p>

        <span className="mt-[var(--sp-4)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)] group-hover:text-[var(--fg-primary)]">
          Open course
          <ArrowRightIcon size={14} />
        </span>
      </Link>
    </motion.div>
  );
}
