'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BellIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatRelative } from '@/lib/format';
import type { AppNotification, NotificationType } from '@/lib/types';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  RowsSkeleton,
  cx,
} from '@/components/ui';
import { PageBody, PageHeader } from '@/components/app/page-parts';

const ICON: Record<NotificationType, typeof BellIcon> = {
  grade_posted: CheckCircleIcon,
  new_recording: VideoCameraIcon,
  live_session_soon: BellIcon,
  assessment_available: ClipboardTextIcon,
};

export default function NotificationsPage() {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useApi(
    (t) => api.notifications.list(t),
    [],
  );

  async function markAllRead() {
    if (!token) return;
    setBusy(true);
    try {
      await api.notifications.markAllRead(token);
      reload();
    } finally {
      setBusy(false);
    }
  }

  const unread = data?.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={
          unread > 0 ? `${unread} unread` : 'Everything here has been read.'
        }
        action={
          unread > 0 ? (
            <Button onClick={markAllRead} loading={busy}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      <PageBody>
        <Panel bodyClassName="">
          {loading && <RowsSkeleton rows={5} />}
          {error && <ErrorState message={error.message} onRetry={reload} />}
          {data && data.notifications.length === 0 && (
            <EmptyState
              title="Nothing yet"
              body="Marks, new recordings and upcoming classes are announced here."
            />
          )}
          {data && data.notifications.length > 0 && (
            <ul className="rows">
              {data.notifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationRow
                    notification={notification}
                    onRead={reload}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: () => void;
}) {
  const { token } = useSession();
  const Icon = ICON[notification.type];

  async function markRead() {
    if (!token || notification.read) return;
    try {
      await api.notifications.markRead(token, notification.id);
      onRead();
    } catch {
      // Not worth interrupting the read for. The badge corrects itself on the
      // next load.
    }
  }

  const body = (
    <div
      className={cx(
        'row flex items-start gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]',
        'transition-colors duration-[var(--dur-fast)]',
        !notification.read && 'bg-[var(--bg-wash-subtle)]',
      )}
    >
      <Icon
        size={16}
        weight={notification.read ? 'regular' : 'fill'}
        className={cx(
          'mt-[2px] shrink-0',
          notification.read ? 'text-[var(--fg-muted)]' : 'text-[var(--accent)]',
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'text-[var(--fs-base)]',
            notification.read
              ? 'text-[var(--fg-secondary)]'
              : 'font-medium text-[var(--fg-primary)]',
          )}
        >
          {notification.title}
        </p>
        <p className="mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {notification.message}
        </p>
      </div>
      <span className="num shrink-0 text-[var(--fs-xxs)] text-[var(--fg-muted)]">
        {formatRelative(notification.createdAt)}
      </span>
    </div>
  );

  // `link` is always an in-app deep link, never an absolute URL, so it is safe
  // to hand straight to next/link.
  return notification.link ? (
    <Link href={notification.link} onClick={markRead}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={markRead} className="w-full text-start">
      {body}
    </button>
  );
}
