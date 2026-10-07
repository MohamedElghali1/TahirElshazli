'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { addDays, formatTime, formatWeekday, startOfWeek } from '@/lib/format';
import type { LiveSession } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClModal, ClRowMenu, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { SessionForm } from './session-form';

/**
 * `/manage/live-sessions` (`SESS-5`): the week grid across every group the
 * caller reaches. Shows both `planned` and `published` - the console sees
 * both, the student surface (`/timetable`) never sees `planned` at all.
 *
 * The group filter has no dedicated "my groups" route, so it is built the
 * same way `manage/tasks/page.tsx` builds its own group filter: from data the
 * caller already reaches, here `staff.courses` fanned out through
 * `staff.courseGroups` per course rather than a post-filter over a wider read.
 *
 * Redesign V2: the artifact's "Live sessions" panel. It draws a Students
 * count and an attendance summary per row; the list route returns neither, so
 * those columns are not drawn (the attendance sheet is one click away).
 */
const GRID = '2fr 1fr 1.3fr 1fr 1fr 0.7fr 0.8fr 44px';

export default function LiveSessionsPage() {
  const { token } = useSession();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState<LiveSession | 'new' | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The console header's "Live session" button lands here with `?new=1`.
  // Open the form, then drop the param so a refresh or a second click of
  // the same button still works.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wantsNew = searchParams.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing('new');
    router.replace(pathname);
  }, [wantsNew, router, pathname]);

  const { data: courses } = useApi((t) => api.staff.courses(t), []);
  const { data: groups } = useApi(
    async (t) => {
      if (!courses) return [];
      const lists = await Promise.all(courses.map((c) => api.staff.courseGroups(t, c.id)));
      return lists.flat();
    },
    [courses],
  );

  const from = weekStart.toISOString();
  const to = useMemo(() => {
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }, [weekStart]);

  const {
    data,
    error: loadError,
    loading,
    reload,
  } = useApi(
    (t) => api.staff.sessions.list(t, { from, to, groupId: groupId || undefined }),
    [from, to, groupId],
  );

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const confirming = data?.find((s) => s.id === confirmingId) ?? null;

  async function cancelSession(session: LiveSession) {
    if (!token) return;
    setError(null);
    try {
      await api.staff.sessions.cancel(token, session.id);
      setConfirmingId(null);
      reload();
    } catch (cause) {
      setConfirmingId(null);
      setError(cause instanceof ApiError ? cause.message : 'Could not cancel that session.');
    }
  }

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <>
      <PageTitle title="Live sessions" />
      {editing && (
        <SessionForm
          groups={groups ?? []}
          session={editing === 'new' ? null : editing}
          defaultGroupId={groupId || undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      <ClModal
        open={Boolean(confirming)}
        title="Cancel this session?"
        onClose={() => setConfirmingId(null)}
        footer={
          <>
            <button type="button" className="cl-btns" onClick={() => setConfirmingId(null)}>
              Keep it
            </button>
            <button type="button" className="cl-btnp" onClick={() => confirming && void cancelSession(confirming)}>
              Cancel session
            </button>
          </>
        }
      >
        <p className="m-0">{confirming?.title}</p>
      </ClModal>

      <section aria-labelledby="lv-h" className="cl-panel pb-4">
        <PanelHead id="lv-h" title="Live sessions">
          <Link href="/manage/live-sessions/drafts" className="cl-btns">
            <ClIcon name="schedule" small />
            Draft timetable
          </Link>
          <button type="button" className="cl-btnp" onClick={() => setEditing('new')}>
            <ClIcon name="plus" small />
            New session
          </button>
        </PanelHead>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select aria-label="Group" className="cl-inp w-[200px]" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All groups</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <span className="ms-auto inline-flex items-center gap-2">
            <button
              type="button"
              className="cl-gib cl-gib--sm rotate-180 rtl:rotate-0"
              aria-label="Previous week"
              onClick={() => setWeekStart((w) => addDays(w, -7))}
            >
              <ClIcon name="chevRight" small />
            </button>
            <span className="cl-muted min-w-[110px] text-center text-[13px]">{rangeLabel}</span>
            <button
              type="button"
              className="cl-gib cl-gib--sm rtl:rotate-180"
              aria-label="Next week"
              onClick={() => setWeekStart((w) => addDays(w, 7))}
            >
              <ClIcon name="chevRight" small />
            </button>
          </span>
        </div>

        {error && (
          <div role="alert" className="cl-soft mb-3" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
        {loading && !data && <ClSkeleton rows={3} label="Loading sessions" />}
        {loadError && <ClError message={loadError.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <ClEmpty
            icon="schedule"
            tone="cl-tone-blue"
            title="Nothing scheduled this week"
            hint="Set a session for a group you hold and it appears here."
          />
        )}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <div className="cl-gt" role="table" aria-label="Sessions" style={{ minWidth: 860 }}>
              <div className="hd" role="row" style={{ gridTemplateColumns: GRID }}>
                <span>Session</span>
                <span>Date</span>
                <span>Time</span>
                <span>Group</span>
                <span>Status</span>
                <span>Link</span>
                <span>Attendance</span>
                <span />
              </div>
              {data.map((s) => (
                <div key={s.id} className="rw" role="row" style={{ gridTemplateColumns: GRID }}>
                  <span className="truncate">{s.title}</span>
                  <span className="cl-muted">
                    {formatWeekday(s.scheduledAt)}{' '}
                    {new Date(s.scheduledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="cl-muted">
                    {formatTime(s.scheduledAt)} – {formatTime(s.endsAt)}
                  </span>
                  <span className="cl-muted truncate">{groupName.get(s.groupId) ?? '—'}</span>
                  <span className="inline-flex items-center gap-2 text-[14px]">
                    <span className="cl-dot" style={{ background: s.state === 'published' ? 'var(--cl-ok)' : 'var(--cl-warn)' }} />
                    {s.state === 'published' ? 'Published' : 'Draft'}
                  </span>
                  <span>
                    {s.meetingLink ? (
                      <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="cl-glink">
                        Open
                      </a>
                    ) : (
                      '—'
                    )}
                  </span>
                  <Link
                    href={`/manage/live-sessions/${s.id}/attendance?groupId=${s.groupId}&title=${encodeURIComponent(s.title)}&scheduledAt=${encodeURIComponent(s.scheduledAt)}`}
                    className="cl-glink"
                  >
                    Open
                  </Link>
                  <span className="r">
                    <ClRowMenu
                      label={`Actions for ${s.title}`}
                      items={[
                        { label: 'Edit', onSelect: () => setEditing(s) },
                        { label: 'Cancel session', danger: true, onSelect: () => setConfirmingId(s.id) },
                      ]}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
