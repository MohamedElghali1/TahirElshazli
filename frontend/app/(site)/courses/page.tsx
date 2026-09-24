import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { CourseCard } from '@/components/site/course-card';
import { CatalogEmpty, CatalogUnavailable } from '@/components/site/catalog-states';
import { CourseFilters } from '@/components/site/course-filters';
import { fetchCatalog } from '@/lib/catalog';
import type { PublicCourseSummary } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Courses',
  description:
    'IGCSE English and IELTS preparation courses with Dr. Tahir Elshazli. Live timetabled classes and recorded lessons, with every assignment marked and returned.',
};

const shell = 'mx-auto w-full max-w-[1200px] px-6';

/**
 * Filtering runs in the URL, not in component state: `?q=chemistry` is
 * shareable, survives a reload, and renders on the server, so a crawler sees
 * the filtered page too.
 *
 * It also filters the array in memory rather than passing the query to the API.
 * That is right for a catalog of this size - the whole thing is one response,
 * capped at 100 - and wrong the moment it is not. The cap in
 * `PublicCoursesService` is what makes that transition visible.
 *
 * No Recorded/Live filter: `PublicCourseSummary` carries no learning-mode
 * field (retired from the course model by migration `012` - see
 * `docs/CHANGELOG.md`) - filtering on a field the wire shape does not have
 * would silently match nothing, which is worse than not offering it.
 */
function applyFilters(
  courses: PublicCourseSummary[],
  query: string | undefined,
): PublicCourseSummary[] {
  const needle = query?.trim().toLowerCase();
  if (!needle) return courses;
  return courses.filter(
    (course) =>
      course.title.toLowerCase().includes(needle) ||
      course.description.toLowerCase().includes(needle),
  );
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, courses] = await Promise.all([
    searchParams,
    fetchCatalog(),
  ]);
  const filtered = courses ? applyFilters(courses, q) : [];

  return (
    <>
      <section className={`${shell} pb-12 pt-16 lg:pt-24`}>
        <h1 className="max-w-[16ch] text-[clamp(2.25rem,5vw,var(--fs-marketing-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
          Every course, and what is in it.
        </h1>
        <p className="mt-6 max-w-[56ch] text-m-lead leading-[1.65] text-fg-2">
          Each course is taught by Dr. Tahir directly. Open any one to read the
          full chapter and lesson list before you enroll.
        </p>
      </section>

      {courses === null ? (
        <div className={`${shell} pb-24`}>
          <CatalogUnavailable />
        </div>
      ) : courses.length === 0 ? (
        <div className={`${shell} pb-24`}>
          <CatalogEmpty />
        </div>
      ) : (
        <>
          <div className={`${shell} pb-8`}>
            <CourseFilters
              query={q}
              total={courses.length}
              shown={filtered.length}
            />
          </div>

          <div className={`${shell} pb-24`}>
            {filtered.length === 0 ? (
              <div className="rounded-md border border-[var(--border-medium)] bg-surface-2 p-12">
                <p className="text-m-lead text-fg">
                  No courses match that.
                </p>
                <p className="mt-3 max-w-[52ch] text-m-body leading-[1.65] text-fg-2">
                  Try clearing the filters, or tell us what you are preparing
                  for and we will point you at the right one.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href="/courses" variant="primary" size="medium">
                    Clear filters
                  </ButtonLink>
                  <ButtonLink href="/contact" variant="secondary" size="medium">
                    Contact us
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

      <section className="border-t border-[var(--border-light)] bg-surface-2 py-16">
        <div className={`${shell} flex flex-col items-start justify-between gap-6 md:flex-row md:items-center`}>
          <p className="max-w-[48ch] text-m-lead text-fg-2">
            Not sure which one fits? Send us the year group and the exam board
            and we will tell you.
          </p>
          <ButtonLink href="/contact" variant="primary" size="medium" className="shrink-0">
            Contact us
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
