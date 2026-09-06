import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { TRACKS } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Courses',
  description:
    'IGCSE English and IELTS preparation courses with Dr. Tahir Elshazli. Live timetabled classes and recorded lessons, with every assignment marked and returned.',
};

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

export default function CoursesPage() {
  return (
    <>
      <section className={`${shell} pb-[var(--sp-16)] pt-[var(--sp-16)] lg:pt-[var(--sp-24)]`}>
        <h1 className="max-w-[16ch] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--fg-primary)]">
          Courses running this term.
        </h1>
        <p className="mt-[var(--sp-6)] max-w-[56ch] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
          Each course is taught by Dr. Tahir directly. Timetables, papers
          covered and fees are confirmed before your first class.
        </p>
      </section>

      <div className={`${shell} flex flex-col gap-[var(--sp-16)] pb-[var(--sp-24)]`}>
        {TRACKS.map((track, i) => (
          <Reveal key={track.slug} delay={i * 0.06}>
            {/* Alternating orientation, two rows only, so the page never
                becomes a zigzag ladder. */}
            <article
              className={`grid items-center gap-[var(--sp-8)] lg:grid-cols-2 lg:gap-[var(--sp-16)] ${
                i % 2 === 1 ? 'lg:[&>figure]:order-2' : ''
              }`}
            >
              <figure className="relative aspect-[5/4] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)]">
                <Image
                  src={track.image}
                  alt=""
                  fill
                  priority={i === 0}
                  sizes="(max-width: 1024px) 100vw, 560px"
                  className="object-cover"
                />
              </figure>

              <div>
                <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
                  {track.audience}
                </p>
                <h2 className="mt-[var(--sp-2)] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
                  {track.name}
                </h2>
                <p className="mt-[var(--sp-4)] max-w-[var(--maxw-prose)] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
                  {track.summary}
                </p>
                <ul className="mt-[var(--sp-6)] flex flex-col gap-[var(--sp-3)] border-t border-[var(--border-light)] pt-[var(--sp-6)]">
                  {track.points.map((point) => (
                    <li
                      key={point}
                      className="text-[var(--fs-base)] text-[var(--fg-secondary)]"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/courses/${track.slug}`}
                  className="mt-[var(--sp-8)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-body)] font-medium text-[var(--fg-primary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--accent)]"
                >
                  Course details and timetable
                  <ArrowRightIcon size={18} />
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <section className="border-t border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-16)]">
        <div className={`${shell} flex flex-col items-start justify-between gap-[var(--sp-6)] md:flex-row md:items-center`}>
          <p className="max-w-[48ch] text-[var(--fs-lead)] text-[var(--fg-secondary)]">
            Not sure which track fits? Send us the year group and the exam board
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
