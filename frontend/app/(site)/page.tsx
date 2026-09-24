import Image from 'next/image';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { CourseCard } from '@/components/site/course-card';
import { CatalogEmpty, CatalogUnavailable } from '@/components/site/catalog-states';
import { fetchCatalog } from '@/lib/catalog';
import type { PublicCourseSummary } from '@/lib/types';
import { FAQS, PLATFORM, STAGES, TESTIMONIALS, photo } from '@/lib/site-content';

const shell = 'mx-auto w-full max-w-[1200px] px-6';

export default async function HomePage() {
  // One read, shared by the proof strip and the grid, so the homepage cannot
  // show "3 courses" above a grid holding two.
  const courses = await fetchCatalog();

  return (
    <>
      <Hero courses={courses} />
      <Courses courses={courses} />
      <HowItRuns />
      <Platform />
      <Voices />
      <Faq />
      <ClosingCta />
    </>
  );
}

/** "24 lessons · 14 hours of video" - counted, never asserted. */
function catalogFacts(courses: PublicCourseSummary[]) {
  const lessons = courses.reduce((n, c) => n + c.lessonCount, 0);
  const seconds = courses.reduce((n, c) => n + c.totalDurationSeconds, 0);
  const hours = Math.round(seconds / 3600);
  return [
    { value: courses.length, label: courses.length === 1 ? 'course' : 'courses' },
    { value: lessons, label: lessons === 1 ? 'lesson' : 'lessons' },
    ...(hours > 0 ? [{ value: hours, label: hours === 1 ? 'hour of video' : 'hours of video' }] : []),
  ];
}

/* --- 1. Hero: asymmetric split. Four text elements, no more. -------------- */

