import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr';
import type { PublicCourseSummary } from '@/lib/types';

/**
 * The public course card - the unit the landing page and the course index are
 * both built from, so a course reads the same wherever a visitor meets it.
 *
 * It carries no price. CLAUDE.md §6.1 has `Course` gaining a monthly price
 * eventually, but the column does not exist and inventing a number on a
 * marketing page is the one lie a catalog must not tell. Enrollment is free
 * today (§7.2) and the card says so by saying nothing.
 */

/** Hours, rounded, because "18h" is what a buyer compares. Minutes below an hour. */
function courseLength(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Length to be confirmed';
  const hours = totalSeconds / 3600;
  if (hours < 1) return `${Math.round(totalSeconds / 60)} min of video`;
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} hours of video`;
}

/**
 * Courses have no artwork yet (`thumbnail_url` is null on every seeded row), so
 * the empty state is designed rather than left to a grey box: the course
 * initials set large in the mono face over the accent wash. It reads as
 * deliberate, and it stops being used the moment real photography lands.
 */
function Fallback({ title }: { title: string }) {
  const mark = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-[var(--accent-wash)]"
    >
      <span className="font-[family-name:var(--font-mono)] text-[clamp(2rem,6vw,3.25rem)] font-medium tracking-[-0.04em] text-accent opacity-70">
        {mark}
      </span>
    </div>
  );
}

export function CourseCard({ course }: { course: PublicCourseSummary }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-primary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-[var(--border-light)]">
        {course.thumbnailUrl ? (
          <Image
            src={course.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out)] group-hover:scale-[1.03]"
          />
        ) : (
          <Fallback title={course.title} />
        )}
      </div>

      <div className="flex flex-1 flex-col p-[var(--sp-6)]">
        <h3 className="text-[var(--fs-h3)] font-semibold leading-[1.2] tracking-[-0.01em] text-fg">
          {/* The whole card is one target, but only the title carries the href -
              a nested-link card is unreadable to a screen reader. */}
          <Link
            href={`/courses/${course.slug}`}
            /* A stretched link: the anchor is the title, but its ::after covers
               the whole card so the card is one target. Suppressing the
               anchor's own outline is right - it would ring the title text
               mid-card - but the outline has to move to the ::after box or a
               keyboard user gets no focus indicator at all. */
            className="after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--accent)]"
          >
            {course.title}
          </Link>
        </h3>

        <p className="mt-[var(--sp-3)] line-clamp-2 text-[var(--fs-base)] leading-[var(--lh-loose)] text-fg-2">
          {course.description}
        </p>

        <p className="mt-[var(--sp-4)] text-[var(--fs-base)] text-fg-3">
          {course.teacherName}
        </p>

        <dl className="mt-[var(--sp-6)] flex flex-wrap items-center gap-x-[var(--sp-3)] gap-y-[var(--sp-2)] border-t border-[var(--border-light)] pt-[var(--sp-4)] text-[var(--fs-base)] text-fg-2">
          <div className="flex gap-[var(--sp-1)]">
            <dt className="sr-only">Lessons</dt>
            <dd className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
              {course.lessonCount}
            </dd>
            <dd>{course.lessonCount === 1 ? 'lesson' : 'lessons'}</dd>
          </div>
          <span aria-hidden className="text-fg-4">·</span>
          <div className="flex gap-[var(--sp-1)]">
            <dt className="sr-only">Chapters</dt>
            <dd className="font-[family-name:var(--font-mono)] tabular-nums text-fg">
              {course.moduleCount}
            </dd>
            <dd>{course.moduleCount === 1 ? 'chapter' : 'chapters'}</dd>
          </div>
        </dl>

        <p className="mt-[var(--sp-2)] text-[var(--fs-base)] text-fg-3">
          {courseLength(course.totalDurationSeconds)}
        </p>

        <span className="mt-[var(--sp-6)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] font-medium text-fg transition-colors duration-[var(--dur-fast)] group-hover:text-accent">
          View course
          <ArrowRightIcon size={16} className="transition-transform duration-[var(--dur-fast)] group-hover:translate-x-[2px]" />
        </span>
      </div>
    </article>
  );
}
