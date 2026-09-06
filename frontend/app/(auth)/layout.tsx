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
      <aside className="relative hidden flex-col justify-between border-e border-[var(--border-light)] bg-[var(--bg-secondary)] p-[var(--sp-12)] lg:flex">
        <Link href="/" aria-label="Dr. Tahir Elshazli, home">
          <Wordmark />
        </Link>

        <div>
          <p className="max-w-[24ch] text-[clamp(1.75rem,3vw,var(--fs-h1))] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--fg-primary)]">
            Your classes, your marked work, and every recording in one place.
          </p>
          <p className="mt-[var(--sp-6)] max-w-[42ch] text-[var(--fs-body)] leading-[var(--lh-loose)] text-[var(--fg-tertiary)]">
            Sign in to see what is due, join the next live session and read the
            corrections on your last submission.
          </p>
        </div>

        <p className="text-[var(--fs-base)] text-[var(--fg-muted)]">
          Not enrolled yet?{' '}
          <Link
            href="/courses"
            className="text-[var(--fg-secondary)] underline underline-offset-4 hover:text-[var(--fg-primary)]"
          >
            Browse courses
          </Link>
        </p>
      </aside>

      <main
        id="main"
        className="flex flex-col justify-center px-[var(--sp-6)] py-[var(--sp-12)]"
      >
        <div className="mb-[var(--sp-8)] flex items-center justify-between lg:hidden">
          <Link href="/" aria-label="Dr. Tahir Elshazli, home">
            <Wordmark />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-[420px]">{children}</div>
        <div className="mt-[var(--sp-8)] hidden justify-center lg:flex">
          <ThemeToggle />
        </div>
      </main>
    </div>
  );
}
