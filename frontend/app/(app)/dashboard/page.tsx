'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  MATERIAL_CATEGORY_LABEL,
  formatDate,
  formatPercent,
  formatRelative,
  formatTime,
  formatWeekday,
} from '@/lib/format';
import type {
  AssessmentListItem,
  MaterialCategory,
  StudentHomeEntry,
  StudentSessionView,
} from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseLink } from '@/components/student/course-link';
import { CARD_COLORS, ClIcon, TEACHER_AVATAR, TEACHER_NAME, type IconKey } from '@/components/shell/classroom';

/* ========================================================================
   Home (`STU-1`) — Redesign V2, the student artifact's Home: "Next session",
   "Recently due", "Progress", in that order. What the old Overview carried
   and the artifact does not draw is kept, in the artifact's own vocabulary:

     - Recently due is tasks only (homework, assignments, quizzes) that are
       still due or overdue; announcements live in Notifications
     - continue watching → a "Continue watching" panel of recording rows
     - quick access counts + attendance → the Progress figures
     - course cards with completion → "My courses" cards
     - materials by category → a "Materials" panel

   Progress and performance stay apart (CLAUDE.md §11.1.2): `GET /dashboard`
   carries completion and attendance and deliberately no grade average, so
   the Progress panel shows those and links to Marks & reports for marks.
   ======================================================================== */

const SOON_MS = 60 * 60 * 1000;
const DUE_SOON_MS = 48 * 60 * 60 * 1000;
const MAX_DUE = 5;
const CLOCK_MS = 30_000;

/* A clock read during render would hydrate differently on server and client;
   `0` is the server snapshot and means "no clock yet". */
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

function phaseOf(session: StudentSessionView, now: number): SessionPhase {
  if (now === 0) return 'scheduled';
  const start = new Date(session.scheduledAt).getTime();
  const end = new Date(session.endsAt).getTime();
  if (now >= start && now <= end) return 'live';
  if (start > now && start - now <= SOON_MS) return 'soon';
  return 'scheduled';
}

