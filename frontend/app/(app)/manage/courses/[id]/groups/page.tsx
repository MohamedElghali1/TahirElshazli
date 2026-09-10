'use client';

import { use, useCallback, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { GroupMemberView, GroupSummary } from '@/lib/types';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  FormError,
  Panel,
  RowsSkeleton,
  Select,
  cx,
} from '@/components/ui';
import {
  ManageCourseTabs,
  PageBody,
  PageHeader,
} from '@/components/app/page-parts';

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
export default function CourseGroupsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = use(params);
  const { token, user } = useSession();
  const admin = user?.role === 'teacher';

  const groupsCall = useApi(
    (t) => api.staff.courseGroups(t, courseId),
    [courseId],
  );
  const rosterCall = useApi((t) => api.staff.roster(t, courseId), [courseId]);

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="The cohorts this course is taught to, and who sits in each."
      />
      <ManageCourseTabs courseId={courseId} admin={admin} />
      <PageBody className="flex flex-col gap-[var(--sp-5)]">
        {(groupsCall.loading || rosterCall.loading) && <RowsSkeleton rows={5} />}

        {groupsCall.error && (
          <ErrorState
            message={groupsCall.error.message}
            onRetry={groupsCall.reload}
          />
        )}

        {groupsCall.data && rosterCall.data && (
          <CourseGroups
            courseId={courseId}
            token={token}
            groups={groupsCall.data}
            enrolled={rosterCall.data.entries.map((entry) => ({
              studentId: entry.studentId,
              name: entry.name,
            }))}
            onChanged={groupsCall.reload}
          />
        )}
      </PageBody>
    </>
  );
}

interface EnrolledStudent {
  studentId: string;
  name: string;
}

function CourseGroups({
  courseId,
  token,
  groups,
  enrolled,
  onChanged,
}: {
  courseId: string;
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
        groups.map(
          async (group) =>
            [group.id, await api.staff.groupMembers(t, group.id)] as const,
        ),
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
      <Panel bodyClassName="">
        <EmptyState
          title="No groups on this course yet"
          body={
            'A group is a class of students, and a course is taught to one or ' +
            'more of them. Until a group is enrolled in this course, students ' +
            'who hold it have no cohort and are set no work. Dr. Tahir creates ' +
            'groups and adds courses to them from Groups in the sidebar.'
          }
        />
      </Panel>
    );
  }

  return (
    <>
      {rostersCall.error && (
        <ErrorState message={rostersCall.error.message} onRetry={refresh} />
      )}

      <UnplacedPanel
        courseId={courseId}
        token={token}
        students={unplaced}
        groups={groups}
        loading={rostersCall.loading}
        onPlaced={refresh}
      />

      <div className="flex flex-col gap-[var(--sp-4)]">
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
  courseId,
  token,
  students,
  groups,
  loading,
  onPlaced,
}: {
  courseId: string;
  token: string | null;
  students: EnrolledStudent[];
  groups: GroupSummary[];
  loading: boolean;
  onPlaced: () => void;
}) {
  if (loading) {
    return (
      <Panel title="Enrolled, not yet placed">
        <RowsSkeleton rows={2} />
      </Panel>
    );
  }

  if (students.length === 0) {
    return (
      <Panel title="Enrolled, not yet placed">
        <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
          Everyone enrolled in this course is in a group. Nothing to do here.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Enrolled, not yet placed"
      className="border-[var(--accent)]"
      action={
        <Chip tone="amber">
          {students.length} {students.length === 1 ? 'student' : 'students'}
        </Chip>
      }
    >
      <p className="mb-[var(--sp-4)] text-[var(--fs-base)] text-[var(--fg-secondary)]">
        These students hold this course but sit in no group, so they have been
        set no work and their course page looks empty. Place them to fix it.
      </p>
      <ul className="flex flex-col gap-[var(--sp-2)]">
        {students.map((student) => (
          <li
            key={student.studentId}
            className="flex flex-wrap items-center justify-between gap-[var(--sp-3)] rounded-[var(--r-md)] border border-[var(--border-light)] px-[var(--sp-3)] py-[var(--sp-2)]"
          >
            <span className="text-[var(--fs-base)] text-[var(--fg-primary)]">
              {student.name}
            </span>
            <PlaceStudent
              token={token}
              courseId={courseId}
              studentId={student.studentId}
              groups={groups}
              onPlaced={onPlaced}
            />
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
  courseId: string;
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
      setError(
        err instanceof ApiError ? err.message : 'Could not place that student.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
      <label className="sr-only" htmlFor={`place-${studentId}`}>
        Group for this student
      </label>
      <Select
        id={`place-${studentId}`}
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className="min-w-[200px]"
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={place} disabled={busy || !groupId}>
        {busy ? 'Placing…' : 'Place'}
      </Button>
      {error && <FormError>{error}</FormError>}
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
      setError(
        err instanceof ApiError ? err.message : 'Could not remove that student.',
      );
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Panel
      title={group.name}
      action={
        <div className="flex items-center gap-[var(--sp-2)]">
          {pairing && (
            /* §5.2 - the mode belongs to this pairing, not to the student. */
            <Chip tone={pairing.learningMode === 'live' ? 'violet' : 'neutral'}>
              {pairing.learningMode === 'live' ? 'Live' : 'Recorded'}
            </Chip>
          )}
          <Chip>
            {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
          </Chip>
        </div>
      }
    >
      {error && <FormError>{error}</FormError>}
      {loading && <RowsSkeleton rows={2} />}
      {!loading && members.length === 0 && (
        <p className="text-[var(--fs-base)] text-[var(--fg-tertiary)]">
          Nobody is in this group yet.
        </p>
      )}
      {!loading && members.length > 0 && (
        <ul className="flex flex-col gap-[var(--sp-1)]">
          {members.map((member) => (
            <li
              key={member.studentId}
              className={cx(
                'flex flex-wrap items-center justify-between gap-[var(--sp-3)]',
                'rounded-[var(--r-md)] px-[var(--sp-3)] py-[var(--sp-2)]',
                'hover:bg-[var(--bg-tertiary)]',
              )}
            >
              <span className="flex flex-col">
                <span className="text-[var(--fs-base)] text-[var(--fg-primary)]">
                  {member.name}
                </span>
                <span className="text-[var(--fs-sm)] text-[var(--fg-tertiary)]">
                  {member.email} · placed {formatDate(member.assignedAt)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(member.studentId)}
                disabled={removing === member.studentId}
              >
                {removing === member.studentId ? 'Removing…' : 'Remove'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
