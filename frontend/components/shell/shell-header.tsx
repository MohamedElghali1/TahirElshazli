'use client';

import { useRouter } from 'next/navigation';
import { usePageChrome } from '@/components/shell/page-chrome';
import { ThemeToggle } from '@/components/theme-toggle';
import { IconButton } from '@/components/ui';

/**
 * The 52px sticky crumb header both shells share (`docs/redesign-mapping.md`
 * gives both the same figure). Reads its title/back-link/actions from
 * `PageChromeProvider`, unchanged from the legacy shell's contract — only
 * this markup moved.
 */
export function ShellHeader({
  open,
  onToggle,
}: {
  /** Whether the mobile off-canvas sidebar is open. */
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const { chrome, actions } = usePageChrome();

  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-border-light bg-surface px-4">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          icon={open ? 'X' : 'Menu'}
          label={open ? 'Close navigation' : 'Open navigation'}
          variant="tertiary"
          aria-expanded={open}
          onClick={onToggle}
          className="md:hidden"
        />
        {chrome?.backHref && (
          <IconButton
            icon="ChevronLeft"
            label="Back"
            variant="tertiary"
            onClick={() => router.push(chrome.backHref as string)}
            className="rtl:rotate-180"
          />
        )}
        {chrome?.title && (
          <h1 className="truncate text-base font-semibold text-fg">{chrome.title}</h1>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <ThemeToggle size="sm" />
      </div>
    </header>
  );
}
