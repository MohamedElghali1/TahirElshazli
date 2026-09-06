import Image from 'next/image';
import Link from 'next/link';
import { ArrowRightIcon, CheckIcon } from '@phosphor-icons/react/dist/ssr';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { FAQS, PLATFORM, STAGES, TESTIMONIALS, TRACKS, photo } from '@/lib/site-content';

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Tracks />
      <HowItRuns />
      <Platform />
      <Voices />
      <Faq />
      <ClosingCta />
    </>
  );
}

/* --- 1. Hero: asymmetric split. Four text elements, no more. -------------- */

function Hero() {
  return (
    <section className={`${shell} grid items-center gap-[var(--sp-12)] pb-[var(--sp-24)] pt-[var(--sp-16)] lg:grid-cols-[7fr_5fr] lg:gap-[var(--sp-16)] lg:pt-[var(--sp-24)]`}>
      <div>
        <h1 className="text-balance text-[clamp(2.25rem,5.5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--fg-primary)]">
          IGCSE and IELTS, taught the way the papers are actually marked.
        </h1>
        <p className="mt-[var(--sp-6)] max-w-[52ch] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
          Live classes, recordings you keep, and every piece of work returned
          annotated with a mark you can trace.
        </p>
        <div className="mt-[var(--sp-8)] flex flex-wrap gap-[var(--sp-3)]">
          <ButtonLink href="/courses" variant="primary" size="lg">
            Browse courses
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary" size="lg">
            Meet Dr. Tahir
          </ButtonLink>
        </div>
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)]">
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

/* --- 2. Tracks: two tiles, image-led. ------------------------------------ */

function Tracks() {
  return (
    <section className="border-y border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-24)]">
      <div className={shell}>
        <Reveal>
          <h2 className="max-w-[20ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
            Two tracks, taught separately.
          </h2>
        </Reveal>

        <div className="mt-[var(--sp-12)] grid gap-[var(--sp-8)] md:grid-cols-2">
          {TRACKS.map((track, i) => (
            <Reveal key={track.slug} delay={i * 0.08}>
              <article className="group flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-primary)]">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={track.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 560px"
                    className="object-cover transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out)] group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-[var(--sp-8)]">
                  <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
                    {track.audience}
                  </p>
                  <h3 className="mt-[var(--sp-2)] text-[var(--fs-h3)] font-semibold tracking-[-0.01em] text-[var(--fg-primary)]">
                    {track.name}
                  </h3>
                  <p className="mt-[var(--sp-4)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
                    {track.summary}
                  </p>
                  <ul className="mt-[var(--sp-6)] flex flex-col gap-[var(--sp-3)]">
                    {track.points.map((point) => (
                      <li
                        key={point}
                        className="flex gap-[var(--sp-3)] text-[var(--fs-base)] text-[var(--fg-secondary)]"
                      >
                        <CheckIcon
                          size={18}
                          weight="bold"
                          className="mt-[3px] shrink-0 text-[var(--accent)]"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/courses/${track.slug}`}
                    className="mt-[var(--sp-8)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] font-medium text-[var(--fg-primary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--accent)]"
                  >
                    See the {track.name} course
                    <ArrowRightIcon size={16} />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --- 3. How it runs: vertical editorial stack with display numerals. ----- */

function HowItRuns() {
  return (
    <section className={`${shell} py-[var(--sp-24)]`}>
      <Reveal>
        <h2 className="max-w-[22ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
          What a term actually looks like.
        </h2>
      </Reveal>

      <div className="mt-[var(--sp-16)] flex flex-col">
        {STAGES.map((stage, i) => (
          <Reveal key={stage.verb} delay={i * 0.06}>
            <div className="grid gap-[var(--sp-4)] border-t border-[var(--border-light)] py-[var(--sp-8)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-[var(--sp-12)]">
              <h3 className="text-[var(--fs-h2)] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
                {stage.verb}
              </h3>
              <p className="max-w-[var(--maxw-prose)] self-center text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
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
    <section className="border-y border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-24)]">
      <div className={shell}>
        <Reveal>
          <h2 className="max-w-[24ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
            Inside the student platform.
          </h2>
        </Reveal>

        <div className="mt-[var(--sp-12)] grid gap-[var(--sp-4)] md:grid-cols-3 md:grid-rows-2">
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
      className="flex h-full flex-col overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-medium)] bg-[var(--bg-primary)]"
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
      <div className="flex flex-1 flex-col p-[var(--sp-6)]">
        <h3 className="text-[var(--fs-h3)] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--fg-primary)]">
          {feature.title}
        </h3>
        <p className="mt-[var(--sp-3)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
          {feature.body}
        </p>
      </div>
    </article>
  );
}

/* --- 5. Voices: three short quotes, hairline-separated. ------------------- */

function Voices() {
  return (
    <section className={`${shell} py-[var(--sp-24)]`}>
      <Reveal>
        <h2 className="max-w-[20ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
          From students who sat the papers.
        </h2>
      </Reveal>

      <div className="mt-[var(--sp-12)] grid gap-[var(--sp-8)] md:grid-cols-3">
        {TESTIMONIALS.map((item, i) => (
          <Reveal key={item.name} delay={i * 0.08}>
            <figure className="flex h-full flex-col border-t-2 border-[var(--accent-line)] pt-[var(--sp-6)]">
              <blockquote className="text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-primary)]">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-[var(--sp-6)] text-[var(--fs-base)]">
                <span className="font-medium text-[var(--fg-primary)]">
                  {item.name}
                </span>
                <span className="mt-[2px] block text-[var(--fg-tertiary)]">
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
    <section className="border-y border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-24)]">
      <div className={`${shell} grid gap-[var(--sp-12)] lg:grid-cols-[1fr_2fr] lg:gap-[var(--sp-16)]`}>
        <h2 className="text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--fg-primary)]">
          Questions we get asked.
        </h2>

        <div>
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group border-b border-[var(--border-light)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-[var(--sp-6)] py-[var(--sp-6)] text-[var(--fs-lead)] font-medium text-[var(--fg-primary)] [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span
                  aria-hidden
                  className="relative h-[var(--sp-4)] w-[var(--sp-4)] shrink-0"
                >
                  <span className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 bg-[var(--fg-tertiary)]" />
                  <span className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 bg-[var(--fg-tertiary)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease)] group-open:rotate-90 group-open:opacity-0" />
                </span>
              </summary>
              <p className="max-w-[var(--maxw-prose)] pb-[var(--sp-6)] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
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
    <section className={`${shell} py-[var(--sp-24)]`}>
      <Reveal>
        <div className="flex flex-col items-start gap-[var(--sp-8)] rounded-[var(--r-lg)] border border-[var(--accent-line)] bg-[var(--accent-wash)] p-[var(--sp-12)] md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="max-w-[18ch] text-[clamp(1.5rem,3vw,var(--fs-h2))] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--fg-primary)]">
              Term places are set before each intake.
            </h2>
            <p className="mt-[var(--sp-3)] max-w-[46ch] text-[var(--fs-body)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
              See the timetable, the papers covered and the fee for each course.
            </p>
          </div>
          <ButtonLink href="/courses" variant="primary" size="lg" className="shrink-0">
            Browse courses
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}
