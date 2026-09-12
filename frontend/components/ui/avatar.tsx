import { cx } from './cx';
import { initials } from '@/lib/format';

/**
 * Initials in a circle. No photography exists for any account yet, so this is
 * the avatar rather than a placeholder for one - when `avatarUrl` lands on the
 * user shape it becomes an `<img>` with this as the fallback.
 *
 * Sizes follow the control scale so an avatar lines up with the button beside
 * it: 24 in a table row, 32 in the shell.
 *
 * `xs` is the exception and is deliberately a rounded *square*, not a circle:
 * it is the workspace mark in the rail's top chip, which the reference system
 * draws as a 16px squircle at the tag radius. A circle there reads as a
 * person, and the thing it stands for is an organisation.
 */
const AVATAR_SIZE = {
  xs: 'h-[var(--icon-md)] w-[var(--icon-md)] rounded-[var(--r-sm)] text-[var(--fs-xxs)]',
  sm: 'h-[var(--h-sm)] w-[var(--h-sm)] rounded-[var(--r-full)] text-[var(--fs-xxs)]',
  md: 'h-[var(--h-md)] w-[var(--h-md)] rounded-[var(--r-full)] text-[var(--fs-xs)]',
} as const;

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-size={size}
      className={cx(
        'num inline-flex shrink-0 items-center justify-center',
        'bg-[var(--bg-quaternary)] font-semibold text-[var(--fg-secondary)]',
        AVATAR_SIZE[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
