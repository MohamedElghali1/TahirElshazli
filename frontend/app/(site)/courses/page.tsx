import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { CourseCard } from '@/components/site/course-card';
import { CatalogEmpty, CatalogUnavailable } from '@/components/site/catalog-states';
import { CourseFilters } from '@/components/site/course-filters';
import { fetchCatalog } from '@/lib/catalog';
import type { LearningMode, PublicCourseSummary } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Courses',
  description:
    'IGCSE English and IELTS preparation courses with Dr. Tahir Elshazli. Live timetabled classes and recorded lessons, with every assignment marked and returned.',
};

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

/**
 * Filtering runs in the URL, not in component state: `?mode=live&q=chemistry`
 * is shareable, survives a reload, and renders on the server, so a crawler sees
 * the filtered page too.
 *
 * It also filters the array in memory rather than passing the query to the API.
 * That is right for a catalog of this size - the whole thing is one response,
 * capped at 100 - and wrong the moment it is not. The cap in
 * `PublicCoursesService` is what makes that transition visible.
 */
function applyFilters(
  courses: PublicCourseSummary[],
  mode: string | undefined,
  query: string | undefined,
): PublicCourseSummary[] {
  const needle = query?.trim().toLowerCase();
  return courses.filter((course) => {
    if (mode === 'live' || mode === 'recorded') {
      if (course.learningMode !== (mode as LearningMode)) return false;
    }
    if (!needle) return true;
    return (
      course.title.toLowerCase().includes(needle) ||
      course.description.toLowerCase().includes(needle)
    );
  });
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; q?: string }>;
}) {
  const [{ mode, q }, courses] = await Promise.all([
    searchParams,
    fetchCatalog(),
  ]);
  const filtered = courses ? applyFilters(courses, mode, q) : [];

  return (
    <>
      <section className={`${shell} pb-[var(--sp-12)] pt-[var(--sp-16)] lg:pt-[var(--sp-24)]`}>
        <h1 className="max-w-[16ch] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
          Every course, and what is in it.
        </h1>
        <p className="mt-[var(--sp-6)] max-w-[56ch] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-fg-2">
          Each course is taught by Dr. Tahir directly. Open any one to read the
          full chapter and lesson list before you enroll.
        </p>
      </section>

      {courses === null ? (
        <div className={`${shell} pb-[var(--sp-24)]`}>
          <CatalogUnavailable />
        </div>
      ) : courses.length === 0 ? (
        <div className={`${shell} pb-[var(--sp-24)]`}>
          <CatalogEmpty />
        </div>
      ) : (
        <>
          <div className={`${shell} pb-[var(--sp-8)]`}>
            <CourseFilters
              mode={mode}
              query={q}
              total={courses.length}
              shown={filtered.length}
            />
          </div>

          <div className={`${shell} pb-[var(--sp-24)]`}>
            {filtered.length === 0 ? (
              <div className="rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-12)]">
                <p className="text-[var(--fs-lead)] text-fg">
                  No courses match that.
                </p>
                <p className="mt-[var(--sp-3)] max-w-[52ch] text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
                  Try clearing the filters, or tell us what you are preparing
                  for and we will point you at the right one.
                </p>
                <div className="mt-[var(--sp-8)] flex flex-wrap gap-[var(--sp-3)]">
                  <ButtonLink href="/courses" variant="primary" size="lg">
                    Clear filters
                  </ButtonLink>
                  <ButtonLink href="/contact" variant="secondary" size="lg">
                    Contact us
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="grid gap-[var(--sp-6)] md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((course, i) => (
                  <Reveal key={course.id} delay={Math.min(i, 5) * 0.06}>
                    <CourseCard course={course} />
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <section className="border-t border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-16)]">
        <div className={`${shell} flex flex-col items-start justify-between gap-[var(--sp-6)] md:flex-row md:items-center`}>
          <p className="max-w-[48ch] text-[var(--fs-lead)] text-fg-2">
            Not sure which one fits? Send us the year group and the exam board
            and we will tell you.
          </p>
          <ButtonLink href="/contact" variant="primary" size="lg" className="shrink-0">
            Contact us
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
