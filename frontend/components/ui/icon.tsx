import * as React from 'react';
import icons, { type IconName } from './icon-data';

export type { IconName };

/**
 * A Tabler glyph, stroke-drawn.
 *
 * Sizes, from the design system: **14** inside a button, **16** in nav, menus
 * and fields, **20-24** in page headers and empty states. Stroke is 1.6, which
 * is the source file's Regular weight - the system also has Light and Bold, but
 * nothing in this product uses them, so a caller reaching for `strokeWidth` is
 * usually reaching for the wrong thing.
 *
 * Glyphs paint with `currentColor`, so they recolour from the CSS `color` of
 * whatever contains them. Never give an icon its own colour utility when the
 * text beside it already has one - that is how a row ends up with a 4-tint
 * label and a 2-tint icon.
 *
 * `aria-hidden` by default, because in this system an icon is next to its label
 * essentially everywhere. The exceptions are icon-only controls, and those get
 * their accessible name from the button (`IconButton` requires a `label`), not
 * from the glyph - so the default is right there too.
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  ...rest
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
} & Omit<React.SVGProps<SVGSVGElement>, 'name' | 'width' | 'height' | 'ref'>) {
  const glyph = icons[name];

  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // The path data is a compile-time constant in `icon-data.ts` - a build
      // artifact of the design handoff, not content, and nothing user-supplied
      // can reach it. That is the whole reason this is acceptable here while
      // CLAUDE.md 5.19 bans the same call on a blog body: there the input is a
      // string an assistant typed, and a stored-XSS hole against every reader
      // of the public blog is not worth italics. Here there is no input.
      //
      // If icon data ever becomes something a person can add to, this stops
      // being safe and the data has to be parsed into real elements instead.
      dangerouslySetInnerHTML={{ __html: glyph.body }}
      {...rest}
    />
  );
}
