import * as React from 'react';
import { cx } from './cx';

/**
 * The application's ONE container.
 *
 * **Never nest a Panel inside a Panel.** The design system says it twice and
 * calls it "the fastest way to make this system look like a different, worse
 * one". When a panel's contents need dividing, that is what `SectionTitle` and
 * `Divider` are for - the student's weekly report is one Panel carved into four
 * sections for exactly this reason, not four panels stacked.
 *
 * Two details that look like mistakes and are not:
 *
 *  - The ground is `--surface`, the *page* colour, not `--surface-2`. In this
 *    system borders separate surfaces and shadows are reserved for things that
 *    genuinely float, so a panel is the same colour as the page and is read as
 *    a panel because of its ring.
 *  - That ring is an inset box-shadow, not a border. A 1px border would join
 *    the radius calculation and fight the corner; an inset shadow follows it.
 */
export function Panel({
  title,
  action,
  padded = true,
  className,
  bodyClassName,
  children,
  ...rest
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  /** `false` when the body is a Table or a run of rows that owns its own edges. */
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section
      {...rest}
      className={cx(
        'flex flex-col overflow-hidden rounded-md bg-surface',
        'shadow-[inset_0_0_0_1px_var(--border-light)]',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-border-light px-4 py-3">
          {/* A span, not a heading: a Panel appears at several depths and
              hard-coding <h2> here would put the page's outline at the mercy of
              where someone happened to drop a container. Pass a real heading in
              as `title` when the panel is a landmark. */}
          <span className="text-md font-semibold leading-body text-fg">{title}</span>
          {action}
        </header>
      )}
      <div className={bodyClassName ?? (padded ? 'p-4' : '')}>{children}</div>
    </section>
  );
}

/**
 * An in-panel heading. The 16/600 + 12px description pair that divides a Panel
 * without opening a second one.
 */
export function SectionTitle({
  title,
  description,
  action,
  className,
  ...rest
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div
      {...rest}
      className={cx('flex items-start justify-between gap-2', className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-md font-semibold leading-body text-fg">{title}</span>
        {description && (
          <span className="text-xs leading-body text-fg-3">{description}</span>
        )}
      </div>
      {action}
    </div>
  );
}

/** A hairline, optionally with a word set into it. */
export function Divider({
  label,
  className,
  ...rest
}: { label?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  if (!label) {
    return (
      <hr
        {...rest}
        className={cx('m-0 border-0 border-t border-border-light', className)}
      />
    );
  }
  return (
    <div {...rest} className={cx('flex items-center gap-2', className)}>
      <span className="h-px flex-1 bg-border-light" />
      <span className="text-xs font-medium leading-none text-fg-4">{label}</span>
      <span className="h-px flex-1 bg-border-light" />
    </div>
  );
}
