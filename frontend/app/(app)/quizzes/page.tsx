'use client';

import { EmptyState } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';

/**
 * Quizzes — designed, but no backend yet (`docs/redesign-mapping.md` "Designed,
 * but no backend": driving this from the existing `work_type: 'google_form'`
 * assessment data is `docs/redesign-mapping.md`'s own Decision 2, but
 * `docs/phases/unit-4/PHASE_PLAN.md` §1 explicitly keeps Quizzes in this
 * unit's OUT list until that work has its own slice. Honest placeholder only.
 */
export default function QuizzesPage() {
  return (
    <>
      <PageTitle title="Quizzes" />
      <div className="p-6">
        <EmptyState
          icon="ListNumbers"
          title="Quizzes are not available yet"
          description="This screen is planned but not built. Quiz-type work you have been set still appears under Homework."
        />
      </div>
    </>
  );
}
