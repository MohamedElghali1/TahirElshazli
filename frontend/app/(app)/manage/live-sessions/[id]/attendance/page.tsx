'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatTime } from '@/lib/format';
import type { AttendanceStatus, GroupMemberView } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { initialsOf } from '@/components/shell/classroom';
import { BackLink, ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

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
 *
 * Redesign V2: the artifact's "Session detail". Saving stays an explicit
 * button (the API takes one write for the whole sheet). The artifact's end
 * time, status, meeting link, description and an "excused" mark are not
 * available here: no single-session read exists and the status enum is
 * present / late / absent.
 */
const SEG: { status: AttendanceStatus; label: string; on: string }[] = [
  { status: 'present', label: 'Attended', on: 'on-a' },
  { status: 'late', label: 'Late', on: 'on-l' },
  { status: 'absent', label: 'Absent', on: 'on-x' },
];

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

  // The group's name, from the same fan-out the week grid uses.
  const { data: groupLabel } = useApi(
    async (t) => {
      if (!groupId) return null;
      const courses = await api.staff.courses(t);
      const lists = await Promise.all(courses.map((c) => api.staff.courseGroups(t, c.id)));
      return lists.flat().find((g) => g.id === groupId)?.name ?? null;
    },
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

  function markAll() {
    if (!sheet) return;
    setSaved(false);
    setMarks(new Map(sheet.map((s) => [s.studentId, 'present'])));
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

  const firstError = sheetError ?? membersError;
  const count = (s: AttendanceStatus) => (sheet ?? []).filter((r) => marks.get(r.studentId) === s).length;
  const nA = count('present');
  const nL = count('late');
  const nX = count('absent');
  const nU = (sheet?.length ?? 0) - nA - nL - nX;

  return (
    <>
      <PageTitle title={title ? `Attendance · ${title}` : 'Attendance'} backHref="/manage/live-sessions" />
      <BackLink href="/manage/live-sessions">All sessions</BackLink>

      <section aria-labelledby="sd-h" className="cl-panel">
        <PanelHead id="sd-h" title={title ?? 'Session'} className="mb-4" />
        <div className="cl-muted -mt-3 mb-4 text-[14px]">
          {[groupLabel, sheet ? `${sheet.length} ${sheet.length === 1 ? 'student' : 'students'}` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {scheduledAt && (
          <div className="grid gap-5 px-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <div className="cl-flab m-0 mb-1">Date</div>
              {formatDate(scheduledAt)}
            </div>
            <div>
              <div className="cl-flab m-0 mb-1">Starts</div>
              {formatTime(scheduledAt)}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="att-h" className="cl-panel pb-3">
        <PanelHead id="att-h" title="Attendance" className="mb-2">
          {sheet && sheet.length > 0 && (
            <>
              {saved && (
                <span role="status" className="cl-muted text-[13px]">
                  Attendance saved.
                </span>
              )}
              <button type="button" className="cl-glink" onClick={markAll}>
                Mark all attended
              </button>
              <button type="button" className="cl-btnp" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save attendance'}
              </button>
            </>
          )}
        </PanelHead>
        {sheet && sheet.length > 0 && (
          <div className="cl-muted mb-2 px-2 text-[13px]">
            {nA} attended · {nL} late · {nX} absent · {nU} not marked
          </div>
        )}
        {error && (
          <div role="alert" className="cl-soft mb-2" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
        {(sheetLoading || membersLoading) && !sheet && <ClSkeleton rows={4} label="Loading attendance" />}
        {firstError && <ClError message={firstError.message} onRetry={reloadSheet} />}
        {sheet && sheet.length === 0 && <ClEmpty icon="groups" tone="cl-tone-blue" title="Nobody in this group yet" />}
        {sheet?.map((r) => {
          const name = nameById.get(r.studentId) ?? r.studentId;
          const status = marks.get(r.studentId) ?? null;
          return (
            <div key={r.studentId} className="cl-grow" style={{ cursor: 'default' }}>
              <span className="cl-av">{initialsOf(name)}</span>
              <span className="cl-grow-main truncate">{name}</span>
              <div className="cl-seg3" role="group" aria-label={`Attendance for ${name}`}>
                {SEG.map((o) => (
                  <button
                    key={o.status}
                    type="button"
                    aria-pressed={status === o.status}
                    className={status === o.status ? o.on : undefined}
                    onClick={() => setStatus(r.studentId, o.status)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
