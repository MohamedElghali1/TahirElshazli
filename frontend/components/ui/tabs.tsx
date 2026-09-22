import * as React from 'react';
import Link from 'next/link';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

/**
 * Page navigation: 40px tabs over a hairline, the active one underlined.
 *
 * **The underline is `--fg`, not the accent.** The reference component's own
 * doc-comment says "accent underline" while its code draws
 * `inset 0 -1px 0 0 var(--fg)` — the code is what the click-through kits
 * rendered and what was reviewed, so it wins. It is also the more consistent
 * of the two with the system's own third rule: a selected tab is a *state*, and
 * indigo is reserved for the one *action* on a screen.
 *
 * Tabs come in two flavours because the app has both kinds. A tab that changes
 * the route takes an `href` and renders a `<Link>` (course sections, the staff
 * console's course tabs). A tab that switches a local view takes `value` and
 * the list takes `onChange` (To do / Marked / All).
 */

export interface TabItem {
  /** Stable id. Defaults to the label when omitted. */
  value?: string;
  label: string;
  icon?: IconName;
  /** A count, set in mono beside the label — "Unmatched 3". */
  count?: number | null;
  /** Present for route tabs; absent for local-state tabs. */
  href?: string;
}

function tabClasses(active: boolean): string {
  return cx(
    'inline-flex h-10 cursor-pointer items-center gap-1 border-0 bg-transparent px-2',
    'text-base font-medium leading-body no-underline',
    'transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
    active
      ? 'text-fg shadow-[inset_0_-1px_0_0_var(--fg)]'
      : 'text-fg-3 hover:text-fg hover:no-underline',
  );
}

export function TabList({
  tabs,
  value,
  onChange,
  label,
  className,
  ...rest
}: {
  tabs: readonly TabItem[];
  /** The active tab's `value` (or, for route tabs, its `href`). */
  value: string;
  onChange?: (value: string) => void;
  /** Names the tab list for assistive tech — "Course sections". */
  label: string;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      role="tablist"
      aria-label={label}
      className={cx(
        'flex items-stretch gap-1 border-b border-border-light',
        className,
      )}
    >
      {tabs.map((tab) => {
        const id = tab.href ?? tab.value ?? tab.label;
        const active = id === value;
        const body = (
          <>
            {tab.icon && <Icon name={tab.icon} size={16} />}
            {tab.label}
            {tab.count != null && (
              <span className="num text-xs text-fg-4">{tab.count}</span>
            )}
          </>
        );

        return tab.href ? (
          <Link
            key={id}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={tabClasses(active)}
          >
            {body}
          </Link>
        ) : (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(id)}
            className={tabClasses(active)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
