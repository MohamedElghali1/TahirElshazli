import * as React from 'react';
import { cx } from './cx';

/**
 * A person, as initials on a tinted ground or as their photo.
 *
 * The tint is derived from the name, so one person is the same colour on every
 * screen without anything being stored. That stability is the feature: a roster,
 * a grading queue and a classmate grid all agree, and nobody has to pick a
 * colour when a student is created.
 *
 * Sizes in use: **16** in a menu row, **20** in a table cell and the sidebar
 * identity row, **24** in a classmate grid, **28** in the student header, **32**
 * beside a teacher's note, **72** in the profile-photo panel.
 *
 * The colours are the raw 4/11 steps rather than semantic tokens on purpose —
 * they carry no meaning at all here, which is exactly why they must not come
 * from the status scale. A green avatar does not mean the student is passing.
 */

const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['var(--colors-indigo-4)', 'var(--colors-indigo-11)'],
  ['var(--colors-green-4)', 'var(--colors-green-11)'],
  ['var(--bright-yellow-4)', 'var(--bright-yellow-11)'],
  ['var(--colors-red-4)', 'var(--colors-red-11)'],
  ['var(--colors-purple-4)', 'var(--colors-purple-11)'],
  ['var(--colors-pink-4)', 'var(--colors-pink-11)'],
  ['var(--colors-orange-4)', 'var(--colors-orange-11)'],
  ['var(--colors-teal-4)', 'var(--colors-teal-11)'],
];

/**
 * First letters of the first two words.
 *
 * `Array.from` rather than `[0]`, because a JavaScript string index returns a
 * UTF-16 code unit and would split an astral character in half. Arabic names
 * are in the roster on purpose (CLAUDE.md §4) and nothing here may assume Latin
 * metrics — `ليلى فهمي` has to come out as "لف", not as a replacement glyph.
 */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

function tintFor(name: string): readonly [string, string] {
  let index = 0;
  for (const char of name) index = (index + char.codePointAt(0)!) % PALETTE.length;
  return PALETTE[index];
}

export function Avatar({
  name = '',
  src,
  size = 16,
  shape = 'rounded',
  className,
  ...rest
}: {
  name?: string;
  /** A photo. When set, initials are not rendered. */
  src?: string | null;
  size?: number;
  shape?: 'rounded' | 'circle';
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const [bg, fg] = tintFor(name);
  return (
    <span
      {...rest}
      // The name is already beside this everywhere the system uses it, so
      // repeating it here would make a screen reader say it twice.
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden font-sans font-semibold leading-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? 'var(--radius-pill)' : Math.max(2, Math.round(size * 0.22)),
        background: src ? `center/cover no-repeat url(${src})` : bg,
        color: fg,
        fontSize: Math.max(7, Math.round(size * 0.45)),
      }}
    >
      {src ? '' : initials(name)}
    </span>
  );
}

/**
 * Overlapping avatars with a count. For "who is in this group" at a glance —
 * never as the only way to reach the people it shows.
 */
export function AvatarGroup({
  people,
  size = 20,
  max = 4,
  className,
  ...rest
}: {
  people: ReadonlyArray<{ name: string; src?: string | null }>;
  size?: number;
  max?: number;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const shown = people.slice(0, max);
  const rest_ = people.length - shown.length;
  return (
    <span {...rest} className={cx('inline-flex items-center', className)}>
      {shown.map((person, i) => (
        <Avatar
          key={`${person.name}-${i}`}
          name={person.name}
          src={person.src}
          size={size}
          shape="circle"
          className="ring-2 ring-surface"
          style={{ marginInlineStart: i === 0 ? 0 : -Math.round(size * 0.3) }}
        />
      ))}
      {rest_ > 0 && (
        <span className="num ms-1 text-xs text-fg-4">+{rest_}</span>
      )}
    </span>
  );
}
