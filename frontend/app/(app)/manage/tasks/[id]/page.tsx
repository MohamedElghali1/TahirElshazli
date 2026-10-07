'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { PageTitle } from '@/components/shell/page-chrome';
import { BackLink, ClEmpty, ClError, ClSkeleton } from '@/components/classroom/ui';
import { DeleteTaskModal, TaskForm } from '../task-form';

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
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <PageTitle title={task?.title ?? 'Task'} backHref="/manage/tasks" />
      <BackLink href="/manage/tasks">All tasks</BackLink>
      {loading && !data && (
        <section className="cl-panel">
          <ClSkeleton rows={3} label="Loading task" />
        </section>
      )}
      {error && (
        <section className="cl-panel">
          <ClError message={error.message} onRetry={reload} />
        </section>
      )}
      {data && !task && (
        <section className="cl-panel">
          <ClEmpty icon="tasks" title="Task not found" />
        </section>
      )}
      {task && (
        <section className="cl-panel flex flex-wrap items-center gap-3">
          <span className="cl-muted">Work on this task</span>
          {task.workType === 'file_upload' && (
            <Link href={`/manage/tasks/${task.id}/submissions`} className="cl-glink">
              Submissions
            </Link>
          )}
          {task.workType === 'google_form' && (
            <Link href={`/manage/tasks/${task.id}/results`} className="cl-glink">
              Results
            </Link>
          )}
          <button type="button" className="cl-glink cl-glink--danger ms-auto" onClick={() => setDeleting(true)}>
            Delete
          </button>
        </section>
      )}
      {task && deleting && (
        <DeleteTaskModal task={task} onClose={() => setDeleting(false)} onDeleted={() => router.push('/manage/tasks')} />
      )}
      {/* Keyed so a reload after a save re-seeds the form from the server. */}
      {task && <TaskForm key={`${task.id}`} task={task} />}
    </>
  );
}
