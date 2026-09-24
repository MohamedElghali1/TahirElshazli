'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { isStaffRole } from '@/lib/roles';
import { ConsoleShell } from '@/components/shell/console-shell';
import { StudentShell } from '@/components/shell/student-shell';

/**
 * Client-side routing guard. Two jobs, and neither of them is access control -
 * every endpoint behind this layout is guarded by `@Roles` server-side
 * (CLAUDE.md §8), and this never becomes the thing that keeps data safe.
 *
 * 1. Keep signed-out visitors off the app shell.
 * 2. Put each role in its own console. The student LMS (/dashboard, /learn,
 *    /catalog, /profile) is `@Roles(Role.Student)` end to end, so a teacher
 *    landing there gets a wall of 403s from a screen that looks broken rather
 *    than restricted - CLAUDE.md §7.1 records exactly that symptom. Sending
 *    them to /manage instead is the fix, and the mirror case keeps a student
 *    out of a console whose every request would refuse them.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const staff = isStaffRole(user?.role);
  const inManage = pathname.startsWith('/manage');
  const misplaced = Boolean(user) && staff !== inManage;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (staff && !inManage) router.replace('/manage');
    else if (!staff && inManage) router.replace('/dashboard');
  }, [loading, user, staff, inManage, router]);

  // Reading sessionStorage takes one effect tick. Rendering the shell before it
  // resolves would flash the app at someone who is not signed in - and
  // rendering a misplaced page would fire its API calls and collect a 403
  // before the redirect lands.
  if (loading || !user || misplaced) {
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-surface"
        aria-busy
      >
        <span className="sr-only">Loading</span>
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-r-transparent"
        />
      </div>
    );
  }

  return staff ? (
    <ConsoleShell>{children}</ConsoleShell>
  ) : (
    <StudentShell>{children}</StudentShell>
  );
}
