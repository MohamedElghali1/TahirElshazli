'use client'; // Error boundaries must be Client Components

import './globals.css';
import { EmptyState, Button } from '@/components/ui';

/**
 * Last-resort boundary (REM-018): it replaces the root layout, so it renders
 * its own <html>/<body>. Deliberately minimal - light theme only. Repeating the
 * layout's theme bootstrap here would be a second place deciding the theme
 * (CLAUDE.md §11, F14-1).
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-[100dvh] bg-surface">
        <div className="flex min-h-[100dvh] items-center justify-center p-4">
          <EmptyState
            icon="AlertTriangle"
            title="Something went wrong"
            description="Please try again."
            action={<Button onClick={reset}>Try again</Button>}
          />
        </div>
      </body>
    </html>
  );
}