function Hero({ courses }: { courses: PublicCourseSummary[] | null }) {
  const facts = courses && courses.length > 0 ? catalogFacts(courses) : null;

  return (
    <section className={`${shell} grid items-center gap-12 pb-24 pt-16 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:pt-24`}>
      <div>
        <h1 className="text-balance text-[clamp(2.25rem,5.5vw,var(--fs-marketing-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
          IGCSE and IELTS, taught the way the papers are actually marked.
        </h1>
        <p className="mt-6 max-w-[52ch] text-m-lead leading-[1.65] text-fg-2">
          Live classes, recordings you keep, and every piece of work returned
          annotated with a mark you can trace.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/courses" variant="primary" size="medium">
            Browse courses
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary" size="medium">
            Meet Dr. Tahir
          </ButtonLink>
        </div>

        {/* Counted from the catalog that renders below it, so the claim and
            the evidence can never disagree. Absent rather than zeroed when the
            catalog is unreachable - "0 courses" is worse than no number. */}
        {facts && (
          <dl className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-[var(--border-light)] pt-6">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="sr-only">{fact.label}</dt>
                <dd>
                  <span className="font-[family-name:var(--font-mono)] text-m-h2 font-medium tabular-nums tracking-[-0.03em] text-fg">
                    {fact.value}
                  </span>
                  <span className="ms-2 text-m-body text-fg-3">
                    {fact.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-[var(--border-medium)]">
        <Image
          src={photo('dr-tahir-elshazli-teaching-portrait', 900, 1125)}
          alt="Dr. Tahir Elshazli teaching an English class"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 460px"
          className="object-cover"
        />
      </div>
    </section>
  );
}

/* --- 2. Courses: the real catalog, straight from the API. ---------------
   This is the section the page exists for. It used to be two hardcoded tiles
   describing tracks that were not rows in any table, ending at "Contact us" -
   a visitor could not see a single real course, let alone what was in it. It
   now renders whatever Dr. Tahir has published, and every card is a route into
   the syllabus. */

function Courses({ courses }: { courses: PublicCourseSummary[] | null }) {
  return (
    <section className="border-y border-[var(--border-light)] bg-surface-2 py-24">
      <div className={shell}>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-[20ch] text-[clamp(1.75rem,3.5vw,var(--fs-marketing-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
              Courses running now.
            </h2>
            {courses && courses.length > 3 && (
              <ButtonLink href="/courses" variant="secondary" size="medium">
                See all {courses.length}
              </ButtonLink>
            )}
          </div>
        </Reveal>

        {courses === null ? (
          <div className="mt-12">
            <CatalogUnavailable />
          </div>
        ) : courses.length === 0 ? (
          <div className="mt-12">
            <CatalogEmpty />
          </div>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 6).map((course, i) => (
              <Reveal key={course.id} delay={i * 0.06}>
                <CourseCard course={course} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* --- 3. How it runs: vertical editorial stack with display numerals. ----- */

function HowItRuns() {
  return (
    <section className={`${shell} py-24`}>
      <Reveal>
        <h2 className="max-w-[22ch] text-[clamp(1.75rem,3.5vw,var(--fs-marketing-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
          What a term actually looks like.
        </h2>
      </Reveal>

      <div className="mt-16 flex flex-col">
        {STAGES.map((stage, i) => (
          <Reveal key={stage.verb} delay={i * 0.06}>
            <div className="grid gap-4 border-t border-[var(--border-light)] py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12">
              <h3 className="text-m-h2 font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
                {stage.verb}
              </h3>
              <p className="max-w-[65ch] self-center text-m-lead leading-[1.65] text-fg-2">
                {stage.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --- 4. Platform: bento, five items, five cells, mixed treatments. -------- */

function Platform() {
  const [lead, correction, notes, split, timetable] = PLATFORM;

  return (
    <section className="border-y border-[var(--border-light)] bg-surface-2 py-24">
      <div className={shell}>
        <Reveal>
          <h2 className="max-w-[24ch] text-[clamp(1.75rem,3.5vw,var(--fs-marketing-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
            Inside the student platform.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-2">
          <Reveal className="md:col-span-2" >
            <Tile feature={lead} tall />
          </Reveal>
          <Reveal delay={0.06}>
            <Tile feature={correction} />
          </Reveal>
          <Reveal delay={0.12}>
            <Tile feature={notes} />
          </Reveal>
          <Reveal delay={0.18}>
            <Tile feature={split} />
          </Reveal>
          <Reveal delay={0.24}>
            <Tile feature={timetable} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Tile({
  feature,
  tall = false,
}: {
  feature: (typeof PLATFORM)[number];
  tall?: boolean;
}) {
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-md border border-[var(--border-medium)] bg-surface"
      style={feature.tint ? { background: 'var(--accent-wash)' } : undefined}
    >
      {feature.image && (
        <div className={`relative ${tall ? 'aspect-[21/9]' : 'aspect-[16/9]'}`}>
          <Image
            src={feature.image}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-m-lead font-semibold leading-[1.2] tracking-[-0.01em] text-fg">
          {feature.title}
        </h3>
        <p className="mt-3 text-m-body leading-[1.65] text-fg-2">
          {feature.body}
        </p>
      </div>
    </article>
  );
}

/* --- 5. Voices: three short quotes, hairline-separated. ------------------- */

function Voices() {
  return (
    <section className={`${shell} py-24`}>
      <Reveal>
        <h2 className="max-w-[20ch] text-[clamp(1.75rem,3.5vw,var(--fs-marketing-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
          From students who sat the papers.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {TESTIMONIALS.map((item, i) => (
          <Reveal key={item.name} delay={i * 0.08}>
            <figure className="flex h-full flex-col border-t-2 border-accent pt-6">
              <blockquote className="text-m-lead leading-[1.65] text-fg">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 text-m-body">
                <span className="font-medium text-fg">
                  {item.name}
                </span>
                <span className="mt-[2px] block text-fg-3">
                  {item.detail}
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --- 6. FAQ: native disclosure, keyboard-operable for free. -------------- */

function Faq() {
  return (
    <section className="border-y border-[var(--border-light)] bg-surface-2 py-24">
      <div className={`${shell} grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16`}>
        <h2 className="text-[clamp(1.75rem,3.5vw,var(--fs-marketing-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
          Questions we get asked.
        </h2>

        <div>
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group border-b border-[var(--border-light)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-m-lead font-medium text-fg [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span
                  aria-hidden
                  className="relative h-4 w-4 shrink-0"
                >
                  <span className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-fg-3" />
                  <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 bg-fg-3 transition-transform duration-[var(--dur-fast)] ease-[var(--ease)] group-open:rotate-90 group-open:opacity-0" />
                </span>
              </summary>
              <p className="max-w-[65ch] pb-6 text-m-body leading-[1.65] text-fg-2">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 7. Closing: one action, the same label used everywhere else. -------- */

function ClosingCta() {
  return (
    <section className={`${shell} py-24`}>
      <Reveal>
        <div className="flex flex-col items-start gap-8 rounded-md border border-accent bg-[var(--accent-wash)] p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="max-w-[18ch] text-[clamp(1.5rem,3vw,var(--fs-marketing-h2))] font-semibold leading-[1.15] tracking-[-0.02em] text-fg">
              Term places are set before each intake.
            </h2>
            <p className="mt-3 max-w-[46ch] text-m-body leading-[1.65] text-fg-2">
              See the timetable, the papers covered and the fee for each course.
            </p>
          </div>
          <ButtonLink href="/courses" variant="primary" size="medium" className="shrink-0">
            Browse courses
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}
