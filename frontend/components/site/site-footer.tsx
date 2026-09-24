import Link from 'next/link';
import { WhatsappLogoIcon } from '@phosphor-icons/react/dist/ssr';
import { Wordmark } from './wordmark';
import { CONTACT } from '@/lib/site-content';

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
    <footer className="border-t border-[var(--border-light)] bg-surface-2">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-16 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[38ch] text-m-body leading-[1.65] text-fg-3">
            IGCSE and IELTS preparation, with every piece of work marked and
            returned.
          </p>
          <a
            href={CONTACT.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-m-body text-fg-2 transition-colors duration-[var(--dur-fast)] hover:text-fg"
          >
            <WhatsappLogoIcon size={18} />
            Message us on WhatsApp
          </a>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="text-m-body font-semibold text-fg">
              {col.heading}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-m-body text-fg-3 transition-colors duration-[var(--dur-fast)] hover:text-fg"
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
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-6 py-6 text-m-body text-fg-4 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Dr. Tahir Elshazli. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-fg-2">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg-2">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
