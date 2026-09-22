'use client';

import * as React from 'react';
import { cx, Icon, Loader } from '@/components/ui';

export interface SwitchableCourse {
  id: string;
  title: string;
}

/**
 * The console/student course switch — "carried over from the console kit"
 * (`docs/redesign-mapping.md`): a student holds one to three courses and a
 * console holds exactly two (CLAUDE.md §1), so this is a short switch, not a
 * searchable dropdown. One course renders as a static label with nothing to
 * switch; two or three open a short popover of rows.
 *
 * Presentational only — no `lib/` import. What selecting a course does is
 * the caller's concern; nothing downstream reads the selection yet (see the
 * shell components' own notes).
 */
export function CourseSwitcher({
  courses,
  selectedId,
  onSelect,
  loading = false,
  className,
}: {
  courses: readonly SwitchableCourse[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (loading) {
    return (
      <div className={cx('flex h-9 items-center gap-2 px-2', className)}>
        <Loader size={3} label="Loading courses" />
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className={cx('flex h-9 items-center px-2 text-base text-fg-4', className)}>
        No courses
      </div>
    );
  }

  if (courses.length === 1) {
    return (
      <div
        className={cx(
          'flex h-9 items-center gap-2 rounded-md px-2 text-base font-medium text-fg',
          className,
        )}
      >
        <Icon name="Book" size={16} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate">{courses[0].title}</span>
      </div>
    );
  }

  const selected = courses.find((c) => c.id === selectedId) ?? courses[0];

  return (
    <div ref={ref} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-base font-medium text-fg transition-colors duration-[var(--dur-fast)] hover:bg-wash-hover"
      >
        <Icon name="Book" size={16} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-start">{selected.title}</span>
        <Icon name="SwitchHorizontal" size={14} className="shrink-0 text-fg-4" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Switch course"
          className="absolute start-0 top-full z-30 mt-1 w-full min-w-[180px] rounded-md bg-surface p-1 shadow-[var(--shadow-strong)]"
        >
          {courses.map((course) => (
            <button
              key={course.id}
              type="button"
              role="option"
              aria-selected={course.id === selected.id}
              onClick={() => {
                onSelect(course.id);
                setOpen(false);
              }}
              className={cx(
                'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-base text-start',
                'transition-colors duration-[var(--dur-fast)] hover:bg-wash-hover',
                course.id === selected.id ? 'font-medium text-fg' : 'text-fg-2',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{course.title}</span>
              {course.id === selected.id && (
                <Icon name="Check" size={14} className="shrink-0 text-accent" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
