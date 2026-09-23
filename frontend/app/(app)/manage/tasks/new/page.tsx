'use client';

import { useSearchParams } from 'next/navigation';
import { PageTitle } from '@/components/shell/page-chrome';
import { TaskForm } from '../task-form';

/**
 * `/manage/tasks/new[?course=&draft=]` (`TASK-7`). The draft library's "Use"
 * action lands here with both set, and the form prefills from that draft.
 */
export default function NewTaskPage() {
  const params = useSearchParams();
  return (
    <>
      <PageTitle title="New task" backHref="/manage/tasks" />
      <div className="p-6">
        <TaskForm
          task={null}
          initialCourseId={params.get('course') ?? ''}
          initialDraftId={params.get('draft')}
        />
      </div>
    </>
  );
}
