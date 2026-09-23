'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatTime } from '@/lib/format';
import type { LiveSession } from '@/lib/types';
import { Button, EmptyState, InlineBanner, Loader, Panel, Table, type Column } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * `/manage/live-sessions/drafts` (`SESS-4`): `planned` sessions for the
 * caller's in-scope groups, with a **Publish** action.
 *
 * Publish is idempotent server-side (`ManageLiveSessionsService.publish` is a
 * 200 no-op on an already-published session) - this screen still reflects the
 * new state without a reload, by replacing the row locally rather than
 * re-fetching the whole list.
 */
export default function DraftTimetablePage() {
  const { token } = useSession();
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { data, error: loadError, loading, reload } = useApi(
    (t) => api.staff.sessions.planned(t),
    [],
  );

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

  const columns: Column<LiveSession>[] = [
    { label: 'Title', render: (s) => s.title },
    {
      label: 'Scheduled for',
      render: (s) => (
        <span className="num">
          {formatDate(s.scheduledAt)} · {formatTime(s.scheduledAt)}
        </span>
      ),
    },
    {
      label: '',
      align: 'end',
      render: (s) => (
        <Button
          size="small"
          variant="primary"
          disabled={publishingId === s.id}
          onClick={() => publish(s)}
        >
          {publishingId === s.id ? <Loader size={3} label="Publishing" /> : 'Publish'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageTitle title="Draft timetable" backHref="/manage/live-sessions" />
      <div className="flex flex-col gap-4 p-6">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        <Panel padded={false}>
          {loading && !list && (
            <div className="flex justify-center p-8">
              <Loader label="Loading drafts" />
            </div>
          )}
          {loadError && (
            <EmptyState icon="AlertTriangle" title={loadError.message} action={<Button onClick={reload}>Try again</Button>} />
          )}
          {list && (
            <Table
              columns={columns}
              rows={list}
              rowKey={(s) => s.id}
              empty={
                <EmptyState
                  icon="CalendarClock"
                  title="No drafts"
                  description="Save a session as a draft on the week grid and it appears here until you publish it."
                />
              }
            />
          )}
        </Panel>
      </div>
    </>
  );
}
