import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  CalendarBlankIcon,
  ChatCircleTextIcon,
  FilePdfIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react/dist/ssr';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { TRACKS } from '@/lib/site-content';

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

export function generateStaticParams() {
  return TRACKS.map((track) => ({ slug: track.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const track = TRACKS.find((t) => t.slug === slug);
  if (!track) return { title: 'Course not found' };
  return { title: track.name, description: track.summary };
}

/**
 * What a student gets on any course. Deliberately generic across tracks - the
 * per-course detail (timetable, fee, papers) is confirmed on contact, since
 * there is no public course API yet (CLAUDE.md §7.1).
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

export default async function CourseTrackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const track = TRACKS.find((t) => t.slug === slug);
  if (!track) notFound();

  return (
    <>
      <section className={`${shell} grid items-end gap-[var(--sp-8)] pb-[var(--sp-16)] pt-[var(--sp-16)] lg:grid-cols-[3fr_2fr] lg:gap-[var(--sp-16)] lg:pt-[var(--sp-24)]`}>
        <div>
          <p className="text-[var(--fs-body)] text-[var(--fg-tertiary)]">
            {track.audience}
          </p>
          <h1 className="mt-[var(--sp-3)] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--fg-primary)]">
            {track.name}
          </h1>
          <p className="mt-[var(--sp-6)] max-w-[var(--maxw-prose)] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
            {track.summary}
          </p>
          <div className="mt-[var(--sp-8)] flex flex-wrap gap-[var(--sp-3)]">
            <ButtonLink href="/contact" variant="primary" size="lg">
              Contact us
            </ButtonLink>
            <ButtonLink href="/courses" variant="secondary" size="lg">
              All courses
            </ButtonLink>
          </div>
        </div>

        <figure className="relative aspect-[4/3] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)] lg:aspect-[4/5]">
          <Image
            src={track.image}
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 440px"
            className="object-cover"
          />
        </figure>
      </section>

      <section className="border-y border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-24)]">
        <div className={shell}>
          <h2 className="max-w-[20ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
            What the course covers.
          </h2>

          <ul className="mt-[var(--sp-12)] grid gap-[var(--sp-6)] md:grid-cols-3">
            {track.points.map((point, i) => (
              <Reveal key={point} delay={i * 0.06}>
                <li className="h-full rounded-[var(--r-sm)] border border-[var(--border-medium)] bg-[var(--bg-primary)] p-[var(--sp-6)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
                  {point}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${shell} py-[var(--sp-24)]`}>
        <h2 className="max-w-[22ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
          Included with every place.
        </h2>

        <div className="mt-[var(--sp-12)] grid gap-x-[var(--sp-12)] sm:grid-cols-2">
          {INCLUDED.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-[var(--sp-4)] border-t border-[var(--border-light)] py-[var(--sp-6)]"
            >
              <Icon
                size={22}
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
      </section>
    </>
  );
}
