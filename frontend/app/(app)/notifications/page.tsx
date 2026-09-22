'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatRelative } from '@/lib/format';
import type { AppNotification, NotificationType } from '@/lib/types';
import { Panel, EmptyState, Loader, Button, Icon, cx, type IconName } from '@/components/ui';
import { PageTitle, PageActions } from '@/components/shell/page-chrome';

const ICON: Record<NotificationType, IconName> = {
  grade_posted: 'CircleCheck',
  new_recording: 'Video',
  live_session_soon: 'Bell',
  assessment_available: 'Clipboard',
  announcement: 'Message',
};

/**
 * Notifications isn't on the flat rail (`docs/PRODUCT_SPEC.md` §5.2: the
 * design makes the student's a bell + `Menu`, which is a content redesign
 * out of this unit's scope) — kept reachable via Overview's inbox "Open
 * inbox" link rather than dropped, same precedent as `/materials`.
 */
export default function NotificationsPage() {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useApi((t) => api.notifications.list(t), []);

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
      <PageTitle title="Notifications" />
      {unread > 0 && (
        <PageActions>
          <Button onClick={markAllRead} disabled={busy}>
            {busy ? <Loader size={3} label="Marking all as read" /> : 'Mark all as read'}
          </Button>
        </PageActions>
      )}

      <div className="p-6">
        <Panel bodyClassName="">
          {loading && (
            <div className="flex justify-center p-8">
              <Loader label="Loading notifications" />
            </div>
          )}
          {error && (
            <div className="p-6">
              <EmptyState
                icon="AlertTriangle"
                title={error.message}
                action={<Button onClick={reload}>Try again</Button>}
              />
            </div>
          )}
          {data && data.notifications.length === 0 && (
            <EmptyState
              icon="Bell"
              title="Nothing yet"
              description="Marks, new recordings and upcoming classes are announced here."
            />
          )}
          {data && data.notifications.length > 0 && (
            <ul className="divide-y divide-border-light">
              {data.notifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationRow notification={notification} onRead={reload} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
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
        'flex items-start gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover',
        !notification.read && 'bg-wash-hover',
      )}
    >
      <Icon
        name={ICON[notification.type]}
        size={16}
        className={cx('mt-[2px] shrink-0', notification.read ? 'text-fg-4' : 'text-accent')}
      />
      <div className="min-w-0 flex-1">
        <p className={cx('text-base', notification.read ? 'text-fg-2' : 'font-medium text-fg')}>
          {notification.title}
        </p>
        <p className="mt-1 text-xs text-fg-3">{notification.message}</p>
      </div>
      <span className="num shrink-0 text-xxs text-fg-4">{formatRelative(notification.createdAt)}</span>
    </div>
  );

  // `link` is always an in-app deep link, never an absolute URL, so it is
  // safe to hand straight to next/link.
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
