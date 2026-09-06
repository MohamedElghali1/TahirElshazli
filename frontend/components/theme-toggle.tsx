'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';

type Theme = 'dark' | 'light';

/**
 * Three-state theme in two clicks: the page follows the system until someone
 * chooses, then the choice sticks. Written to `data-theme` on <html>, which is
 * the selector every token block in tokens.css keys off.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = safeGet();
    if (stored) {
      setTheme(stored);
      return;
    }
    setTheme(
      window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark',
    );
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('te.theme', next);
    } catch {
      // Storage blocked. The choice still holds for this page load.
    }
  };

  // Render nothing until the effect has resolved the current theme, or the
  // button shows the wrong icon for one frame.
  const icon =
    theme === null ? null : theme === 'light' ? (
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
        'inline-flex h-[var(--h-lg)] w-[var(--h-lg)] items-center justify-center ' +
        'rounded-[var(--r-md)] text-[var(--fg-tertiary)] transition-colors ' +
        'duration-[var(--dur-fast)] hover:bg-[var(--bg-wash)] hover:text-[var(--fg-primary)] ' +
        (className ?? '')
      }
    >
      {icon}
    </button>
  );
}

function safeGet(): Theme | null {
  try {
    const v = localStorage.getItem('te.theme');
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}
