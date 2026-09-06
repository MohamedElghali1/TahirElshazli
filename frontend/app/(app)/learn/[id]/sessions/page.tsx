'use client';

import { use } from 'react';
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import {
  formatDate,
  formatMinutes,
  formatRelative,
  formatTime,
  formatWeekday,
} from '@/lib/format';
import type { LiveSession, LiveSessionWithAttendance } from '@/lib/types';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Panel,
  RowsSkeleton,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';

/**
 * The timetable.
 *
 * A live session is a scheduled time plus a link the teacher pastes - Google
 * Meet, Zoom, whatever they use. Nothing is embedded and nothing is automated
 * (CLAUDE.md §11 records this as the standing assumption). The screen's whole
 * job is: when is it, how long is it, and where do I click.
 */
export default function SessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi(
    (token) => api.liveSessions.list(token, id),
    [id],
  );

  return (
    <PageBody className="grid gap-[var(--sp-6)] xl:grid-cols-2">
      <Panel
        title="Coming up"
        action={
          data && (
            <span className="num text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              {data.upcoming.length}
            </span>
          )
        }
        bodyClassName=""
      >
        {loading && <RowsSkeleton rows={3} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {data && data.upcoming.length === 0 && (
          <EmptyState
            title="Nothing scheduled"
            body="The next class shows here with its time and joining link as soon as it is set."
          />
        )}
        {data && data.upcoming.length > 0 && (
          <ul className="rows">
            {data.upcoming.map((session) => (
              <li key={session.id}>
                <UpcomingRow session={session} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Attendance record"
        action={
          data && (
            <span className="num text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              {data.past.filter((s) => s.attended).length} / {data.past.length}
            </span>
          )
        }
        bodyClassName=""
      >
        {loading && <RowsSkeleton rows={3} />}
        {data && data.past.length === 0 && !loading && (
          <EmptyState
            title="No sessions yet"
            body="Your record starts after the first timetabled class."
          />
        )}
        {data && data.past.length > 0 && (
          <ul className="rows">
            {data.past.map((session) => (
              <li key={session.id}>
                <PastRow session={session} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}

function UpcomingRow({ session }: { session: LiveSession }) {
  return (
    <div className="flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-4)]">
      <div className="w-[52px] shrink-0 rounded-[var(--r-xs)] bg-[var(--bg-tertiary)] py-[var(--sp-2)] text-center">
        <div className="num text-[var(--fs-lg)] leading-none text-[var(--fg-primary)]">
          {new Date(session.scheduledAt).getDate()}
        </div>
        <div className="mt-[var(--sp-1)] text-[var(--fs-xxs)] uppercase text-[var(--fg-tertiary)]">
          {new Date(session.scheduledAt).toLocaleDateString(undefined, {
            month: 'short',
          })}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
          {session.title}
        </p>
        <p className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {formatWeekday(session.scheduledAt)} {formatTime(session.scheduledAt)} ·{' '}
          {formatMinutes(session.durationMinutes)}
        </p>
        <p className="mt-[var(--sp-1)] text-[var(--fs-xxs)] text-[var(--fg-muted)]">
          Starts {formatRelative(session.scheduledAt)}
        </p>
      </div>

      <Button
        variant="primary"
        size="sm"
        className="shrink-0"
        onClick={() =>
          window.open(session.zoomLink, '_blank', 'noopener,noreferrer')
        }
      >
        Join
        <ArrowSquareOutIcon size={12} />
      </Button>
    </div>
  );
}

function PastRow({ session }: { session: LiveSessionWithAttendance }) {
  return (
    <div className="flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
      {session.attended ? (
        <CheckCircleIcon
          size={16}
          weight="fill"
          className="shrink-0 text-[var(--chip-green-fg)]"
        />
      ) : (
        <XCircleIcon
          size={16}
          weight="fill"
          className="shrink-0 text-[var(--chip-red-fg)]"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[var(--fs-base)] text-[var(--fg-primary)]">
          {session.title}
        </p>
        <p className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {formatDate(session.scheduledAt)}
        </p>
      </div>
      <Chip tone={session.attended ? 'green' : 'red'}>
        {session.attended ? 'Attended' : 'Missed'}
      </Chip>
    </div>
  );
}
