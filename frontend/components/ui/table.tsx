'use client';

import * as React from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import { Checkbox } from './form';

/**
 * The console's record table.
 *
 * **Thirty rows, not three thousand.** Dr. Tahir runs about ten groups of about
 * thirty students (CLAUDE.md §7.3), and the design system says so in as many
 * words: "do not build virtualised tables, faceted search or pagination
 * furniture — it makes the product feel heavier than the job it does." Sorting
 * and filtering happen in the caller, over an array it already holds.
 *
 * `onRowClick` makes the **whole row** the target. That is non-negotiable on
 * the student surface: "no student-facing item is opened by a 24px icon alone;
 * a chevron is an affordance, never the hit area."
 *
 * Generic over the row type, so a column's `render` receives the real record
 * rather than `any` — which is what stops a column quietly reading a field the
 * backend does not send.
 */

export interface Column<T> {
  /** Header label. Omit for a trailing action column — the system heads those with nothing. */
  label?: React.ReactNode;
  icon?: IconName;
  align?: 'start' | 'end';
  /** CSS width — the design gives percentages ("34%", "20%"). */
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
}

const ALIGN = {
  start: 'text-start',
  end: 'text-end',
} as const;

export function Table<T>({
  columns,
  rows,
  rowKey,
  selectable = false,
  selected,
  onSelect,
  onRowClick,
  rowLabel,
  empty,
  className,
  ...rest
}: {
  columns: ReadonlyArray<Column<T>>;
  rows: readonly T[];
  /** Stable key per row. Index is a last resort and a source of bugs on re-sort. */
  rowKey: (row: T, index: number) => string;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelect?: (key: string) => void;
  onRowClick?: (row: T, index: number) => void;
  /** What activating a row does, for assistive tech — "Open Sara Ahmed". */
  rowLabel?: (row: T) => string;
  /** Rendered in place of the body when there are no rows. */
  empty?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  if (rows.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <div {...rest} className={cx('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse font-sans text-base">
        <thead>
          <tr>
            {selectable && (
              <th className="w-7 border-b border-border-light p-2" />
            )}
            {columns.map((column, i) => (
              <th
                key={i}
                scope="col"
                style={{ width: column.width }}
                className={cx(
                  'whitespace-nowrap border-b border-border-light p-2',
                  'text-xs font-medium leading-body text-fg-3',
                  ALIGN[column.align ?? 'start'],
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {column.icon && <Icon name={column.icon} size={14} />}
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const key = rowKey(row, rowIndex);
            const isSelected = selected?.has(key) ?? false;
            const clickable = Boolean(onRowClick);

            return (
              <tr
                key={key}
                // A focusable row with Enter/Space is the design's own answer to
                // "the whole component is the target". It is not a link, so it
                // loses middle-click and open-in-new-tab; the alternative - a
                // stretched link inside the first cell - needs `position:
                // relative` on a `<tr>`, which browsers treat inconsistently.
                // The design chose this, and it is at least keyboard-operable.
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? 'button' : undefined}
                aria-label={clickable ? rowLabel?.(row) : undefined}
                onClick={clickable ? () => onRowClick!(row, rowIndex) : undefined}
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick!(row, rowIndex);
                        }
                      }
                    : undefined
                }
                className={cx(
                  'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
                  isSelected ? 'bg-accent-wash' : 'hover:bg-surface-2',
                  clickable && 'cursor-pointer',
                )}
              >
                {selectable && (
                  <td className="border-b border-border-light py-0 pe-0 ps-0.5">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => onSelect?.(key)}
                      label={rowLabel?.(row) ?? 'Select row'}
                    />
                  </td>
                )}
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    className={cx(
                      'h-8 border-b border-border-light p-2',
                      ALIGN[column.align ?? 'start'],
                      // The first column is the record's identity, so it takes
                      // primary ink and medium weight; everything after it is
                      // an attribute and steps back a tint.
                      colIndex === 0 ? 'font-medium text-fg' : 'text-fg-2',
                    )}
                  >
                    {column.render(row, rowIndex)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The row above a Table: search and filters on the left, actions on the right.
 *
 * When rows are selected it **swaps** rather than adding a second bar — the
 * count replaces the search, and the selection's own actions replace the
 * table's. The roster's "Move 3 to group" is the reference for this.
 */
export function TableToolbar({
  search,
  filters,
  actions,
  selectionCount = 0,
  selectionActions,
  className,
  ...rest
}: {
  search?: React.ReactNode;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  selectionCount?: number;
  selectionActions?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cx(
        'flex flex-wrap items-center gap-2 border-b border-border-light p-2',
        className,
      )}
    >
      {selectionCount > 0 ? (
        <>
          <span className="text-base font-medium leading-body text-fg-2">
            {selectionCount} selected
          </span>
          <span className="flex-1" />
          {selectionActions}
        </>
      ) : (
        <>
          {search}
          {filters}
          <span className="flex-1" />
          {actions}
        </>
      )}
    </div>
  );
}
