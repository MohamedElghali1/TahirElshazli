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
  // Optional: a trailing action column (an arrow, a menu) is routinely
  // headed by nothing at all in the reference system's own tables.
  children?: React.ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cx(
        // Height comes from the row, padding is horizontal only - the
        // reference system's column header is a 32px band with 8px of inline
        // padding, and stacking vertical padding on top of that makes the
        // header taller than the rows it heads. 13px, like every other string
        // in the product; the 12px this used to be was the one place the
        // console dropped below the base size.
        'h-[var(--h-md)] px-[var(--sp-2)] text-[var(--fs-base)] font-medium',
        'whitespace-nowrap text-fg-3',
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
        // Horizontal padding only, for the reason given on `Th`: the 32px on
        // `Tr` is a *floor* in table layout, so 8px of vertical padding on
        // every cell pushes the real row height past it and the dense table
        // stops being dense.
        'px-[var(--sp-2)] text-[var(--fs-base)] text-fg-2',
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
        // Row divider is --border-medium, one step darker than the panel
        // hairline (--border-light) - Twenty's own dense table uses the
        // stronger of the two so a scanning eye can find the row boundary
        // without a card around it (TASK 4).
        'h-[var(--h-md)] border-b border-[var(--border-medium)] last:border-0',
        className,
      )}
    >
      {children}
    </tr>
  );
}
