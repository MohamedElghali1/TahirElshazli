'use client';

import { ButtonLink } from '@/components/ui';
import { PageActions } from '@/components/shell/page-chrome';

/**
 * The one header action every `/manage/*` screen shares (TASK 2 of the
 * Twenty visual-parity pass) - registered here, once, rather than by each
 * page, because it does not change between them.
 *
 * Opens the week grid with its "New session" form already open (`?new=1`,
 * read by `live-sessions/page.tsx`). It used to point at the bare course list,
 * written before `POST /staff/groups/:groupId/sessions` existed, which left
 * the teacher with no way to schedule from here at all.
 *
 * Shown to every staff role: `D-6` puts sessions on the group grain, so an
 * assistant may schedule for the groups they hold (the server enforces it).
 */
function ManageActions() {
  return (
    <ButtonLink href="/manage/live-sessions?new=1" variant="primary" size="small" icon="Plus">
      Live session
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
