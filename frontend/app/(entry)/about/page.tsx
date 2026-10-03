import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Navbar } from '../_za/landing';
import { Contact } from '../_za/contact';
import { Magnetic } from '../_za/magnetic';

/**
 * About, on the Za3 landing-page reference design (`app/about/page.jsx`):
 * a photo header, a sticky facts column beside the biography, and the
 * reference's closing contact footer. Copy is the reference's.
 */
export const metadata: Metadata = {
  title: { absolute: 'About | Dr. Za3balawy' },
  description:
    'Mohamed Za3balawy is a chemistry teacher known for his rare ability to transform scientific concepts into ideas that feel simple, logical and enjoyable.',
};

const FACTS = [
  { label: 'Subject', value: 'Chemistry' },
  { label: 'Curriculum', value: 'IGCSE & beyond' },
  { label: 'Approach', value: 'Fundamentals first' },
  { label: 'Focus', value: 'Clarity & confidence' },
];

// The reference's Tailwind `container`: centred, 2rem gutters, 1400px at 2xl.
const container = 'mx-auto w-full px-8 2xl:max-w-[1400px]';

export default function AboutPage() {
  return (
    <>
      <Navbar />

      <header className="relative flex min-h-[85vh] items-end overflow-hidden bg-za-foreground text-za-background">
        <Image
          src="/za3balawy-hero.jpg"
          className="object-cover object-top opacity-40 mix-blend-luminosity"
          fill
          sizes="100vw"
          priority
          alt="Mohamed Za3balawy holding a conical flask"
        />
        <div className="absolute inset-0 bg-linear-to-t from-za-foreground via-za-foreground/60 to-za-foreground/20" />

        <div className={`${container} relative pb-24 pt-40`}>
          <p className="text-za-xs uppercase tracking-[0.3em] text-za-background/70">About</p>
          <h1 className="mt-8 text-[length:clamp(2.75em,8vw,7em)] leading-[1.02]">Meet Dr. Za3balawy</h1>
          <p className="mt-8 max-w-2xl text-za-base text-za-background/80 lg:text-[length:1.25rem] lg:leading-[1.75rem]">
            Mohamed Za3balawy is a chemistry teacher known for his rare ability to transform scientific
            concepts into ideas that feel simple, logical, and enjoyable.
          </p>
        </div>
      </header>

      <main id="main">
        <article className={container}>
          <div className="grid gap-16 py-24 lg:grid-cols-12 lg:py-40">
            <div className="lg:col-span-4">
              <dl className="flex flex-col gap-8 lg:sticky lg:top-24">
                {FACTS.map(({ label, value }) => (
                  <div key={label} className="border-b border-solid border-za-border pb-6">
                    <dt className="text-za-xs uppercase tracking-[0.2em] text-za-secondary-foreground">{label}</dt>
                    <dd className="mt-3 text-[length:1.25rem] leading-[1.75rem]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-10 lg:col-span-8">
              <h2 className="text-[length:clamp(1.5em,2.6vw,2.6em)] leading-[1.35]">
                His classes are built on a balance of strong academic fundamentals and creative teaching
                techniques, allowing students to understand reactions, equations, and theories with genuine
                clarity.
              </h2>

              <p className="text-za-base text-za-muted-foreground lg:text-za-lg">
                Za3balawy brings energy and personality to every lesson, using real-life examples,
                problem-solving strategies, and a structured approach that helps even the most difficult topics
                feel approachable. Whether he is explaining organic chemistry mechanisms, demonstrating
                experiments, or breaking down complex calculations, he always maintains a teaching style that is
                patient, disciplined, and focused on student success.
              </p>

              <p className="text-za-base text-za-muted-foreground lg:text-za-lg">
                His students often describe him as knowledgeable, supportive, and motivating — a teacher who not
                only teaches chemistry, but inspires a deeper interest in science itself. With each class, he
                aims to strengthen critical thinking, build confidence, and prepare students with the skills
                they need for exams and for life.
              </p>

              <div className="mt-6">
                <Link href="/register">
                  <Magnetic variant="ghost" size="md">
                    Join the class
                  </Magnetic>
                </Link>
              </div>
            </div>
          </div>
        </article>
      </main>

      <Contact />
    </>
  );
}
