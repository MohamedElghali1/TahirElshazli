'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { Assistant, GroupSummary, StaffCourseSummary } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { CARD_COLORS, ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClModal, ClSkeleton, PanelHead, useToast } from '@/components/classroom/ui';

/**
 * Groups: create one, name it, and decide what it studies (CLAUDE.md §5.16).
 * Redesign V2, the artifact's GROUPS: a coloured card per group, "New group"
 * and Edit in a modal.
 *
 * **Admin only, and that is a deliberate narrow reading.** The client's
 * instruction covered *placement* explicitly and said nothing about who
 * creates a group, so creation shipped teacher-only. A TA reaches placement
 * through a course's Groups tab.
 *
 * A group is a class of students studying one course (migration 013) - not a
 * subdivision. Naming a course on a group enrols nobody; `Enrollment` stays
 * the access gate.
 *
 * The artifact's per-group Perf / Quiz / Task / Attend percentages are not
 * drawn: the group list returns no such figures (the report screen has the
 * real ones), so cards show only the record's own fields. Member add / remove
 * is not on this screen in the app - it lives on the course's Groups tab, which
 * the card links to.
 */
export default function GroupsPage() {
  const { data, error, loading, reload } = useApi((t) => api.admin.groups(t), []);
  const courses = useApi((t) => api.staff.courses(t), []);
  const assistants = useApi((t) => api.admin.assistants(t), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, flash] = useToast();

  const editing = data?.find((g) => g.id === editingId) ?? null;
  const assistantName = new Map((assistants.data ?? []).map((a) => [a.id, a.name]));

  return (
    <>
      <PageTitle title="Groups" />
      <section aria-labelledby="gr-h" className="cl-panel">
        <PanelHead id="gr-h" title="Groups" className="mb-5">
          <button type="button" className="cl-btnp" onClick={() => setCreating(true)}>
            <ClIcon name="plus" small />
            New group
          </button>
        </PanelHead>
        <p className="cl-muted -mt-2 mb-4 text-[13.5px]">A group is a class of students, studying one course.</p>

        {loading && !data && !error && <ClSkeleton rows={2} label="Loading groups" />}
        {error && (
          <ClError
            message={error.isAuth ? "You don't have access to this page." : error.message}
            onRetry={error.isAuth ? undefined : reload}
          />
        )}
        {data && data.length === 0 && (
          <ClEmpty
            icon="groups"
            tone="cl-tone-blue"
            title="No groups yet"
            hint='Use "New group". A group with no members has been set no work.'
          />
        )}

        {data && data.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {data.map((group, i) => {
              const c = CARD_COLORS[i % CARD_COLORS.length];
              const course = (courses.data ?? []).find((x) => x.id === group.courseId);
              const aName = group.assistantId ? assistantName.get(group.assistantId) : null;
              return (
                <div key={group.id} className="cl-card relative">
                  <Link
                    href={`/manage/groups/${group.id}/report`}
                    aria-label={`Open the report for ${group.name}`}
                    className="absolute inset-0 z-0 rounded-[inherit]"
                  />
                  <span className="cl-cardh" style={{ background: c.bg }}>
                    <span className="ring" style={{ background: c.ring }} />
                    <span className="cl-cardt">{group.name}</span>
                    <span className="cl-cards" style={{ color: 'var(--cl-blue-soft)' }}>
                      {group.memberCount} {group.memberCount === 1 ? 'student' : 'students'}
                      {aName ? ` · ${aName}` : ''}
                    </span>
                  </span>
                  <span className="block min-h-[72px] flex-1 p-4">
                    <Link
                      href={`/manage/courses/${group.courseId}/groups`}
                      className="relative z-10 block truncate text-[14px] text-fg no-underline hover:underline"
                    >
                      {course?.title ?? group.courseId}
                    </Link>
                    <span className="cl-muted mt-1 block truncate text-[13px]">
                      {[group.meets, group.room].filter(Boolean).join(' · ') || 'No meeting time set'}
                    </span>
                    <span className="cl-muted mt-1 block text-[12.5px]">Created {formatDate(group.createdAt)}</span>
                  </span>
                  <span className="cl-cardf justify-end">
                    <button type="button" className="cl-glink relative z-10" onClick={() => setEditingId(group.id)}>
                      Edit
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {creating && (
        <GroupModal
          courses={courses.data ?? []}
          assistants={[]}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            flash('Group created');
            reload();
          }}
        />
      )}
      {editing && (
        <GroupModal
          group={editing}
          courses={courses.data ?? []}
          assistants={(assistants.data ?? []).filter((a) => a.role === 'assistant')}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            flash('Group saved');
            reload();
          }}
        />
      )}
      {toast}
    </>
  );
}

/** One form for both: no `group` creates (name + course), a `group` edits. */
function GroupModal({
  group,
  courses,
  assistants,
  onClose,
  onSaved,
}: {
  group?: GroupSummary;
  courses: StaffCourseSummary[];
  assistants: Assistant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [name, setName] = useState(group?.name ?? '');
  const [courseId, setCourseId] = useState(group?.courseId ?? '');
  const [assistantId, setAssistantId] = useState(group?.assistantId ?? '');
  const [meets, setMeets] = useState(group?.meets ?? '');
  const [room, setRoom] = useState(group?.room ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = Boolean(name.trim()) && (group ? true : Boolean(courseId));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (group) {
        await api.admin.updateGroup(token, group.id, {
          name: name.trim(),
          courseId,
          assistantId: assistantId || null,
          meets: meets.trim() || null,
          room: room.trim() || null,
        });
      } else {
        await api.admin.createGroup(token, { name: name.trim(), courseId });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : group ? 'Could not save this group.' : 'Could not create that group.');
      setBusy(false);
    }
  };

  return (
    <ClModal
      open
      title={group ? `Edit ${group.name}` : 'New group'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="group-form" className="cl-btnp" disabled={busy || !valid}>
            {busy ? 'Saving…' : group ? 'Save changes' : 'Create group'}
          </button>
        </>
      }
    >
      <form id="group-form" onSubmit={submit} className="cl-fgrid">
        {error && (
          <p role="alert" className="cl-soft m-0" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}
        {group && group.memberCount > 0 && (
          <p className="cl-muted m-0 text-[13px]">
            This group has {group.memberCount} member{group.memberCount === 1 ? '' : 's'} — changing its course is
            refused while they would be left enrolled on the old one.
          </p>
        )}
        <div className="cl-f2">
          <label className="cl-fl">
            Name
            <input
              className="cl-inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="IGCSE Chemistry — Saturday 18:00"
              maxLength={120}
              required
            />
          </label>
          <label className="cl-fl">
            Course
            <select className="cl-inp" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {!group && <option value="">Choose a course…</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {group && (
          <>
            <label className="cl-fl">
              Assistant (display only — grants no access)
              <select className="cl-inp" value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                <option value="">None</option>
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="cl-f2">
              <label className="cl-fl">
                Meets
                <input
                  className="cl-inp"
                  value={meets}
                  onChange={(e) => setMeets(e.target.value)}
                  placeholder="Saturday 18:00"
                  maxLength={120}
                />
              </label>
              <label className="cl-fl">
                Room
                <input className="cl-inp" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={80} />
              </label>
            </div>
          </>
        )}
      </form>
    </ClModal>
  );
}