function whenText(session: StudentSessionView, now: number): string {
  const start = new Date(session.scheduledAt);
  const range = `${formatTime(session.scheduledAt)} – ${formatTime(session.endsAt)}`;
  if (now !== 0) {
    const today = new Date(now);
    if (start.toDateString() === today.toDateString()) return `Today, ${range}`;
    const tomorrow = new Date(now + 24 * 60 * 60 * 1000);
    if (start.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${range}`;
  }
  return `${formatWeekday(session.scheduledAt)} ${formatDate(session.scheduledAt)}, ${range}`;
}

/* --- Recently due: tasks still due or overdue ------------------------- */

interface DueRow {
  key: string;
  href: string;
  title: string;
  right: string;
  rightTone: 'bad' | 'muted';
  icon: IconKey;
  tone: string;
  /** Lower sorts first. Overdue work outranks everything. */
  rank: number;
}

function workRow(a: AssessmentListItem, now: number): DueRow | null {
  const icon: IconKey = a.type === 'quiz' ? 'quiz' : 'pen';
  const tone = a.type === 'quiz' ? 'cl-tone-blue' : 'cl-tone-peach';
  const href = `/homework/${a.id}`;
  // `status` is derived on the server and rendered, never recomputed here.
  if (a.status !== 'available') return null;
  if (a.isOverdue) {
    return { key: a.id, href, title: a.title, right: 'Missing', rightTone: 'bad', icon, tone, rank: 0 };
  }
  const soon = now !== 0 && new Date(a.dueAt).getTime() - now <= DUE_SOON_MS;
  return {
    key: a.id,
    href,
    title: a.title,
    right: soon ? `Due ${formatRelative(a.dueAt, now)}` : `Due ${formatDate(a.dueAt)}`,
    rightTone: soon ? 'bad' : 'muted',
    icon,
    tone,
    rank: soon ? 1 : 2,
  };
}

const MATERIAL_ICON: Record<MaterialCategory, IconKey> = {
  course_notes: 'doc',
  study_materials: 'book',
  important_files: 'folder',
};
const MATERIAL_TONE: Record<MaterialCategory, string> = {
  course_notes: 'cl-tone-mint',
  study_materials: 'cl-tone-sky',
  important_files: 'cl-tone-sand',
};

const RIGHT_COLOR = { bad: 'var(--cl-bad)', muted: 'var(--cl-muted)' } as const;

export default function DashboardPage() {
  const now = useNow();
  const [dueOpen, setDueOpen] = useState(true);

  // One request for the whole screen — `GET /dashboard` composes every
  // enrolled course's stats, materials, next session and work, plus the mailbox.
  const { data: home, error, loading, reload } = useApi((t) => api.dashboard.home(t), []);

  const entries = useMemo(() => home?.entries ?? [], [home]);

  const next = useMemo(() => {
    const upcoming = entries
      .filter((e): e is StudentHomeEntry & { nextLiveSession: StudentSessionView } => Boolean(e.nextLiveSession))
      .map((e) => ({ session: e.nextLiveSession, courseTitle: e.course.title, courseId: e.course.id }))
      .sort((a, b) => new Date(a.session.scheduledAt).getTime() - new Date(b.session.scheduledAt).getTime());
    return upcoming[0] ?? null;
  }, [entries]);
  const phase = next ? phaseOf(next.session, now) : 'scheduled';

  const due = useMemo(() => {
    const rows: DueRow[] = [];
    entries.forEach((e) =>
      e.assessments.forEach((a) => {
        const row = workRow(a, now);
        if (row) rows.push(row);
      }),
    );
    return rows.sort((a, b) => a.rank - b.rank);
  }, [entries, now]);

  const resume = entries
    .filter((e) => e.continueWatching)
    .map((e) => ({ recording: e.continueWatching!, courseTitle: e.course.title, courseId: e.course.id }));

  const pending = entries.reduce((n, e) => n + e.stats.homeworkPending, 0);
  const newRecordings = entries.reduce((n, e) => n + e.stats.newRecordings, 0);
  const lessons = entries.reduce(
    (acc, e) => ({ done: acc.done + e.course.progress.completedLessons, total: acc.total + e.course.progress.totalLessons }),
    { done: 0, total: 0 },
  );
  const attendance = home?.attendance;

  return (
    <>
      <PageTitle title="Home" />

      {loading && <HomeSkeleton />}

      {error && (
        <section className="cl-panel">
          <div className="cl-empty">
            <div>{error.message}</div>
            <button type="button" className="cl-btnp" onClick={reload}>
              Try again
            </button>
          </div>
        </section>
      )}

      {home && entries.length === 0 && (
        <section className="cl-panel">
          <div className="cl-empty">
            <span className="cl-ic40 cl-ic56 cl-tone-blue">
              <ClIcon name="book" />
            </span>
            <div className="text-[15px] text-fg">No courses yet</div>
            <div className="text-[13.5px]">
              Once you are accepted onto a course, it appears here with its schedule, work and recordings.
            </div>
            <Link href="/help" className="cl-btnp">
              Get in touch
            </Link>
          </div>
        </section>
      )}

      {home && entries.length > 0 && (
        <>
          {/* ---- Next session ------------------------------------------- */}
          <section aria-labelledby="h-next" className="cl-panel">
            <div className="cl-ph">
              <h2 id="h-next" className="cl-pt">
                {phase === 'live' ? 'Live now' : 'Next session'}
              </h2>
              <Link href="/timetable" className="cl-glink">
                View schedule
              </Link>
            </div>
            {next ? (
              <div className="cl-sess">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={TEACHER_AVATAR} alt={TEACHER_NAME} className="cl-portrait" />
                <div className="min-w-0 flex-[1_1_240px]">
                  <div className="text-[17px]">{next.session.title}</div>
                  <div className="cl-muted mt-[3px] text-[14px]">
                    {whenText(next.session, now)} · {next.courseTitle}
                    {phase === 'soon' && ' · starting soon'}
                  </div>
                </div>
                {/* `meetingLink` is absent until T-30 — gated on its presence,
                    never on a client-computed window. */}
                {next.session.meetingLink ? (
                  <a
                    href={next.session.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cl-btnp cl-btnp--lg"
                  >
                    Join session
                  </a>
                ) : (
                  <span className="cl-muted text-[13.5px]">Link opens 30 min before</span>
                )}
              </div>
            ) : (
              <p className="cl-muted m-0 px-2 text-[14px]">No live session is scheduled yet.</p>
            )}
          </section>

          {/* ---- Recently due -------------------------------------------- */}
          <section aria-labelledby="h-due" className="cl-panel pb-4">
            <div className="cl-ph mb-2">
              <h2 id="h-due" className="cl-pt">
                Recently due
              </h2>
              <div className="flex items-center gap-4">
                <Link href="/homework" className="cl-glink">
                  View all work
                </Link>
                <button
                  type="button"
                  className="cl-gib"
                  aria-label={dueOpen ? 'Collapse section' : 'Expand section'}
                  aria-expanded={dueOpen}
                  onClick={() => setDueOpen((v) => !v)}
                >
                  <ClIcon name={dueOpen ? 'collapse' : 'expand'} small />
                </button>
              </div>
            </div>
            {dueOpen &&
              (due.length > 0 ? (
                <>
                  {due.slice(0, MAX_DUE).map((row) => (
                    <Link key={row.key} href={row.href} className="cl-grow">
                        <span className={`cl-ic40 ${row.tone}`}>
                          <ClIcon name={row.icon} small />
                        </span>
                        <span className="cl-grow-main truncate">{row.title}</span>
                        <span className="shrink-0 text-[14px]" style={{ color: RIGHT_COLOR[row.rightTone] }}>
                          {row.right}
                        </span>
                    </Link>
                  ))}
                  {due.length > MAX_DUE && (
                    <p className="cl-muted m-0 mt-2 px-2 text-[13px]">
                      {due.length - MAX_DUE} more ·{' '}
                      <Link href="/homework" className="cl-glink text-[13px]">
                        View all work
                      </Link>
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center px-0 pb-3 pt-4 text-center">
                  <span className="cl-ic40 cl-ic56 cl-tone-mint">
                    <ClIcon name="check" small size={24} />
                  </span>
                  <div className="mt-2.5 text-[15px]">You&apos;re all caught up</div>
                  <div className="cl-muted mt-1 text-[13.5px]">New work from Dr. Tahir will appear here</div>
                </div>
              ))}
          </section>

          {/* ---- Continue watching (kept from the old Overview) ------------ */}
          {resume.length > 0 && (
            <section aria-labelledby="h-watch" className="cl-panel pb-4">
              <div className="cl-ph mb-2">
                <h2 id="h-watch" className="cl-pt">
                  Continue watching
                </h2>
                <Link href="/lessons" className="cl-glink">
                  All recordings
                </Link>
              </div>
              {resume.map(({ recording, courseTitle }) => {
                const pct =
                  recording.durationSeconds > 0
                    ? Math.min(100, (recording.watchedSeconds / recording.durationSeconds) * 100)
                    : 0;
                return (
                  <Link key={recording.id} href={`/lessons/${recording.id}`} className="cl-grow">
                    <span className="cl-ic40 cl-tone-sky">
                      <ClIcon name="play" small />
                    </span>
                    <span className="cl-grow-main">
                      <span className="block truncate">{recording.title}</span>
                      <span className="cl-sub">
                        {courseTitle} · {recording.chapter}
                      </span>
                      {/* Completion, never a score (CLAUDE.md §11.1.2). */}
                      {recording.watchedSeconds > 0 && (
                        <span className="cl-bar mt-2 block max-w-[240px]" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${recording.title} watched`}>
                          <span style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="cl-btns shrink-0">{recording.watchedSeconds > 0 ? 'Resume' : 'Start'}</span>
                  </Link>
                );
              })}
            </section>
          )}

          {/* ---- Progress ------------------------------------------------ */}
          <section aria-labelledby="h-prog" className="cl-panel">
            <div className="cl-ph">
              <h2 id="h-prog" className="cl-pt">
                Progress
              </h2>
              <Link href="/marks" className="cl-glink">
                View reports
              </Link>
            </div>
            <div className="cl-stats">
              <Stat
                value={lessons.total > 0 ? formatPercent((lessons.done / lessons.total) * 100) : '—'}
                label={lessons.total > 0 ? `Lessons done · ${lessons.done} of ${lessons.total}` : 'Lessons done'}
              />
              <Stat
                value={attendance && attendance.expected > 0 ? formatPercent(attendance.percentage) : '—'}
                label={
                  attendance && attendance.expected > 0
                    ? `Attendance · ${attendance.present} of ${attendance.expected}`
                    : 'Attendance'
                }
              />
              <Stat value={String(pending)} label="Work to do" />
              <Stat value={String(newRecordings)} label="New recordings" />
            </div>
          </section>

          {/* ---- My courses ---------------------------------------------- */}
          <section aria-labelledby="h-courses" className="cl-panel">
            <div className="cl-ph mb-5">
              <h2 id="h-courses" className="cl-pt">
                {entries.length === 1 ? 'My course' : 'My courses'}
              </h2>
            </div>
            <div className="flex flex-wrap gap-4">
              {entries.map(({ course }, i) => {
                const c = CARD_COLORS[i % CARD_COLORS.length];
                const has = course.progress.totalLessons > 0;
                return (
                  <CourseLink key={course.id} courseId={course.id} href="/homework" className="cl-card">
                    <span className="cl-cardh" style={{ background: c.bg }}>
                      <span className="ring" style={{ background: c.ring }} />
                      <span className="cl-cardt">{course.title}</span>
                      <span className="cl-cards" style={{ color: 'var(--cl-blue-soft)' }}>
                        {course.teacherName}
                      </span>
                    </span>
                    <span className="block min-h-[72px] flex-1 p-4">
                      <span className="cl-muted flex justify-between text-[13px]">
                        <span>Course completion</span>
                        <span>{has ? formatPercent(course.progress.completionPercentage) : '—'}</span>
                      </span>
                      <span className="cl-bar mt-2 block">
                        <span style={{ width: `${has ? course.progress.completionPercentage : 0}%` }} />
                      </span>
                      <span className="cl-muted mt-2 block text-[12.5px]">
                        {has
                          ? `${course.progress.completedLessons} of ${course.progress.totalLessons} lessons done`
                          : 'No recordings published yet'}
                      </span>
                    </span>
                    <span className="cl-cardf">Open course →</span>
                  </CourseLink>
                );
              })}
            </div>
          </section>

          {/* ---- Materials ----------------------------------------------- */}
          <section aria-labelledby="h-mat" className="cl-panel pb-4">
            <div className="cl-ph mb-2">
              <h2 id="h-mat" className="cl-pt">
                Materials
              </h2>
              <span className="cl-muted text-[14px]">Notes and files</span>
            </div>
            {entries.length === 1
              ? (Object.keys(MATERIAL_CATEGORY_LABEL) as MaterialCategory[]).map((cat) => (
                  <CourseLink
                    key={cat}
                    courseId={entries[0].course.id}
                    href={`/materials?category=${cat}`}
                    className="cl-grow"
                  >
                    <span className={`cl-ic40 ${MATERIAL_TONE[cat]}`}>
                      <ClIcon name={MATERIAL_ICON[cat]} small />
                    </span>
                    <span className="cl-grow-main">{MATERIAL_CATEGORY_LABEL[cat]}</span>
                    <span className="cl-muted text-[14px]">{entries[0].quickAccess[cat] ?? 0}</span>
                  </CourseLink>
                ))
              : entries.map((e) => (
                  <CourseLink key={e.course.id} courseId={e.course.id} href="/materials" className="cl-grow">
                    <span className="cl-ic40 cl-tone-sand">
                      <ClIcon name="folder" small />
                    </span>
                    <span className="cl-grow-main">
                      {e.course.title}
                      <span className="cl-sub">{e.course.teacherName}</span>
                    </span>
                    <span className="cl-muted text-[14px]">
                      {Object.values(e.quickAccess).reduce((sum, n) => sum + n, 0)}
                    </span>
                  </CourseLink>
                ))}
          </section>
        </>
      )}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="cl-stat-v">{value}</div>
      <div className="cl-stat-k">{label}</div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <span className="sr-only">Loading your courses</span>
      {[120, 220, 120].map((h, i) => (
        <div key={i} className="cl-panel">
          <div className="cl-skel mb-4 h-6 w-40" />
          <div className="cl-skel" style={{ height: h - 40 }} />
        </div>
      ))}
    </div>
  );
}
