'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRightIcon, CheckIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import type { CatalogItem } from '@/lib/types';
import {
  Button,
  ButtonLink,
  Chip,
  EmptyState,
  ErrorState,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

/**
 * The in-app course catalog: every course on the platform, with the ones the
 * student already holds marked as such.
 *
 * Distinct from the public /courses page, which is marketing copy for
 * visitors and has no account behind it. This one is the product surface -
 * signed in, backed by the API, and the only place an enrollment is created.
 *
 * Enrollment is free at this stage. When the payment gateway lands (CLAUDE.md
 * §7, "Later / on request") it goes in front of this button, not in place of
 * it - the POST it calls stays the same.
 */
export default function CatalogPage() {
  const { token } = useSession();
  const router = useRouter();
  const { data, error, loading, reload } = useApi(
    (t) => api.courses.catalog(t),
    [],
  );

  /** The course id currently being enrolled, so only its own button spins. */
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function enroll(courseId: string) {
    if (!token) return;
    setPending(courseId);
    setFailure(null);
    try {
      await api.courses.enroll(token, courseId);
      // Straight to the course rather than back to a list that would need
      // refetching to show the change. `refresh` clears the router cache so
      // the dashboard behind it is not the pre-enrollment copy.
      router.refresh();
      router.push(`/learn/${courseId}`);
    } catch (cause) {
      setFailure(
        cause instanceof ApiError
          ? cause.message
          : 'Could not enroll you on that course. Please try again.',
      );
      setPending(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Browse courses"
        subtitle="Everything Dr. Tahir is teaching. Enroll to add a course to your dashboard."
      />
      <PageBody className="flex flex-col gap-[var(--sp-4)]">
        {loading && <RowsSkeleton rows={3} />}

        {error && <ErrorState message={error.message} onRetry={reload} />}

        {failure && (
          <p
            role="alert"
            className="rounded-[var(--r-md)] border border-[var(--chip-red-bg)] bg-[var(--chip-red-bg)] px-[var(--sp-4)] py-[var(--sp-3)] text-[var(--fs-base)] text-[var(--chip-red-fg)]"
          >
            {failure}
          </p>
        )}

        {data && data.length === 0 && (
          <EmptyState
            title="No courses published yet"
            body="Nothing is open for enrollment at the moment. Get in touch and we will tell you when the next term opens."
            action={
              <ButtonLink href="/contact" variant="primary">
                Contact us
              </ButtonLink>
            }
          />
        )}

        {data && data.length > 0 && (
          <div className="grid gap-[var(--sp-4)] lg:grid-cols-2">
            {data.map((course) => (
              <CatalogCard
                key={course.id}
                course={course}
                pending={pending === course.id}
                // One enrollment at a time: a second click while the first is
                // in flight is a double-submit, not a second intention.
                disabled={pending !== null && pending !== course.id}
                onEnroll={() => void enroll(course.id)}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

function CatalogCard({
  course,
  pending,
  disabled,
  onEnroll,
}: {
  course: CatalogItem;
  pending: boolean;
  disabled: boolean;
  onEnroll: () => void;
}) {
  const isRecorded = course.learningMode === 'recorded';

  return (
    <article className="flex flex-col rounded-[var(--r-md)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)]">
      <div className="flex items-start justify-between gap-[var(--sp-3)]">
        <div className="min-w-0">
          <h2 className="truncate text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
            {course.title}
          </h2>
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

      <p className="num mt-[var(--sp-3)] text-[var(--fs-xxs)] text-[var(--fg-muted)]">
        {course.moduleCount} {course.moduleCount === 1 ? 'chapter' : 'chapters'}
        {' · '}
        {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
      </p>

      <div className="mt-[var(--sp-4)] flex items-center justify-between gap-[var(--sp-3)] border-t border-[var(--border-light)] pt-[var(--sp-4)]">
        {course.enrolled ? (
          <>
            <span className="inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              <CheckIcon size={14} weight="bold" />
              Already enrolled
            </span>
            <Link
              href={`/learn/${course.id}`}
              className="inline-flex items-center gap-[var(--sp-1)] text-[var(--fs-base)] font-medium text-[var(--fg-primary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--accent)]"
            >
              Open course
              <ArrowRightIcon size={14} />
            </Link>
          </>
        ) : (
          <>
            <span className="text-[var(--fs-xs)] text-[var(--fg-muted)]">
              Free while we are in testing
            </span>
            <Button
              variant="primary"
              loading={pending}
              disabled={disabled}
              onClick={onEnroll}
            >
              Enroll
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
