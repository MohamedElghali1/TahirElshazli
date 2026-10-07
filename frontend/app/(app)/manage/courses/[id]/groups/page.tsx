'use client';

import { use, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { GroupMemberView, GroupSummary } from '@/lib/types';
import { initialsOf } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';

/**
 * Groups on one course, and the placement screen (CLAUDE.md §5.16, §2.2).
 *
 * **Placement is a TA power** - the client said so directly: a student is
 * assigned to a group "by the assistant or the teacher". Attaching a course to
 * a group is not, so that lives on the admin group screen; this page is what a
 * TA opens to move students between cohorts.
 *
 * The screen this page really exists for is the **"enrolled, not yet placed"**
 * list. After 2026-09-10 an unplaced student sees a course with no work in it
 * and no learning mode of its own - §5.16 calls that out as looking like a
 * working course that happens to be empty, which is what gets reported as "the
 * site is broken". Nobody should sit in that state unnoticed, so it is the
 * first thing on the page and it is loud when it is non-empty.
 */
export default function CourseGroupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = use(params);
  const { token, user } = useSession();

  const groupsCall = useApi((t) => api.staff.courseGroups(t, courseId), [courseId]);
  const rosterCall = useApi((t) => api.staff.roster(t, courseId), [courseId]);

  return (
    <>
      {(groupsCall.loading || rosterCall.loading) && !groupsCall.data && (
        <section className="cl-panel">
          <ClSkeleton rows={3} label="Loading groups" />
        </section>
      )}

      {groupsCall.error && (
        <section className="cl-panel">
          <ClError message={groupsCall.error.message} onRetry={groupsCall.reload} />
        </section>
      )}

      {groupsCall.data && rosterCall.data && (
        <CourseGroups
          token={token}
          admin={isAdminRole(user?.role)}
          groups={groupsCall.data}
          enrolled={rosterCall.data.entries.map((entry) => ({
            studentId: entry.studentId,
            name: entry.name,
          }))}
          onChanged={groupsCall.reload}
        />
      )}
    </>
  );
}

interface EnrolledStudent {
  studentId: string;
  name: string;
}

function CourseGroups({
  token,
  admin,
  groups,
  enrolled,
  onChanged,
}: {
  token: string | null;
  admin: boolean;
  groups: GroupSummary[];
  enrolled: EnrolledStudent[];
  onChanged: () => void;
}) {
  /**
   * Every group's roster, fetched once here rather than inside each card.
   *
   * The unplaced list is `enrolled` minus the union of these, so it cannot be
   * computed from one card's data - and refetching per card would also make
   * "who is unplaced" disagree with itself while the cards loaded at different
   * times.
   */
  const [rosters, setRosters] = useState<Record<string, GroupMemberView[]>>({});
  const [version, setVersion] = useState(0);

  const rostersCall = useApi(
    async (t) => {
      const entries = await Promise.all(
        groups.map(async (group) => [group.id, await api.staff.groupMembers(t, group.id)] as const),
      );
      const next = Object.fromEntries(entries);
      setRosters(next);
      return next;
    },
    [groups.map((g) => g.id).join(','), version],
  );

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    onChanged();
  }, [onChanged]);

  const placedIds = useMemo(
    () => new Set(Object.values(rosters).flat().map((m) => m.studentId)),
    [rosters],
  );
  const unplaced = useMemo(
    () => enrolled.filter((student) => !placedIds.has(student.studentId)),
    [enrolled, placedIds],
  );

  if (groups.length === 0) {
    return (
      <section className="cl-panel">
        <ClEmpty
          icon="groups"
          tone="cl-tone-blue"
          title="No groups on this course yet"
          hint={
            'A group is a class of students, and a course is taught to one or ' +
            'more of them. Until a group is enrolled in this course, students ' +
            'who hold it have no cohort and are set no work. Dr. Tahir creates ' +
            'groups and adds courses to them from Groups in the sidebar.'
          }
        />
      </section>
    );
  }

  return (
    <>
      {rostersCall.error && (
        <section className="cl-panel">
          <ClError message={rostersCall.error.message} onRetry={refresh} />
        </section>
      )}

      <UnplacedPanel
        token={token}
        students={unplaced}
        groups={groups}
        loading={rostersCall.loading}
        onPlaced={refresh}
      />

      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          token={token}
          admin={admin}
          otherGroups={groups.filter((g) => g.id !== group.id)}
          members={rosters[group.id] ?? []}
          loading={rostersCall.loading}
          onChanged={refresh}
        />
      ))}
    </>
  );
}

/**
 * The list that keeps a self-enrolled student from silently sitting in an empty
 * course (§7.2, §5.16). Deliberately first on the page and deliberately styled
 * as something to act on rather than as a statistic.
 */
