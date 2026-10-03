'use client';

import { useId } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import { ArrowLeft, ArrowRight, FlaskConical } from './icons';

const slideUp: Variants = {
  initial: { y: 120, opacity: 0 },
  enter: { y: 0, opacity: 1, transition: { duration: 0.8, ease: [0.33, 1, 0.68, 1], delay: 2.4 } },
};

const stagger: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.08, delayChildren: 2.6 } },
};

const stepItem: Variants = {
  initial: { y: 40, opacity: 0 },
  enter: { y: 0, opacity: 1, transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] } },
};

function Brand({ size }: { size: number }) {
  return (
    <Link href="/" aria-label="Home" className="group inline-flex items-center gap-3">
      <FlaskConical
        size={size}
        className="transition-transform duration-500 ease-in-expo group-hover:rotate-[360deg]"
      />
      <span className="text-za-base">Dr. Za3balawy</span>
    </Link>
  );
}

export function AuthShell({
  eyebrow,
  title,
  lead,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="za-auth grid min-h-screen bg-za-background text-za-foreground lg:grid-cols-2"
      variants={slideUp}
      initial="initial"
      animate="enter"
    >
      <aside className="relative overflow-hidden bg-za-foreground text-za-background max-lg:hidden">
        <Image
          src="/za3balawy-hero.jpg"
          className="object-cover object-top opacity-30 mix-blend-luminosity"
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority
          alt="Dr. Za3balawy holding a conical flask"
        />
        <div className="absolute inset-0 bg-linear-to-t from-za-foreground via-za-foreground/70 to-za-foreground/30" />

        <div className="relative flex h-full flex-col justify-between gap-16 p-10 lg:sticky lg:top-0 lg:h-screen lg:p-16">
          <Brand size={22} />
          <div className="max-w-lg">{aside}</div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-za-sm text-za-background/70 transition-colors duration-300 ease-in-expo hover:text-za-background"
          >
            <ArrowLeft size={16} strokeWidth={1.5} /> Back to home
          </Link>
        </div>
      </aside>

      <main id="main" className="flex items-center justify-center px-6 py-14 sm:px-8 lg:p-20">
        <motion.div className="w-full max-w-xl" variants={stagger} initial="initial" animate="enter">
          <motion.div variants={stepItem} className="mb-10 lg:hidden">
            <Brand size={20} />
          </motion.div>

          <motion.p
            variants={stepItem}
            className="text-za-xs uppercase tracking-[0.3em] text-za-secondary-foreground"
          >
            {eyebrow}
          </motion.p>

          <motion.h1 variants={stepItem} className="mt-6 text-[length:clamp(2.5em,5vw,4em)] leading-[1.05]">
            {title}
          </motion.h1>

          <motion.p variants={stepItem} className="mt-6 text-za-base text-za-muted-foreground lg:text-za-lg">
            {lead}
          </motion.p>

          <motion.div variants={stepItem} className="mt-14">
            {children}
          </motion.div>
        </motion.div>
      </main>
    </motion.div>
  );
}

/** The aside's heading and paragraph, shared by both forms. */
export function AuthAside({ heading, body }: { heading: string; body: string }) {
  return (
    <>
      <h2 className="text-[length:clamp(2em,3.4vw,3.25em)] leading-[1.1]">{heading}</h2>
      <p className="mt-6 text-za-base text-za-background/70">{body}</p>
    </>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-za-sm font-medium text-za-foreground">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className="mt-2 w-full rounded-[2px] border border-solid border-za-input bg-za-muted px-4 py-3 text-za-base text-za-foreground shadow-sm transition-all duration-200 ease-in-expo placeholder:text-za-muted-foreground hover:border-za-secondary focus:border-za-ring focus:bg-za-background focus:ring-2 focus:ring-za-ring/25 aria-invalid:border-za-destructive"
        {...props}
      />
      {note ? (
        <p id={`${id}-note`} className={`mt-2 text-za-xs ${error ? 'text-za-destructive' : 'text-za-muted-foreground'}`}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-za-sm text-za-destructive"
    >
      {children}
    </motion.p>
  );
}

export function SubmitButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <motion.button
      type="submit"
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className="group flex w-full items-center justify-between gap-4 rounded-full bg-za-foreground px-8 py-6 text-za-base text-za-background transition-colors duration-300 ease-in-expo hover:bg-za-primary disabled:cursor-wait disabled:opacity-60"
    >
      {children}
      <ArrowRight
        size={20}
        strokeWidth={1.5}
        className="transition-transform duration-300 ease-in-expo group-hover:translate-x-1"
      />
    </motion.button>
  );
}

export const textLink =
  'border-b border-solid border-za-foreground pb-0.5 text-za-foreground transition-opacity duration-300 ease-in-expo hover:opacity-60';
