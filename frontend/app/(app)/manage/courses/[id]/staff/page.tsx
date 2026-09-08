'use client';

import { use, useState } from 'react';
import { TrashIcon } from '@phosphor-icons/react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { CourseStaffMember } from '@/lib/types';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Panel,
  RowsSkeleton,
  Select,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';

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
export default function CourseStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      setError(
        cause instanceof ApiError ? cause.message : 'Could not assign that assistant.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
      <Panel title="Assigned assistants" bodyClassName="">
        {assigned.loading && <RowsSkeleton rows={2} />}
        {assigned.error && (
          <ErrorState message={assigned.error.message} onRetry={assigned.reload} />
        )}
        {assigned.data && assigned.data.length === 0 && (
          <EmptyState
            title="No assistants on this course"
            body="An assistant can only grade, mark attendance and post announcements for courses they are assigned to."
          />
        )}
        {assigned.data && assigned.data.length > 0 && (
          <ul className="rows">
            {assigned.data.map((member) => (
              <li key={member.userId}>
                <StaffRow
                  courseId={id}
                  member={member}
                  onRemoved={assigned.reload}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Assign an assistant">
        <form onSubmit={assign} noValidate className="flex flex-col gap-[var(--sp-4)]">
          <Field
            label="Assistant"
            htmlFor="userId"
            hint="They will immediately see this course's roster, submissions and recordings."
          >
            <Select id="userId" name="userId" required disabled={available.length === 0}>
              {available.length === 0 ? (
                <option value="">No assistants available</option>
              ) : (
                available.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} — {candidate.email}
                  </option>
                ))
              )}
            </Select>
          </Field>

          {error && <FormError>{error}</FormError>}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={available.length === 0}
            >
              Assign
            </Button>
          </div>
        </form>
      </Panel>
    </PageBody>
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
    <div className="flex flex-wrap items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
          {member.name}
        </span>
        <span className="mt-[var(--sp-1)] block truncate text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {member.email} · assigned {formatDate(member.assignedAt)}
        </span>
        {error && (
          <span className="mt-[var(--sp-1)] block text-[var(--fs-xs)] text-[var(--chip-red-fg)]">
            {error}
          </span>
        )}
      </span>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-[var(--sp-2)]">
          <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            Remove access?
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
          <Button size="sm" variant="danger" loading={busy} onClick={() => void unassign()}>
            Remove
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remove ${member.name}`}
          onClick={() => setConfirming(true)}
        >
          <TrashIcon size={14} />
        </Button>
      )}
    </div>
  );
}
