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
import { ModeBadge } from '@/components/site/course-card';
import { ApiError, api } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import type { PublicCourseDetail } from '@/lib/types';
import { INSTRUCTOR } from '@/lib/site-content';

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

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
  // Where a visitor lands once they have an account: the in-app catalog, which
  // is the only screen that can actually create an enrollment.
  const next = encodeURIComponent('/catalog');

  return (
    <>
      {/* --- Header ------------------------------------------------------- */}
      <section
        className={`${shell} grid items-end gap-[var(--sp-8)] pb-[var(--sp-12)] pt-[var(--sp-16)] lg:grid-cols-[3fr_2fr] lg:gap-[var(--sp-16)] lg:pt-[var(--sp-24)]`}
      >
        <div>
          <ModeBadge mode={course.learningMode} />
          <h1 className="mt-[var(--sp-4)] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--fg-primary)]">
            {course.title}
          </h1>
          <p className="mt-[var(--sp-6)] max-w-[var(--maxw-prose)] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
            {course.description}
          </p>
          <p className="mt-[var(--sp-6)] text-[var(--fs-body)] text-[var(--fg-tertiary)]">
            Taught by{' '}
            <span className="text-[var(--fg-primary)]">{course.teacherName}</span>
          </p>

          {/* The counted facts a buyer scans for first, repeated from the
              syllabus stats below because a header is where marketplace UX
              expects them - not a second claim, the same numbers twice. */}
          <dl className="mt-[var(--sp-6)] flex flex-wrap gap-x-[var(--sp-6)] gap-y-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)]">
            <div className="flex gap-[var(--sp-1)]">
              <dt className="sr-only">Lessons</dt>
              <dd className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-primary)]">
                {course.lessonCount}
              </dd>
              <dd>{course.lessonCount === 1 ? 'lesson' : 'lessons'}</dd>
            </div>
            {showHours && (
              <div className="flex gap-[var(--sp-1)]">
                <dt className="sr-only">Video</dt>
                <dd className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-primary)]">
                  {hoursLabel(course.totalDurationSeconds)}
                </dd>
                <dd>hours of video</dd>
              </div>
            )}
          </dl>
        </div>

        {course.thumbnailUrl && (
          <figure className="relative aspect-[4/3] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)]">
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
        className={`${shell} grid items-start gap-[var(--sp-12)] pb-[var(--sp-24)] lg:grid-cols-[7fr_4fr] lg:gap-[var(--sp-16)]`}
      >
        <div className="min-w-0">
          <h2 className="text-[clamp(1.5rem,3vw,var(--fs-h2))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
            What you will cover.
          </h2>
          <p className="mt-[var(--sp-3)] text-[var(--fs-body)] text-[var(--fg-tertiary)]">
            <Count n={course.moduleCount} one="chapter" many="chapters" />
            {' · '}
            <Count n={course.lessonCount} one="lesson" many="lessons" />
            {showHours && (
              <>
                {' · '}
                <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-secondary)]">
                  {hoursLabel(course.totalDurationSeconds)}
                </span>{' '}
                hours
              </>
            )}
          </p>

          {course.modules.length === 0 ? (
            <p className="mt-[var(--sp-8)] rounded-[var(--r-md)] border border-[var(--border-medium)] p-[var(--sp-6)] text-[var(--fs-body)] text-[var(--fg-secondary)]">
              The chapter list for this course is being finalised.
            </p>
          ) : (
            <div className="mt-[var(--sp-8)] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)]">
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
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-[var(--sp-4)] bg-[var(--bg-secondary)] px-[var(--sp-6)] py-[var(--sp-4)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-tertiary)] [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="text-[var(--fs-base)] uppercase tracking-[0.06em] text-[var(--fg-tertiary)]">
                        {module.chapter}
                      </p>
                      <p className="mt-[2px] text-[var(--fs-body)] font-medium text-[var(--fg-primary)]">
                        {module.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-[var(--sp-4)]">
                      <span className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
                        {module.lessons.length}{' '}
                        {module.lessons.length === 1 ? 'lesson' : 'lessons'}
                      </span>
                      <span aria-hidden className="relative h-[var(--sp-4)] w-[var(--sp-4)]">
                        <span className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-[var(--fg-tertiary)]" />
                        <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 bg-[var(--fg-tertiary)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease)] group-open:rotate-90 group-open:opacity-0" />
                      </span>
                    </div>
                  </summary>

                  {module.lessons.length === 0 ? (
                    <p className="border-t border-[var(--border-light)] px-[var(--sp-6)] py-[var(--sp-4)] text-[var(--fs-base)] text-[var(--fg-tertiary)]">
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
                          className="flex items-center gap-[var(--sp-4)] border-t border-[var(--border-light)] px-[var(--sp-6)] py-[var(--sp-3)]"
                        >
                          <PlayCircleIcon
                            size={18}
                            aria-hidden
                            className="shrink-0 text-[var(--fg-muted)]"
                          />
                          <span className="min-w-0 flex-1 truncate text-[var(--fs-body)] text-[var(--fg-secondary)]">
                            {lesson.title}
                          </span>
                          {lesson.durationSeconds > 0 && (
                            <span className="shrink-0 font-[family-name:var(--font-mono)] text-[var(--fs-base)] tabular-nums text-[var(--fg-tertiary)]">
                              {formatDuration(lesson.durationSeconds)}
                            </span>
                          )}
                          <LockSimpleIcon
                            size={14}
                            aria-label="Locked until you enroll"
                            className="shrink-0 text-[var(--fg-muted)]"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              ))}
            </div>
          )}

          <h2 className="mt-[var(--sp-24)] text-[clamp(1.5rem,3vw,var(--fs-h2))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
            Included with every place.
          </h2>
          <div className="mt-[var(--sp-8)] grid gap-x-[var(--sp-12)] sm:grid-cols-2">
            {INCLUDED.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="flex gap-[var(--sp-4)] border-t border-[var(--border-light)] py-[var(--sp-6)]"
              >
                <Icon
                  size={22}
                  aria-hidden
                  className="mt-[2px] shrink-0 text-[var(--fg-tertiary)]"
                />
                <div>
                  <h3 className="text-[var(--fs-body)] font-medium text-[var(--fg-primary)]">
                    {title}
                  </h3>
                  <p className="mt-[var(--sp-2)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Outcomes: what changes for the student, tied to facts the API
              actually carries (mode, in-platform marking) rather than
              per-course claims the backend has no field for yet - there is
              no "level" or "exam board" column to draw a real audience line
              from, so this stays general rather than inventing one. */}
          <h2 className="mt-[var(--sp-24)] text-[clamp(1.5rem,3vw,var(--fs-h2))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
            What you will be able to do.
          </h2>
          <ul className="mt-[var(--sp-6)] grid gap-[var(--sp-3)] sm:grid-cols-2">
            {(course.learningMode === 'live'
              ? [
                  'Sit timetabled classes and ask questions live, with an attendance record your parent can see',
                  'Rewatch any session you attended, or catch up on one you missed',
                  'Submit work against a schedule and see your average update as it is marked',
                  'Track completion and performance as two separate numbers, never blended',
                ]
              : [
                  'Work through the recordings at your own pace, in order or by topic',
                  'Pick up exactly where you stopped, on any device',
                  'Submit work on your own schedule and see your average update as it is marked',
                  'Track completion and performance as two separate numbers, never blended',
                ]
            ).map((line) => (
              <li
                key={line}
                className="flex items-start gap-[var(--sp-3)] rounded-[var(--r-md)] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-[var(--sp-4)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]"
              >
                <span aria-hidden className="mt-[7px] h-[6px] w-[6px] shrink-0 rounded-[var(--r-full)] bg-[var(--accent)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky on desktop so it stays reachable through a long syllabus;
            static on mobile, where a stuck panel would eat the viewport. */}
        <Reveal className="lg:sticky lg:top-[calc(72px+var(--sp-6))]">
          <aside className="rounded-[var(--r-lg)] border border-[var(--accent-line)] bg-[var(--accent-wash)] p-[var(--sp-8)]">
            <h2 className="text-[var(--fs-h3)] font-semibold tracking-[-0.01em] text-[var(--fg-primary)]">
              This course includes
            </h2>

            <dl className="mt-[var(--sp-6)] flex flex-col gap-[var(--sp-3)] text-[var(--fs-body)]">
              <Stat label="Chapters" value={String(course.moduleCount)} />
              <Stat label="Lessons" value={String(course.lessonCount)} />
              {showHours && (
                <Stat
                  label="Video"
                  value={`${hoursLabel(course.totalDurationSeconds)} hours`}
                />
              )}
              <Stat
                label="Taught"
                value={course.learningMode === 'live' ? 'Live sessions' : 'Recorded'}
              />
            </dl>

            {/* Enrollment is free while payment is unbuilt (CLAUDE.md §7.2).
                When a gateway lands it sits in front of this button, and the
                copy changes here rather than anywhere else. */}
            <ButtonLink
              href={`/register?next=${next}`}
              variant="primary"
              size="lg"
              className="mt-[var(--sp-8)] w-full"
            >
              Create an account to enroll
            </ButtonLink>
            <p className="mt-[var(--sp-4)] text-center text-[var(--fs-base)] text-[var(--fg-secondary)]">
              Already have one?{' '}
              <Link
                href={`/login?next=${next}`}
                className="text-[var(--fg-primary)] underline underline-offset-4"
              >
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
        <section className="border-t border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-16)]">
          <div className={`${shell} flex flex-col items-center gap-[var(--sp-8)] sm:flex-row sm:items-start`}>
            <Image
              src={INSTRUCTOR.image}
              alt={INSTRUCTOR.name}
              width={96}
              height={96}
              className="h-[96px] w-[96px] shrink-0 rounded-[var(--r-full)] border border-[var(--border-medium)] object-cover"
            />
            <div>
              <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">Taught by</p>
              <h2 className="mt-[2px] text-[var(--fs-h3)] font-semibold tracking-[-0.01em] text-[var(--fg-primary)]">
                {INSTRUCTOR.name}
              </h2>
              <p className="mt-[var(--sp-3)] max-w-[var(--maxw-prose)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
                {INSTRUCTOR.bio}
              </p>
              <Link
                href="/about"
                className="mt-[var(--sp-3)] inline-block text-[var(--fs-body)] font-medium text-[var(--fg-primary)] underline underline-offset-4"
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
      <span className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-secondary)]">
        {n}
      </span>{' '}
      {n === 1 ? one : many}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--sp-4)] border-b border-[var(--accent-line)] pb-[var(--sp-3)] last:border-b-0 last:pb-0">
      <dt className="text-[var(--fg-secondary)]">{label}</dt>
      <dd className="font-[family-name:var(--font-mono)] tabular-nums text-[var(--fg-primary)]">
        {value}
      </dd>
    </div>
  );
}
