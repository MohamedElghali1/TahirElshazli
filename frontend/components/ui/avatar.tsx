import { cx } from './cx';
import { initials } from '@/lib/format';

/**
 * Initials in a circle. No photography exists for any account yet, so this is
 * the avatar rather than a placeholder for one - when `avatarUrl` lands on the
 * user shape it becomes an `<img>` with this as the fallback.
 *
 * Sizes follow the control scale so an avatar lines up with the button beside
 * it: 24 in a table row, 32 in the shell.
 */
export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-size={size}
      className={cx(
        'num inline-flex shrink-0 items-center justify-center rounded-[var(--r-full)]',
        'bg-[var(--bg-quaternary)] font-semibold text-[var(--fg-secondary)]',
        size === 'sm'
          ? 'h-[var(--h-sm)] w-[var(--h-sm)] text-[var(--fs-xxs)]'
          : 'h-[var(--h-md)] w-[var(--h-md)] text-[var(--fs-xs)]',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