function UnplacedPanel({
  token,
  students,
  groups,
  loading,
  onPlaced,
}: {
  token: string | null;
  students: EnrolledStudent[];
  groups: GroupSummary[];
  loading: boolean;
  onPlaced: () => void;
}) {
  if (loading) {
    return (
      <section aria-labelledby="up-h" className="cl-panel">
        <PanelHead id="up-h" title="Enrolled, not yet placed" />
        <ClSkeleton rows={1} label="Loading" />
      </section>
    );
  }

  if (students.length === 0) {
    return (
      <section aria-labelledby="up-h" className="cl-panel">
        <PanelHead id="up-h" title="Enrolled, not yet placed" className="mb-2" />
        <p className="cl-muted m-0 px-2 text-[14px]">Everyone enrolled in this course is in a group. Nothing to do here.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="up-h" className="cl-panel pb-4">
      <PanelHead id="up-h" title="Enrolled, not yet placed">
        <span className="text-[14px]" style={{ color: 'var(--cl-warn)' }}>
          {students.length} {students.length === 1 ? 'student' : 'students'}
        </span>
      </PanelHead>
      <p className="cl-soft mb-3 mt-0 text-[14px]">
        These students hold this course but sit in no group, so they have been set no work and their
        course page looks empty. Place them to fix it.
      </p>
      {students.map((student) => (
        <div key={student.studentId} className="cl-grow flex-wrap" style={{ cursor: 'default' }}>
          <span className="cl-av">{initialsOf(student.name)}</span>
          <span className="cl-grow-main truncate">{student.name}</span>
          <PlaceStudent token={token} studentId={student.studentId} groups={groups} onPlaced={onPlaced} />
        </div>
      ))}
    </section>
  );
}

/** A group picker and one button. The write is per student, deliberately. */
function PlaceStudent({
  token,
  studentId,
  groups,
  onPlaced,
}: {
  token: string | null;
  studentId: string;
  groups: GroupSummary[];
  onPlaced: () => void;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const place = async () => {
    if (!token || !groupId) return;
    setBusy(true);
    setError(null);
    try {
      await api.staff.addGroupMember(token, groupId, studentId);
      onPlaced();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not place that student.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Group for this student"
        className="cl-inp min-w-[200px]"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <button type="button" className="cl-btns" onClick={() => void place()} disabled={busy || !groupId}>
        {busy ? 'Placing…' : 'Place'}
      </button>
      {error && (
        <span role="alert" className="text-[13px]" style={{ color: 'var(--cl-bad)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

function GroupCard({
  group,
  token,
  admin,
  otherGroups,
  members,
  loading,
  onChanged,
}: {
  group: GroupSummary;
  token: string | null;
  /** Removing a member and bulk-moving are both teacher/admin only (§5.16). */
  admin: boolean;
  otherGroups: GroupSummary[];
  members: GroupMemberView[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState('');
  const [moving, setMoving] = useState(false);

  const remove = async (studentId: string) => {
    if (!token) return;
    setRemoving(studentId);
    setError(null);
    try {
      await api.staff.removeGroupMember(token, group.id, studentId);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that student.');
    } finally {
      setRemoving(null);
    }
  };

  const moveSelected = async () => {
    if (!token || !moveTo || selected.length === 0) return;
    setMoving(true);
    setError(null);
    try {
      await api.admin.bulkMoveMembers(token, moveTo, selected);
      setSelected([]);
      setMoveTo('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not move those students.');
    } finally {
      setMoving(false);
    }
  };

  return (
    <section aria-labelledby={`grp-${group.id}`} className="cl-panel pb-4">
      <PanelHead
        id={`grp-${group.id}`}
        title={
          <Link href={`/manage/groups/${group.id}/report`} className="text-inherit no-underline hover:underline">
            {group.name}
          </Link>
        }
      >
        <span className="cl-muted text-[13px]">
          {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
        </span>
      </PanelHead>
      {error && (
        <div role="alert" className="cl-soft mb-2" style={{ color: 'var(--cl-bad)' }}>
          {error}
        </div>
      )}
      {loading && <ClSkeleton rows={2} label="Loading" />}
      {!loading && members.length === 0 && <p className="cl-muted m-0 px-2 text-[14px]">Nobody is in this group yet.</p>}
      {!loading &&
        members.map((member) => (
          <div key={member.studentId} className="cl-grow" style={{ cursor: 'default' }}>
            {admin && otherGroups.length > 0 && (
              <input
                type="checkbox"
                aria-label={`Select ${member.name} to move`}
                checked={selected.includes(member.studentId)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked ? [...ids, member.studentId] : ids.filter((id) => id !== member.studentId),
                  )
                }
              />
            )}
            <span className="cl-av">{initialsOf(member.name)}</span>
            <span className="cl-grow-main">
              <span className="block truncate">{member.name}</span>
              <span className="cl-sub">
                {member.email} · placed {formatDate(member.assignedAt)}
              </span>
            </span>
            {/* Removing is teacher/admin only (§5.16) - hidden for a TA
                rather than offered and then refused server-side. */}
            {admin && (
              <button
                type="button"
                className="cl-glink cl-glink--danger"
                onClick={() => void remove(member.studentId)}
                disabled={removing === member.studentId}
              >
                {removing === member.studentId ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
        ))}

      {/* "Move N to group" (GROUP-3) - admin only, same as the removal above. */}
      {admin && otherGroups.length > 0 && selected.length > 0 && (
        <div className="cl-soft mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[14px]">Move {selected.length} selected to</span>
          <select
            aria-label="Destination group"
            className="cl-inp min-w-[200px]"
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            <option value="">Choose a group…</option>
            {otherGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="button" className="cl-btnp" disabled={moving || !moveTo} onClick={() => void moveSelected()}>
            {moving ? 'Moving…' : 'Move'}
          </button>
        </div>
      )}
    </section>
  );
}
