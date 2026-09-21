'use client';

import { use, useCallback, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { GroupMemberView, GroupSummary } from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  Panel,
  Select,
  SectionTitle,
  Tag,
} from '@/components/ui';

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
  const { token } = useSession();

  const groupsCall = useApi((t) => api.staff.courseGroups(t, courseId), [courseId]);
  const rosterCall = useApi((t) => api.staff.roster(t, courseId), [courseId]);

  return (
    <div className="flex flex-col gap-5 p-6">
      <SectionTitle title="Groups" description="The cohorts this course is taught to, and who sits in each." />
      {(groupsCall.loading || rosterCall.loading) && (
        <div className="flex justify-center p-8">
          <Loader label="Loading groups" />
        </div>
      )}

      {groupsCall.error && (
        <EmptyState
          icon="AlertTriangle"
          title={groupsCall.error.message}
          action={<Button onClick={groupsCall.reload}>Try again</Button>}
        />
      )}

      {groupsCall.data && rosterCall.data && (
        <CourseGroups
          token={token}
          groups={groupsCall.data}
          enrolled={rosterCall.data.entries.map((entry) => ({
            studentId: entry.studentId,
            name: entry.name,
          }))}
          onChanged={groupsCall.reload}
        />
      )}
    </div>
  );
}

interface EnrolledStudent {
  studentId: string;
  name: string;
}

function CourseGroups({
  token,
  groups,
  enrolled,
  onChanged,
}: {
  token: string | null;
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
      <EmptyState
        icon="Hierarchy2"
        title="No groups on this course yet"
        description={
          'A group is a class of students, and a course is taught to one or ' +
          'more of them. Until a group is enrolled in this course, students ' +
          'who hold it have no cohort and are set no work. Dr. Tahir creates ' +
          'groups and adds courses to them from Groups in the sidebar.'
        }
      />
    );
  }

  return (
    <>
      {rostersCall.error && (
        <EmptyState
          icon="AlertTriangle"
          title={rostersCall.error.message}
          action={<Button onClick={refresh}>Try again</Button>}
        />
      )}

      <UnplacedPanel
        token={token}
        students={unplaced}
        groups={groups}
        loading={rostersCall.loading}
        onPlaced={refresh}
      />

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            token={token}
            members={rosters[group.id] ?? []}
            loading={rostersCall.loading}
            onChanged={refresh}
          />
        ))}
      </div>
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
      <Panel title="Enrolled, not yet placed">
        <div className="flex justify-center p-4">
          <Loader label="Loading" />
        </div>
      </Panel>
    );
  }

  if (students.length === 0) {
    return (
      <Panel title="Enrolled, not yet placed">
        <p className="text-base text-fg-3">Everyone enrolled in this course is in a group. Nothing to do here.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Enrolled, not yet placed"
      className="shadow-[inset_0_0_0_1px_var(--accent)]"
      action={
        <Tag tone="amber">
          {students.length} {students.length === 1 ? 'student' : 'students'}
        </Tag>
      }
    >
      <p className="mb-4 text-base text-fg-2">
        These students hold this course but sit in no group, so they have been set no work and their
        course page looks empty. Place them to fix it.
      </p>
      <ul className="flex flex-col gap-2">
        {students.map((student) => (
          <li
            key={student.studentId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-light px-3 py-2"
          >
            <span className="text-base text-fg">{student.name}</span>
            <PlaceStudent token={token} studentId={student.studentId} groups={groups} onPlaced={onPlaced} />
          </li>
        ))}
      </ul>
    </Panel>
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
      <Select
        aria-label="Group for this student"
        className="min-w-[200px]"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
      />
      <Button size="small" onClick={place} disabled={busy || !groupId}>
        {busy ? <Loader size={3} label="Placing" /> : 'Place'}
      </Button>
      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
    </div>
  );
}

function GroupCard({
  group,
  token,
  members,
  loading,
  onChanged,
}: {
  group: GroupSummary;
  token: string | null;
  members: GroupMemberView[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  // The pairing for *this* course - `courseGroups` returns exactly one.
  const pairing = group.courses[0];

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

  return (
    <Panel
      title={group.name}
      action={
        <div className="flex items-center gap-2">
          {pairing && (
            /* §5.2 - the mode belongs to this pairing, not to the student. */
            <Tag tone={pairing.learningMode === 'live' ? 'violet' : 'gray'}>
              {pairing.learningMode === 'live' ? 'Live' : 'Recorded'}
            </Tag>
          )}
          <Tag tone="gray">
            {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
          </Tag>
        </div>
      }
    >
      {error && <InlineBanner tone="danger" className="mb-3">{error}</InlineBanner>}
      {loading && (
        <div className="flex justify-center p-4">
          <Loader label="Loading" />
        </div>
      )}
      {!loading && members.length === 0 && <p className="text-base text-fg-3">Nobody is in this group yet.</p>}
      {!loading && members.length > 0 && (
        <ul className="flex flex-col gap-1">
          {members.map((member) => (
            <li
              key={member.studentId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-wash-hover"
            >
              <span className="flex flex-col">
                <span className="text-base text-fg">{member.name}</span>
                <span className="text-xs text-fg-3">
                  {member.email} · placed {formatDate(member.assignedAt)}
                </span>
              </span>
              <Button
                variant="tertiary"
                size="small"
                onClick={() => remove(member.studentId)}
                disabled={removing === member.studentId}
              >
                {removing === member.studentId ? <Loader size={3} label="Removing" /> : 'Remove'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
