'use client';

import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { addDays, formatTime, formatWeekday, startOfWeek } from '@/lib/format';
import type { LiveSession } from '@/lib/types';
import {
  Button,
  ButtonLink,
  EmptyState,
  IconButton,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Table,
  TableToolbar,
  Tag,
  type Column,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
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
 */
export default function LiveSessionsPage() {
  const { token } = useSession();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState<LiveSession | 'new' | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function cancelSession(session: LiveSession) {
    if (!token) return;
    setError(null);
    try {
      await api.staff.sessions.cancel(token, session.id);
      setConfirmingId(null);
      reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not cancel that session.');
    }
  }

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  const columns: Column<LiveSession>[] = [
    { label: 'Group', render: (s) => groupName.get(s.groupId) ?? '—' },
    { label: 'Title', render: (s) => s.title },
    {
      label: 'When',
      render: (s) => (
        <span className="num">
          {formatWeekday(s.scheduledAt)} {formatTime(s.scheduledAt)}–{formatTime(s.endsAt)}
        </span>
      ),
    },
    {
      label: 'State',
      render: (s) => (
        <Tag tone={s.state === 'published' ? 'green' : 'gray'}>
          {s.state === 'published' ? 'Published' : 'Draft'}
        </Tag>
      ),
    },
    {
      label: '',
      align: 'end',
      render: (s) =>
        confirmingId === s.id ? (
          <span className="inline-flex items-center gap-2">
            <Button size="small" variant="primary" accent="danger" onClick={() => cancelSession(s)}>
              Cancel session
            </Button>
            <Button size="small" variant="tertiary" onClick={() => setConfirmingId(null)}>
              Keep it
            </Button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <ButtonLink
              size="small"
              href={`/manage/live-sessions/${s.id}/attendance?groupId=${s.groupId}&title=${encodeURIComponent(s.title)}&scheduledAt=${encodeURIComponent(s.scheduledAt)}`}
            >
              Attendance
            </ButtonLink>
            <Button size="small" onClick={() => setEditing(s)}>
              Edit
            </Button>
            <Button size="small" variant="tertiary" onClick={() => setConfirmingId(s.id)}>
              Cancel
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageTitle title="Live sessions" />
      <div className="flex flex-col gap-4 p-6">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
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
        <Panel padded={false}>
          <TableToolbar
            filters={
              <Select
                aria-label="Group"
                className="w-[200px]"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                options={[{ value: '', label: 'All groups' }, ...(groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
              />
            }
            actions={
              <span className="inline-flex items-center gap-2">
                <IconButton
                  icon="ChevronLeft"
                  label="Previous week"
                  onClick={() => setWeekStart((w) => addDays(w, -7))}
                />
                <span className="num min-w-[110px] text-center text-xs text-fg-3">{rangeLabel}</span>
                <IconButton
                  icon="ChevronRight"
                  label="Next week"
                  onClick={() => setWeekStart((w) => addDays(w, 7))}
                />
                <Button size="small" variant="primary" icon="Plus" onClick={() => setEditing('new')}>
                  New session
                </Button>
              </span>
            }
          />
          {loading && !data && (
            <div className="flex justify-center p-8">
              <Loader label="Loading sessions" />
            </div>
          )}
          {loadError && (
            <EmptyState icon="AlertTriangle" title={loadError.message} action={<Button onClick={reload}>Try again</Button>} />
          )}
          {data && (
            <Table
              columns={columns}
              rows={data}
              rowKey={(s) => s.id}
              empty={
                <EmptyState
                  icon="CalendarEvent"
                  title="Nothing scheduled this week"
                  description="Set a session for a group you hold and it appears here."
                />
              }
            />
          )}
        </Panel>
      </div>
    </>
  );
}
