import * as React from 'react';
import { cx } from './cx';

/* --- Panel: the app's one container. No card inside a card. --------------
   The reference system's Card: a 1px medium border, radius md, and
   overflow hidden so a table's first row cannot square off the corner. */

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded-[var(--r-md)] border border-[var(--border-medium)]',
        'bg-[var(--bg-secondary)]',
        className,
      )}
    >
      {title && (
        <header className="flex min-h-[var(--h-lg)] items-center justify-between gap-[var(--sp-3)] border-b border-[var(--border-light)] px-[var(--sp-4)] py-[var(--sp-2)]">
          <h2 className="text-[var(--fs-base)] font-semibold text-fg">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={bodyClassName ?? 'p-[var(--sp-4)]'}>{children}</div>
    </section>
  );
}

/** A hairline. `role="separator"` only when it is not purely decorative. */
export function Separator({ className }: { className?: string }) {
  return (
    <hr
      className={cx('border-0 border-t border-[var(--border-light)]', className)}
    />
  );
}
