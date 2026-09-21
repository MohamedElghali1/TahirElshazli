'use client';

import { useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { ButtonLink } from '@/components/ui';
import { PageActions } from '@/components/app/page-chrome';

/**
 * The one header action every `/manage/*` screen shares (TASK 2 of the
 * Twenty visual-parity pass) - registered here, once, rather than by each
 * page, because it does not change between them.
 *
 * There is deliberately no staff live-session *create* flow behind this
 * button yet. The backend route is `POST /admin/courses/:id/live-sessions`
 * (`@Roles(Role.Teacher)` - CLAUDE.md §11 shipped scheduling teacher-only and
 * left it open whether a TA ever gets it) and it is per-course, which a
 * global header has no course id to give it. Rather than invent an endpoint
 * or a page this build does not have, the button routes to the course list -
 * the same "pick a course first" shape the Recordings screen already uses -
 * until a per-course scheduling screen exists.
 *
 * TODO(live-sessions): once `/manage/courses/[id]/live-sessions` (or similar)
 * exists, point this at a course picker or a create dialog instead of the
 * bare course list.
 *
 * Gated to the teacher: a TA who followed this link would only find every
 * course refusing them a "Schedule" control that isn't there in the first
 * place, since the course tabs have no such tab and the write is
 * teacher-only. Showing the action to a role it cannot exercise would be a
 * broken affordance dressed as a feature.
 */
function ManageActions() {
  const { user } = useSession();
  if (!isAdminRole(user?.role)) return null;
  return (
    <ButtonLink href="/manage/courses" variant="primary" size="small" icon="Plus">
      Live Session
    </ButtonLink>
  );
}

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageActions>
        <ManageActions />
      </PageActions>
      {children}
    </>
  );
}
