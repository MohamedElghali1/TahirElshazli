import { cx } from '@/components/ui';

/**
 * The management console's table primitives.
 *
 * The student LMS is a list-and-card product; the staff console is a
 * read-many-rows-at-once product, and a roster or a grading queue genuinely is
 * tabular data. These give it real `<table>` semantics - a screen reader
 * announces "row 4, Average, 82%" instead of reading a wall of divs.
 *
 * Geometry is the reference system's table: 8px of padding inside each cell,
 * plus 8px of margin on the scroll container. That split is the reason it
 * exists rather than one 16px value - the cell padding is the click target and
 * the container margin is the optical alignment, so the first column's text
 * lines up with a Panel's own 16px edge while the cells stay dense.
 *
 * Alignment is a union rather than an interpolated class: Tailwind scans source
 * text, so `text-${align}` compiles to nothing and the column silently loses
 * its alignment in production while looking right in dev.
 */
type Align = 'start' | 'end';

const ALIGN: Record<Align, string> = {
  start: 'text-start',
  end: 'text-end',
};

/** Wraps the table so wide content scrolls itself rather than the page. */
export function TableScroll({
  children,
  minWidth = 640,
}: {
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto px-[var(--sp-2)]">
      <table
        className="w-full border-collapse"
        style={{ minWidth: `${minWidth}px` }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = 'start',
  className,
}: {
  children: React.ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cx(
        'px-[var(--sp-2)] py-[var(--sp-2)] text-[var(--fs-xs)] font-medium',
        'whitespace-nowrap text-[var(--fg-tertiary)]',
        ALIGN[align],
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'start',
  className,
}: {
  children: React.ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <td
      className={cx(
        'px-[var(--sp-2)] py-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)]',
        ALIGN[align],
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={cx(
        'h-[var(--h-md)] border-b border-[var(--border-light)] last:border-0',
        className,
      )}
    >
      {children}
    </tr>
  );
}
