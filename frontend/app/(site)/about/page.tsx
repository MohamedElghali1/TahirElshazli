import type { Metadata } from 'next';
import Image from 'next/image';
import { ButtonLink } from '@/components/ui';
import { Reveal } from '@/components/site/reveal';
import { photo } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'About Dr. Tahir',
  description:
    'Dr. Tahir Elshazli teaches IGCSE English and IELTS preparation, marking every piece of student work personally.',
};

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

/** Teaching principles, in Dr. Tahir's own framing. Editable copy. */
const PRINCIPLES = [
  {
    title: 'A mark without a reason teaches nothing',
    body: 'Every script comes back with the sentence that lost the mark circled and a note beside it. A student who only sees a number learns to guess.',
  },
  {
    title: 'Small groups, or it is not teaching',
    body: 'Live classes stay small enough that everyone speaks. Speaking practice in a group of forty is a lecture wearing a costume.',
  },
  {
    title: 'The paper is the syllabus',
    body: 'Work is set against the criteria the examiner uses, not a general idea of good English. Students learn the shape of the paper as well as the language.',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className={`${shell} grid items-center gap-[var(--sp-12)] pb-[var(--sp-24)] pt-[var(--sp-16)] lg:grid-cols-[5fr_4fr] lg:gap-[var(--sp-16)] lg:pt-[var(--sp-24)]`}>
        <div>
          <h1 className="max-w-[16ch] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
            Dr. Tahir Elshazli
          </h1>
          <p className="mt-[var(--sp-6)] max-w-[var(--maxw-prose)] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-fg-2">
            Dr. Tahir has taught English to IGCSE and IELTS candidates for over
            a decade, working with students across Egypt and, since the classes
            moved online, further afield. He marks every submission himself.
          </p>
          <p className="mt-[var(--sp-4)] max-w-[var(--maxw-prose)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-3">
            The platform exists because the marking was the bottleneck. Scripts
            were being photographed, annotated on paper and sent back over
            WhatsApp, and half of them were lost by exam season. Now the
            correction lives beside the submission, and the record stays.
          </p>
        </div>

        <figure className="relative aspect-[4/5] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-medium)]">
          <Image
            src={photo('dr-tahir-elshazli-portrait-study', 800, 1000)}
            alt="Dr. Tahir Elshazli"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 440px"
            className="object-cover"
          />
        </figure>
      </section>

      <section className="border-y border-[var(--border-light)] bg-[var(--bg-secondary)] py-[var(--sp-24)]">
        <div className={shell}>
          <h2 className="max-w-[20ch] text-[clamp(1.75rem,3.5vw,var(--fs-h1))] font-semibold leading-[1.1] tracking-[-0.02em] text-fg">
            How the teaching works.
          </h2>

          <div className="mt-[var(--sp-12)] flex flex-col">
            {PRINCIPLES.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.06}>
                <div className="grid gap-[var(--sp-4)] border-t border-[var(--border-light)] py-[var(--sp-8)] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-[var(--sp-12)]">
                  <h3 className="text-[var(--fs-h3)] font-semibold leading-[1.2] tracking-[-0.01em] text-fg">
                    {item.title}
                  </h3>
                  <p className="self-center text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={`${shell} py-[var(--sp-24)]`}>
        <div className="flex flex-col items-start gap-[var(--sp-6)] md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-[24ch] text-[clamp(1.5rem,3vw,var(--fs-h2))] font-semibold leading-[1.15] tracking-[-0.02em] text-fg">
            See which course fits the year group you are in.
          </h2>
          <ButtonLink href="/courses" variant="primary" size="medium" className="shrink-0">
            Browse courses
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
