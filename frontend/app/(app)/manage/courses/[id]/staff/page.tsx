'use client';

import { use, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { CourseStaffMember } from '@/lib/types';
import { Button, EmptyState, InlineBanner, Loader, Panel, Select } from '@/components/ui';

/**
 * Who may work on this course.
 *
 * This is the single most consequential write in the console: a row here is
 * what `StaffScopeService` reads on every TA request, so adding one grants
 * access to a whole course's students, work and marks. Both directions are
 * audited (CLAUDE.md §5.4), which is why the backend refuses to log an assign
 * that granted nothing.
 *
 * Admin only. A TA never sees this tab and would get 403 from `/admin/*`
 * anyway (§2.2, §8).
 */
export default function CourseStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const assigned = useApi((t) => api.admin.courseStaff(t, id), [id]);
  const candidates = useApi((t) => api.admin.assistants(t), []);

  // Anyone already on the course is not offered again - the backend 409s on a
  // duplicate, and an option that always errors is not a real option.
  const assignedIds = new Set((assigned.data ?? []).map((m) => m.userId));
  const available = (candidates.data ?? []).filter((c) => !assignedIds.has(c.id));

  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const userId = String(new FormData(event.currentTarget).get('userId') ?? '');
    if (!userId) return;
    setError(null);
    setBusy(true);
    try {
      await api.admin.assignStaff(token, id, userId);
      assigned.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not assign that assistant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Panel title="Assigned assistants" bodyClassName="">
        {assigned.loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading assigned assistants" />
          </div>
        )}
        {assigned.error && (
          <EmptyState
            icon="AlertTriangle"
            title={assigned.error.message}
            action={<Button onClick={assigned.reload}>Try again</Button>}
          />
        )}
        {assigned.data && assigned.data.length === 0 && (
          <EmptyState
            icon="Briefcase"
            title="No assistants on this course"
            description="An assistant can only grade, mark attendance and post announcements for courses they are assigned to."
          />
        )}
        {assigned.data && assigned.data.length > 0 && (
          <ul className="divide-y divide-border-light">
            {assigned.data.map((member) => (
              <li key={member.userId}>
                <StaffRow courseId={id} member={member} onRemoved={assigned.reload} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Assign an assistant">
        <form onSubmit={assign} noValidate className="flex flex-col gap-4">
          <Select
            label="Assistant"
            id="userId"
            name="userId"
            required
            disabled={available.length === 0}
            hint="They will immediately see this course's roster, submissions and recordings."
            options={
              available.length === 0
                ? [{ value: '', label: 'No assistants available' }]
                : available.map((candidate) => ({
                    value: candidate.id,
                    label: `${candidate.name} — ${candidate.email}`,
                  }))
            }
          />

          {error && <InlineBanner tone="danger">{error}</InlineBanner>}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={busy || available.length === 0}>
              {busy ? <Loader size={3} label="Assigning" /> : 'Assign'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function StaffRow({
  courseId,
  member,
  onRemoved,
}: {
  courseId: string;
  member: CourseStaffMember;
  onRemoved: () => void;
}) {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unassign() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.unassignStaff(token, courseId, member.userId);
      onRemoved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove that.');
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-fg">{member.name}</span>
        <span className="mt-1 block truncate text-xs text-fg-3">
          {member.email} · assigned {formatDate(member.assignedAt)}
        </span>
        {error && <span className="mt-1 block text-xs text-status-red-text">{error}</span>}
      </span>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-fg-3">Remove access?</span>
          <Button size="small" variant="tertiary" onClick={() => setConfirming(false)}>
            Keep
          </Button>
          <Button size="small" variant="primary" accent="danger" disabled={busy} onClick={() => void unassign()}>
            {busy ? <Loader size={3} label="Removing" /> : 'Remove'}
          </Button>
        </span>
      ) : (
        <Button
          size="small"
          variant="tertiary"
          icon="Trash"
          aria-label={`Remove ${member.name}`}
          onClick={() => setConfirming(true)}
        />
      )}
    </div>
  );
}
