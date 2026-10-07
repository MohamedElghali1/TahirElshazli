'use client'; // Error boundaries must be Client Components

import './globals.css';
import { StatusPage } from '@/components/status-page';

/**
 * Last-resort boundary (REM-018): it replaces the root layout, so it renders
 * its own <html>/<body>. Light theme only — repeating the layout's theme
 * bootstrap here would be a second place deciding the theme (CLAUDE.md §11,
 * F14-1). A plain <a>, not <Link>: the router may be what failed.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <StatusPage lead="Something went" word="wrong" message="The site hit an unexpected error. Please try again.">
          <button type="button" className="btn btn-p" onClick={reset}>
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router may be what failed */}
          <a className="btn btn-o" href="/">
            Go home
          </a>
        </StatusPage>
      </body>
    </html>
  );
}
