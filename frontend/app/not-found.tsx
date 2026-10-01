import { EmptyState, ButtonLink } from '@/components/ui';

/**
 * The app-level 404 (REM-018). Renders inside the root layout, so the
 * signed-in theme and tokens already apply — no separate document needed
 * (contrast `global-error.tsx`, which does).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <EmptyState
        icon="AlertTriangle"
        title="Page not found"
        description="That page does not exist, or has moved."
        action={<ButtonLink href="/">Go home</ButtonLink>}
      />
    </div>
  );
}
