'use client'; // Error boundaries must be Client Components

import { EmptyState, Button } from '@/components/ui';

/**
 * The app-level error boundary (REM-018). Renders inside the root layout, so
 * the signed-in theme and tokens already apply.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <EmptyState
        icon="AlertTriangle"
        title="Something went wrong"
        description="Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
