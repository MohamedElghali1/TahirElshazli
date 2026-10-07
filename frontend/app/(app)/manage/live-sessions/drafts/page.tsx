'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatTime } from '@/lib/format';
import type { LiveSession } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { CARD_COLORS } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { SessionForm } from '../session-form';

/**
 * `/manage/live-sessions/drafts` (`SESS-4`): `planned` sessions for the
 * caller's in-scope groups, with a **Publish** action.
 *
 * Publish is idempotent server-side (`ManageLiveSessionsService.publish` is a
 * 200 no-op on an already-published session) - this screen still reflects the
 * new state without a reload, by replacing the row locally rather than
 * re-fetching the whole list.
 *
 * Redesign V2: the artifact's draft-timetable rows. Its "Publish timetable"
 * (all at once, with a student notification) has no route behind it — publish
 * stays per session, as before — and the per-row room is not a session field.
 */
export default function DraftTimetablePage() {
  const { token } = useSession();
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<LiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError, loading, reload } = useApi(
    (t) => api.staff.sessions.planned(t),
    [],
  );

  const { data: courses } = useApi((t) => api.staff.courses(t), []);
  const { data: groups } = useApi(
    async (t) => {
      if (!courses) return [];
      const lists = await Promise.all(courses.map((c) => api.staff.courseGroups(t, c.id)));
      return lists.flat();
    },
    [courses],
  );
  const groupIndex = new Map((groups ?? []).map((g, i) => [g.id, { name: g.name, i }]));

  const list = data?.filter((s) => !publishedIds.has(s.id)) ?? null;

  async function publish(session: LiveSession) {
    if (!token) return;
    setError(null);
    setPublishingId(session.id);
    try {
      await api.staff.sessions.publish(token, session.id);
      setPublishedIds((prev) => new Set(prev).add(session.id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not publish that session.');
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <>
      <PageTitle title="Draft timetable" backHref="/manage/live-sessions" />
      {editing && (
        <SessionForm
          groups={groups ?? []}
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      <section aria-labelledby="tt-h" className="cl-panel pb-4">
        <PanelHead id="tt-h" title="Draft timetable" className="mb-2">
          <Link href="/manage/live-sessions" className="cl-btns">
            <span aria-hidden className="rtl:rotate-180">
              ←
            </span>
            Live sessions
          </Link>
        </PanelHead>
        {error && (
          <div role="alert" className="cl-soft mb-2" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
        {loading && !list && <ClSkeleton rows={3} label="Loading drafts" />}
        {loadError && <ClError message={loadError.message} onRetry={reload} />}
        {list && list.length === 0 && (
          <ClEmpty
            icon="schedule"
            tone="cl-tone-blue"
            title="No drafts"
            hint="Save a session as a draft on the week grid and it appears here until you publish it."
          />
        )}
        {list?.map((s) => {
          const g = groupIndex.get(s.groupId);
          const color = CARD_COLORS[(g?.i ?? 0) % CARD_COLORS.length];
          const d = new Date(s.scheduledAt);
          return (
            <div key={s.id} className="cl-grow" style={{ cursor: 'default' }}>
              <span className="w-[52px] flex-none text-center">
                <span className="cl-muted block text-[12px]">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className="block text-[20px]">{d.getDate()}</span>
              </span>
              <span className="h-9 w-[6px] flex-none rounded-[3px]" style={{ background: color.ring }} />
              <span className="cl-grow-main">
                <span className="block truncate">
                  {g?.name ?? 'Group'} · {s.title}
                </span>
                <span className="cl-sub">
                  {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {formatTime(s.scheduledAt)} –{' '}
                  {formatTime(s.endsAt)}
                </span>
              </span>
              <button type="button" className="cl-glink" onClick={() => setEditing(s)}>
                Edit
              </button>
              <button type="button" className="cl-btnp" disabled={publishingId === s.id} onClick={() => void publish(s)}>
                {publishingId === s.id ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
