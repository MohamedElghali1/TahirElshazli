'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatTime } from '@/lib/format';
import type { AttendanceSheetItem, AttendanceStatus, GroupMemberView } from '@/lib/types';
import {
  Avatar,
  Button,
  ButtonGroup,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Table,
  type Column,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * The attendance sheet (`SESS-3`), reached from a session row on the week
 * grid. There is no `GET /staff/sessions/:id` route to re-fetch the session
 * itself from just the id, so the group and the caption the header needs
 * travel as query params from the link that opened this page - the same data
 * the caller already had on screen a click ago.
 *
 * The sheet endpoint (`GET /staff/sessions/:sessionId/attendance`) returns
 * `{ studentId, status }` and no name - joined here client-side from
 * `api.staff.groupMembers`, which is the right trade at ~30 students a group
 * (`PHASE_PLAN.md`, `CLAUDE.md` §1) rather than a backend change.
 */
export default function SessionAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const searchParams = useSearchParams();
  const groupId = searchParams.get('groupId') ?? '';
  const title = searchParams.get('title');
  const scheduledAt = searchParams.get('scheduledAt');
  const { token } = useSession();

  const {
    data: sheet,
    error: sheetError,
    loading: sheetLoading,
    reload: reloadSheet,
  } = useApi((t) => api.staff.sessions.attendance(t, sessionId), [sessionId]);

  const {
    data: members,
    error: membersError,
    loading: membersLoading,
  } = useApi(
    (t) => (groupId ? api.staff.groupMembers(t, groupId) : Promise.resolve<GroupMemberView[]>([])),
    [groupId],
  );

  const [marks, setMarks] = useState<Map<string, AttendanceStatus | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seed the editable state from the sheet's own read - a re-fetch (`reload`)
  // after a save would otherwise leave the local marks stale. Same documented
  // exception as `lib/session.tsx`'s storage read: syncing local state from an
  // external system (here, the API response) on its arrival, not a cascade.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sheet) setMarks(new Map(sheet.map((s) => [s.studentId, s.status])));
  }, [sheet]);

  const nameById = new Map((members ?? []).map((m) => [m.studentId, m.name]));

  function setStatus(studentId: string, status: AttendanceStatus) {
    setSaved(false);
    setMarks((prev) => new Map(prev).set(studentId, status));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      // Only students actually marked go in the write - an untouched student
      // stays `null` server-side, never defaulted to `absent`.
      const entries = [...marks.entries()]
        .filter((entry): entry is [string, AttendanceStatus] => entry[1] !== null)
        .map(([studentId, status]) => ({ studentId, status }));
      await api.staff.sessions.markAttendance(token, sessionId, entries);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<AttendanceSheetItem>[] = [
    {
      label: 'Student',
      render: (r) => {
        const name = nameById.get(r.studentId) ?? r.studentId;
        return (
          <span className="inline-flex items-center gap-2">
            <Avatar name={name} size={20} shape="circle" />
            {name}
          </span>
        );
      },
    },
    {
      label: 'Attendance',
      align: 'end',
      render: (r) => {
        const status = marks.get(r.studentId) ?? null;
        const name = nameById.get(r.studentId) ?? r.studentId;
        return (
          <ButtonGroup aria-label={`Attendance for ${name}`}>
            <Button
              size="small"
              position="left"
              active={status === 'present'}
              onClick={() => setStatus(r.studentId, 'present')}
            >
              Present
            </Button>
            <Button
              size="small"
              position="middle"
              active={status === 'late'}
              onClick={() => setStatus(r.studentId, 'late')}
            >
              Late
            </Button>
            <Button
              size="small"
              position="right"
              active={status === 'absent'}
              onClick={() => setStatus(r.studentId, 'absent')}
            >
              Absent
            </Button>
          </ButtonGroup>
        );
      },
    },
  ];

  const firstError = sheetError ?? membersError;

  return (
    <>
      <PageTitle title={title ? `Attendance · ${title}` : 'Attendance'} backHref="/manage/live-sessions" />
      <div className="flex flex-col gap-4 p-6">
        {scheduledAt && (
          <p className="num text-xs text-fg-3">
            {formatDate(scheduledAt)} · {formatTime(scheduledAt)}
          </p>
        )}
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        {saved && <InlineBanner tone="green">Attendance saved.</InlineBanner>}

        <Panel padded={false}>
          {(sheetLoading || membersLoading) && !sheet && (
            <div className="flex justify-center p-8">
              <Loader label="Loading attendance" />
            </div>
          )}
          {firstError && (
            <EmptyState icon="AlertTriangle" title={firstError.message} action={<Button onClick={reloadSheet}>Try again</Button>} />
          )}
          {sheet && (
            <Table
              columns={columns}
              rows={sheet}
              rowKey={(r) => r.studentId}
              empty={<EmptyState icon="Users" title="Nobody in this group yet" />}
            />
          )}
        </Panel>

        {sheet && sheet.length > 0 && (
          <Button variant="primary" className="self-start" disabled={saving} onClick={save}>
            {saving ? <Loader size={3} label="Saving" /> : 'Save attendance'}
          </Button>
        )}
      </div>
    </>
  );
}
