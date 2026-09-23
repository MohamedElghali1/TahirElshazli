'use client';

import { use } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { Button, EmptyState, Loader } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { TaskForm } from '../task-form';

/**
 * `/manage/tasks/[id]` (`TASK-7`): the same form in edit mode.
 *
 * Loaded from `GET /staff/tasks` - there is no single-task staff read (plan
 * finding 4), and at ~40 tasks a list read is fine. That list is group-grain,
 * so a task the caller cannot reach is simply not found here, the same answer
 * the write routes give.
 */
export default function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi((t) => api.staff.tasks(t), [id]);
  const task = data?.find((t) => t.id === id) ?? null;

  return (
    <>
      <PageTitle title={task?.title ?? 'Task'} backHref="/manage/tasks" />
      <div className="p-6">
        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading task" />
          </div>
        )}
        {error && (
          <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />
        )}
        {data && !task && <EmptyState icon="ListDetails" title="Task not found" />}
        {/* Keyed so a reload after a save re-seeds the form from the server. */}
        {task && <TaskForm key={`${task.id}`} task={task} />}
      </div>
    </>
  );
}
