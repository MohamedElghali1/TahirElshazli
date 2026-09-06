'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { AppShell } from '@/components/app/app-shell';

/**
 * Client-side guard. It keeps signed-out visitors off the app shell, and that
 * is all it does - every endpoint behind it is `@Roles(Role.Student)` and
 * enforced server-side (CLAUDE.md §8). This never becomes the access control.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Reading sessionStorage takes one effect tick. Rendering the shell before
  // it resolves would flash the app at someone who is not signed in.
  if (loading || !user) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-primary)]"
        aria-busy
      >
        <span className="sr-only">Loading</span>
        <span
          aria-hidden
          className="h-[var(--sp-4)] w-[var(--sp-4)] animate-spin rounded-[var(--r-full)] border-2 border-[var(--border-strong)] border-r-transparent"
        />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
