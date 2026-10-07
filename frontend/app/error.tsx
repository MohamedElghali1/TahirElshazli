'use client'; // Error boundaries must be Client Components

import Link from 'next/link';
import { StatusPage } from '@/components/status-page';

/**
 * The app-level error boundary (REM-018), on the entry pages' design. The
 * consoles have their own (`app/(app)/error.tsx`) so a failing screen keeps
 * the shell around it.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusPage lead="Something went" word="wrong" message="An unexpected error stopped this page. Please try again.">
      <button type="button" className="btn btn-p" onClick={reset}>
        Try again
      </button>
      <Link className="btn btn-o" href="/">
        Go home
      </Link>
    </StatusPage>
  );
}
