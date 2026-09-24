import { Suspense } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/site/wordmark';

/**
 * Auth sits between the two surfaces: marketing typography on the left panel,
 * product-density controls in the form on the right. It uses the site scale so
 * a first-time visitor is not dropped straight into 13px.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-surface="site" className="grid min-h-[100dvh] lg:grid-cols-[1fr_1fr]">
      <aside className="relative hidden flex-col justify-between border-e border-[var(--border-light)] bg-surface-2 p-12 lg:flex">
        <Link href="/" aria-label="Dr. Tahir Elshazli, home">
          <Wordmark />
        </Link>

        <div>
          <p className="max-w-[24ch] text-[clamp(1.75rem,3vw,var(--fs-marketing-h1))] font-semibold leading-[1.15] tracking-[-0.02em] text-fg">
            Your classes, your marked work, and every recording in one place.
          </p>
          <p className="mt-6 max-w-[42ch] text-m-body leading-[1.65] text-fg-3">
            Sign in to see what is due, join the next live session and read the
            corrections on your last submission.
          </p>
        </div>

        <p className="text-m-body text-fg-4">
          Not enrolled yet?{' '}
          <Link
            href="/courses"
            className="text-fg-2 underline underline-offset-4 hover:text-fg"
          >
            Browse courses
          </Link>
        </p>
      </aside>

      <main
        id="main"
        className="flex flex-col justify-center px-6 py-12"
      >
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <Link href="/" aria-label="Dr. Tahir Elshazli, home">
            <Wordmark />
          </Link>
          <ThemeToggle />
        </div>
        {/* Sign-in and registration read `?next=` with `useSearchParams`, which
            a prerendered client page cannot do without a boundary to suspend
            at. It sits here rather than in each page so a future auth screen
            that reads the query string does not have to rediscover this. The
            fallback is deliberately near-empty: these forms render in one
            frame, and a skeleton of a five-field form is more flicker than
            information. */}
        <div className="mx-auto w-full max-w-[420px]">
          <Suspense fallback={<div className="min-h-[420px]" aria-hidden />}>
            {children}
          </Suspense>
        </div>
        <div className="mt-8 hidden justify-center lg:flex">
          <ThemeToggle />
        </div>
      </main>
    </div>
  );
}
