'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'te.theme';

/** What <html> without a `data-theme` paints. Not a preference — a fact about the CSS. */
const CSS_DEFAULT: Theme = 'light';

/**
 * Two-state theme: light until someone chooses dark, then the choice sticks.
 * Written to `data-theme` on <html>, which is the selector every token block in
 * tokens.css keys off.
 *
 * It does **not** follow the OS, and must not: `fig-tokens.css` carries no
 * `prefers-color-scheme` block, so an unset attribute always paints light
 * (app/layout.tsx explains why — it is the handoff's decision). Resolving the OS
 * here instead made the control lie on any machine set to dark: the page painted
 * light, the button read "Switch to light theme", and the first click stamped
 * the theme already on screen, changing nothing (`F14-1`).
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
      applyAttribute(readStored() ?? CSS_DEFAULT);
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** What the DOM currently says, falling back to what an unset attribute paints. */
function getSnapshot(): Theme {
  const attribute = document.documentElement.getAttribute('data-theme');
  if (attribute === 'dark' || attribute === 'light') {
    return attribute;
  }
  return CSS_DEFAULT;
}

/**
 * On the server there is no DOM and no stored choice, so the markup is rendered
 * for the default and the bootstrap script corrects the attribute before paint.
 * The icon is hidden until mount for the same reason.
 */
function getServerSnapshot(): Theme {
  return CSS_DEFAULT;
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
          ? 'inline-flex h-6 w-6 items-center justify-center rounded-sm '
          : 'inline-flex h-8 w-8 items-center justify-center rounded-md ') +
        'text-fg-3 transition-colors ' +
        'duration-[var(--dur-fast)] hover:bg-wash-hover hover:text-fg ' +
        (className ?? '')
      }
    >
      {icon}
    </button>
  );
}
