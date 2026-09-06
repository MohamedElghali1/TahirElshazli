import type { Metadata } from 'next';
import { EmptyState, ButtonLink } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Notes on IGCSE English and IELTS preparation from Dr. Tahir Elshazli.',
};

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

/**
 * The blog index renders from the CMS. `BlogPost` exists in the data model
 * (CLAUDE.md §6.1) but nothing serves it yet, and the public marketing site
 * rendering CMS content is explicitly out of the current phase (§7). The page
 * exists so the route and the nav entry are real rather than a dead link.
 */
export default function BlogPage() {
  return (
    <section className={`${shell} py-[var(--sp-16)] lg:py-[var(--sp-24)]`}>
      <h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--fg-primary)]">
        Notes on the papers.
      </h1>
      <p className="mt-[var(--sp-6)] max-w-[54ch] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
        Worked examples, common mistakes, and what examiners are actually
        looking for.
      </p>

      <div className="mt-[var(--sp-16)] rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-secondary)]">
        <EmptyState
          title="Nothing published yet"
          body="The first articles go up before the next intake. Until then, the course pages cover what each paper involves."
          action={
            <ButtonLink href="/courses" variant="primary" size="lg">
              Browse courses
            </ButtonLink>
          }
        />
      </div>
    </section>
  );
}
