'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'te.theme';

/**
 * Three-state theme in two clicks: the page follows the system until someone
 * chooses, then the choice sticks. Written to `data-theme` on <html>, which is
 * the selector every token block in tokens.css keys off.
 *
 * The resolved theme is read from the DOM rather than held in component state.
 * `THEME_BOOTSTRAP` in app/layout.tsx has already stamped `data-theme` before
 * first paint, so the attribute is the source of truth and this component is
 * only reflecting it - which is what `useSyncExternalStore` is for. Mirroring it
 * into `useState` inside an effect would mean a render with the wrong icon, a
 * second render to correct it, and a hydration mismatch to suppress.
 */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing the theme fires `storage` here, not in that tab.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      applyAttribute(readStored() ?? systemTheme());
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** What the DOM currently says, falling back to the system preference. */
function getSnapshot(): Theme {
  const attribute = document.documentElement.getAttribute('data-theme');
  if (attribute === 'dark' || attribute === 'light') {
    return attribute;
  }
  return systemTheme();
}

/**
 * On the server there is no DOM and no stored choice, so the markup is rendered
 * for the default (dark) and the bootstrap script corrects the attribute before
 * paint. The icon is hidden until mount for the same reason.
 */
function getServerSnapshot(): Theme {
  return 'dark';
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function applyAttribute(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeToggle({
  className,
  size = 'md',
}: {
  className?: string;
  /** `sm` is the 24px/radius-4 icon button used in the app header's single
   *  40px bar (TASK 2); every other caller keeps the original 32px control. */
  size?: 'sm' | 'md';
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // True only after hydration, so the button does not render an icon the
  // server could not have known was correct.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const toggle = useCallback(() => {
    const next: Theme = getSnapshot() === 'light' ? 'dark' : 'light';
    applyAttribute(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked. The choice still holds for this page load.
    }
    emit();
  }, []);

  const icon = !mounted ? null : theme === 'light' ? (
    <MoonIcon size={16} weight="regular" />
  ) : (
    <SunIcon size={16} weight="regular" />
  );

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      className={
        (size === 'sm'
          ? 'inline-flex h-[var(--h-sm)] w-[var(--h-sm)] items-center justify-center rounded-[var(--r-sm)] '
          : 'inline-flex h-[var(--h-md)] w-[var(--h-md)] items-center justify-center rounded-[var(--r-md)] ') +
        'text-fg-3 transition-colors ' +
        'duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)] hover:text-fg ' +
        (className ?? '')
      }
    >
      {icon}
    </button>
  );
}
