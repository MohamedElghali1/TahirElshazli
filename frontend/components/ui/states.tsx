import * as React from 'react';
import { Button } from './button';
import { cx } from './cx';

/* --- The three states every data surface has ----------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        'animate-pulse rounded-[var(--r-sm)] bg-[var(--bg-wash)]',
        className,
      )}
    />
  );
}

/** Rows shaped like the table they are standing in for, not a spinner. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rows" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-[var(--sp-12)] items-center gap-[var(--sp-4)] px-[var(--sp-4)]"
        >
          <Skeleton className="h-[var(--sp-2)] flex-1" />
          <Skeleton className="h-[var(--sp-2)] w-[64px]" />
          <Skeleton className="h-[var(--sp-2)] w-[40px]" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-[var(--sp-6)] py-[var(--sp-12)] text-center">
      <p className="text-[var(--fs-md)] font-medium text-fg">
        {title}
      </p>
      <p className="mt-[var(--sp-2)] max-w-[42ch] text-[var(--fs-base)] text-fg-3">
        {body}
      </p>
      {action && <div className="mt-[var(--sp-4)]">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center px-[var(--sp-6)] py-[var(--sp-12)] text-center"
    >
      <p className="text-[var(--fs-md)] font-medium text-fg">
        That did not load
      </p>
      <p className="mt-[var(--sp-2)] max-w-[42ch] text-[var(--fs-base)] text-fg-3">
        {message}
      </p>
      {onRetry && (
        <Button className="mt-[var(--sp-4)]" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
