import Link from 'next/link';
import { WhatsappLogoIcon } from '@phosphor-icons/react/dist/ssr';
import { Wordmark } from './wordmark';

const COLUMNS = [
  {
    heading: 'Study',
    links: [
      { href: '/courses', label: 'Courses' },
      { href: '/courses/igcse', label: 'IGCSE English' },
      { href: '/courses/ielts', label: 'IELTS Preparation' },
      { href: '/login', label: 'Sign in' },
    ],
  },
  {
    heading: 'About',
    links: [
      { href: '/about', label: 'Dr. Tahir' },
      { href: '/blog', label: 'Blog' },
      { href: '/contact', label: 'Contact' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border-light)] bg-[var(--bg-secondary)]">
      <div className="mx-auto grid max-w-[var(--maxw-site)] gap-[var(--sp-12)] px-[var(--sp-6)] py-[var(--sp-16)] md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-[var(--sp-4)] max-w-[38ch] text-[var(--fs-base)] leading-[var(--lh-loose)] text-[var(--fg-tertiary)]">
            IGCSE and IELTS preparation, with every piece of work marked and
            returned.
          </p>
          <a
            href="https://wa.me/201000000000"
            target="_blank"
            rel="noreferrer"
            className="mt-[var(--sp-6)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
          >
            <WhatsappLogoIcon size={18} />
            Message us on WhatsApp
          </a>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="text-[var(--fs-base)] font-semibold text-[var(--fg-primary)]">
              {col.heading}
            </h2>
            <ul className="mt-[var(--sp-4)] flex flex-col gap-[var(--sp-3)]">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[var(--fs-base)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-[var(--border-light)]">
        <div className="mx-auto flex max-w-[var(--maxw-site)] flex-col gap-[var(--sp-2)] px-[var(--sp-6)] py-[var(--sp-6)] text-[var(--fs-xs)] text-[var(--fg-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Dr. Tahir Elshazli. All rights reserved.</p>
          <div className="flex gap-[var(--sp-6)]">
            <Link href="/privacy" className="hover:text-[var(--fg-secondary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--fg-secondary)]">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
