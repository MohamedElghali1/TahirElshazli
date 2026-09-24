import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarBlankIcon,
  ChatCircleTextIcon,
  FilePdfIcon,
  LockSimpleIcon,
  PlayCircleIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react/dist/ssr';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { ApiError, api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import type { PublicCourseDetail } from '@/lib/types';
import { INSTRUCTOR } from '@/lib/site-content';

const shell = 'mx-auto w-full max-w-[1200px] px-6';

/** Hours to one decimal below ten, whole above. "1.5 hours", "14 hours". */
const hoursLabel = (seconds: number) => {
  const hours = seconds / 3600;
  return hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : String(Math.round(hours));
};

/**
 * Not statically generated. The previous version prerendered a fixed list of
 * invented slugs; the real list lives in the database and changes when Dr.
 * Tahir publishes a course, which is exactly what a build-time list cannot
 * know. `api.publicCourses.get` revalidates on a five-minute window instead,
 * so these are still cached pages - just not frozen ones.
 */
async function loadCourse(slug: string): Promise<PublicCourseDetail | null> {
  try {
    return await api.publicCourses.get(slug);
  } catch (cause) {
    // A 404 is a real answer - the course is unpublished or does not exist,
    // and both must render the same not-found page (CLAUDE.md §5.11). Anything
    // else is our outage, and surfacing it as "no such course" would tell a
    // visitor their bookmark is dead when it is not.
    if (cause instanceof ApiError && cause.isNotFound) return null;
    throw cause;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await loadCourse(slug);
  if (!course) return { title: 'Course not found' };
  return {
    title: course.title,
    description: course.description.slice(0, 160),
  };
}

/**
 * What a place buys. Constant across courses because none of it is per-course
 * data yet - when it becomes so, it comes from the API rather than from here.
 */
const INCLUDED = [
  {
    Icon: VideoCameraIcon,
    title: 'Recorded lessons',
    body: 'Every class recorded and kept for the length of the course, filterable by chapter and topic.',
  },
  {
    Icon: CalendarBlankIcon,
    title: 'Live sessions',
    body: 'Timetabled classes with the meeting link posted to your dashboard, plus an attendance record.',
  },
  {
    Icon: FilePdfIcon,
    title: 'Notes and papers',
    body: 'Course notes, study material and past papers, sorted and downloadable.',
  },
  {
    Icon: ChatCircleTextIcon,
    title: 'Marked work',
    body: 'Assignments returned annotated with a mark and written feedback, attached to your submission.',
  },
] as const;

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await loadCourse(slug);
  if (!course) notFound();

  const showHours = course.totalDurationSeconds >= 1800;

  return (
    <>
      {/* --- Header ------------------------------------------------------- */}
      <section
        className={`${shell} grid items-end gap-8 pb-12 pt-16 lg:grid-cols-[3fr_2fr] lg:gap-16 lg:pt-24`}
      >
        <div>
          <h1 className="text-[clamp(2.25rem,5vw,var(--fs-marketing-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
            {course.title}
          </h1>
          <p className="mt-6 max-w-[65ch] text-m-lead leading-[1.65] text-fg-2">
            {course.description}
          </p>
          <p className="mt-6 text-m-body text-fg-3">
            Taught by{' '}
            <span className="text-fg">{course.teacherName}</span>
          </p>

          {/* The counted facts a buyer scans for first, repeated from the
              syllabus stats below because a header is where marketplace UX
              expects them - not a second claim, the same numbers twice. */}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-m-body text-fg-2">
            <div className="flex gap-1">
              <dt className="sr-only">Lessons</dt>
              <dd className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
                {course.lessonCount}
              </dd>
              <dd>{course.lessonCount === 1 ? 'lesson' : 'lessons'}</dd>
            </div>
            {showHours && (
              <div className="flex gap-1">
                <dt className="sr-only">Video</dt>
                <dd className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
                  {hoursLabel(course.totalDurationSeconds)}
                </dd>
                <dd>hours of video</dd>
              </div>
            )}
          </dl>
        </div>

        {course.thumbnailUrl && (
          <figure className="relative aspect-[4/3] overflow-hidden rounded-md border border-[var(--border-medium)]">
            <Image
              src={course.thumbnailUrl}
              alt=""
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 440px"
              className="object-cover"
            />
          </figure>
        )}
      </section>

      {/* --- Syllabus, and the one panel that asks for the enrollment ------ */}
      <div
        className={`${shell} grid items-start gap-12 pb-24 lg:grid-cols-[7fr_4fr] lg:gap-16`}
      >
        <div className="min-w-0">
          <h2 className="text-[clamp(1.5rem,3vw,var(--fs-marketing-h2))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
            What you will cover.
          </h2>
          <p className="mt-3 text-m-body text-fg-3">
            <Count n={course.moduleCount} one="chapter" many="chapters" />
            {' · '}
            <Count n={course.lessonCount} one="lesson" many="lessons" />
            {showHours && (
              <>
                {' · '}
                <span className="font-[family-name:var(--font-mono)] tabular-nums text-fg-2">
                  {hoursLabel(course.totalDurationSeconds)}
                </span>{' '}
                hours
              </>
            )}
          </p>

          {course.modules.length === 0 ? (
            <p className="mt-8 rounded-md border border-[var(--border-medium)] p-6 text-m-body text-fg-2">
              The chapter list for this course is being finalised.
            </p>
          ) : (
            <div className="mt-8 overflow-hidden rounded-md border border-[var(--border-medium)]">
              {course.modules.map((module, i) => (
                /* Native <details>: keyboard-operable, reachable by the
                   browser's own in-page search, and open without JavaScript.
                   The first chapter starts expanded so the page never opens on
                   a wall of closed rows. */
                <details
                  key={module.id}
                  open={i === 0}
                  className="group border-b border-[var(--border-light)] last:border-b-0"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-surface-2 px-6 py-4 transition-colors duration-[var(--dur-fast)] hover:bg-surface-3 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="text-m-body uppercase tracking-[0.06em] text-fg-3">
                        {module.chapter}
                      </p>
                      <p className="mt-[2px] text-m-body font-medium text-fg">
                        {module.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-m-body text-fg-3">
                        {module.lessons.length}{' '}
                        {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                      </span>
                      <span aria-hidden className="relative h-4 w-4">
                        <span className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-fg-3" />
                        <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 bg-fg-3 transition-transform duration-[var(--dur-fast)] ease-[var(--ease)] group-open:rotate-90 group-open:opacity-0" />
                      </span>
                    </div>
                  </summary>

                  {module.lessons.length === 0 ? (
                    <p className="border-t border-[var(--border-light)] px-6 py-4 text-m-body text-fg-3">
                      Lessons for this chapter are still being added.
                    </p>
                  ) : (
                    <ul>
                      {module.lessons.map((lesson) => (
                        /* Every row is locked, because every reader of this
                           page is signed out or not yet enrolled. The title is
                           the argument for enrolling and the lock is the reason
                           to. Nothing here is a link: the gate is the absence
                           of an href, not a click handler that says no. */
                        <li
                          key={lesson.id}
                          className="flex items-center gap-4 border-t border-[var(--border-light)] px-6 py-3"
                        >
                          <PlayCircleIcon
                            size={18}
                            aria-hidden
                            className="shrink-0 text-fg-4"
                          />
                          <span className="min-w-0 flex-1 truncate text-m-body text-fg-2">
                            {lesson.title}
                          </span>
                          {lesson.durationSeconds > 0 && (
                            <span className="shrink-0 font-[family-name:var(--font-mono)] text-m-body tabular-nums text-fg-3">
                              {formatDuration(lesson.durationSeconds)}
                            </span>
                          )}
                          <LockSimpleIcon
                            size={14}
                            aria-label="Locked until you enroll"
                            className="shrink-0 text-fg-4"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              ))}
            </div>
          )}

          <h2 className="mt-24 text-[clamp(1.5rem,3vw,var(--fs-marketing-h2))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
            Included with every place.
          </h2>
          <div className="mt-8 grid gap-x-12 sm:grid-cols-2">
            {INCLUDED.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-4 border-t border-[var(--border-light)] py-6"
              >
                <Icon
                  size={22}
                  aria-hidden
                  className="mt-[2px] shrink-0 text-fg-3"
                />
                <div>
                  <h3 className="text-m-body font-medium text-fg">
                    {title}
                  </h3>
                  <p className="mt-2 text-m-body leading-[1.65] text-fg-2">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Outcomes: general rather than per-course, tied only to facts the
              API actually carries (in-platform marking, progress tracking).
              `PublicCourseDetail` has no learning-mode field for an
              anonymous visitor (retired by migration `012`) and no "level"
              or "exam board" column either, so nothing here is claimed per
              format or audience that the backend cannot back up. */}
          <h2 className="mt-24 text-[clamp(1.5rem,3vw,var(--fs-marketing-h2))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
            What you will be able to do.
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              'Work through lessons and recordings at your own pace, on any device',
              'Rewatch any session or lesson whenever you need to',
              'Submit work and see your average update as it is marked',
              'Track completion and performance as two separate numbers, never blended',
            ].map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 rounded-md border border-[var(--border-light)] bg-surface-2 p-4 text-m-body leading-[1.65] text-fg-2"
              >
                <span aria-hidden className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--accent)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky on desktop so it stays reachable through a long syllabus;
            static on mobile, where a stuck panel would eat the viewport. */}
        <Reveal className="lg:sticky lg:top-[calc(72px+24px)]">
          <aside className="rounded-md border border-accent bg-[var(--accent-wash)] p-8">
            <h2 className="text-m-lead font-semibold tracking-[-0.01em] text-fg">
              This course includes
            </h2>

            <dl className="mt-6 flex flex-col gap-3 text-m-body">
              <Stat label="Chapters" value={String(course.moduleCount)} />
              <Stat label="Lessons" value={String(course.lessonCount)} />
              {showHours && (
                <Stat
                  label="Video"
                  value={`${hoursLabel(course.totalDurationSeconds)} hours`}
                />
              )}
            </dl>

            {/* Enrollment is free while payment is unbuilt (CLAUDE.md §7.2).
                When a gateway lands it sits in front of this button, and the
                copy changes here rather than anywhere else.
                No `next` param: registration joins the waiting queue rather
                than an enrollment on this course (`SHELL-5`), so there is
                nothing course-specific to return to once signed in. */}
            <ButtonLink
              href="/register"
              variant="primary"
              size="medium"
              className="mt-8 w-full"
            >
              Create an account to enroll
            </ButtonLink>
            <p className="mt-4 text-center text-m-body text-fg-2">
              Already have one?{' '}
              <Link href="/login" className="text-fg underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </aside>
        </Reveal>
      </div>

      {/* Instructor credibility. Only rendered when the course's real
          `teacherName` matches the one bio the site has - the moment a
          second teacher exists this either needs a per-teacher bio from the
          API or drops silently, never a mismatched name under a photo. */}
      {course.teacherName === INSTRUCTOR.name && (
        <section className="border-t border-[var(--border-light)] bg-surface-2 py-16">
          <div className={`${shell} flex flex-col items-center gap-8 sm:flex-row sm:items-start`}>
            <Image
              src={INSTRUCTOR.image}
              alt={INSTRUCTOR.name}
              width={96}
              height={96}
              className="h-[96px] w-[96px] shrink-0 rounded-full border border-[var(--border-medium)] object-cover"
            />
            <div>
              <p className="text-m-body text-fg-3">Taught by</p>
              <h2 className="mt-[2px] text-m-lead font-semibold tracking-[-0.01em] text-fg">
                {INSTRUCTOR.name}
              </h2>
              <p className="mt-3 max-w-[65ch] text-m-body leading-[1.65] text-fg-2">
                {INSTRUCTOR.bio}
              </p>
              <Link
                href="/about"
                className="mt-3 inline-block text-m-body font-medium text-fg underline underline-offset-4"
              >
                More about Dr. Tahir
              </Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <>
      <span className="font-[family-name:var(--font-mono)] tabular-nums text-fg-2">
        {n}
      </span>{' '}
      {n === 1 ? one : many}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-accent pb-3 last:border-b-0 last:pb-0">
      <dt className="text-fg-2">{label}</dt>
      <dd className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
        {value}
      </dd>
    </div>
  );
}
