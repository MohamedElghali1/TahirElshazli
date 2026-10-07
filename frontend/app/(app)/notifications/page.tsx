'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatRelative } from '@/lib/format';
import type { AppNotification, NotificationType } from '@/lib/types';
import { PageTitle, PageActions } from '@/components/shell/page-chrome';
import { ClIcon, TEACHER_AVATAR, TEACHER_NAME, type IconKey } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClSkeleton, ClTabs, PanelHead } from '@/components/classroom/ui';
import { AnnouncementView } from '@/components/classroom/announcement-view';
import { useSelectedCourse } from '@/components/shell/course-context';

const ICON: Record<NotificationType, IconKey> = {
  grade_posted: 'check',
  new_recording: 'play',
  live_session_soon: 'bell',
  assessment_available: 'pen',
  announcement: 'announce',
  // Unit 9: weekly reports (`REM-031`).
  weekly_report: 'chart',
};

/**
 * Announcements. Not on the flat rail (`docs/PRODUCT_SPEC.md` §5.2) - reached
 * from the bell and Home's "Open announcements". Every notification type is
 * listed, not only announcements, because the mailbox is one list.
 */
export default function NotificationsPage() {
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'announcements' | 'notifications'>('announcements');
  const { selectedId } = useSelectedCourse();
  const anns = useApi(
    async (t) => {
      if (!selectedId) return [];
      const list = await api.students.announcements(t, selectedId);
      return [...list].sort(
        (a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime(),
      );
    },
    [selectedId],
  );
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
      <PageTitle title="Announcements" />
      {tab === 'notifications' && unread > 0 && (
        <PageActions>
          <button type="button" className="cl-btns" onClick={markAllRead} disabled={busy}>
            {busy ? 'Marking all as read…' : 'Mark all as read'}
          </button>
        </PageActions>
      )}

      <ClTabs
        label="Announcements and notifications"
        value={tab}
        onChange={(v) => setTab(v as 'announcements' | 'notifications')}
        tabs={[
          { value: 'announcements', label: 'Announcements' },
          { value: 'notifications', label: 'Notifications', count: unread > 0 ? unread : null },
        ]}
      />

      {tab === 'announcements' ? (
        <section aria-labelledby="h-ann" className="cl-panel pb-4">
          <PanelHead title="Announcements" id="h-ann" className="mb-2" />
          {anns.loading && !anns.data && <ClSkeleton rows={3} label="Loading announcements" />}
          {anns.error && <ClError message={anns.error.message} onRetry={anns.reload} />}
          {anns.data && anns.data.length === 0 && (
            <ClEmpty
              icon="announce"
              tone="cl-tone-sand"
              title="No announcements yet"
              hint="Messages from Dr. Tahir to this course appear here."
            />
          )}
          {anns.data?.map((a) => (
            <AnnouncementView
              key={a.id}
              data={a}
              author={TEACHER_NAME}
              avatar={TEACHER_AVATAR}
              meta={formatDate(a.publishedAt ?? a.createdAt)}
            />
          ))}
        </section>
      ) : (
        <section aria-labelledby="h-not" className="cl-panel pb-4">
          <PanelHead title="Notifications" id="h-not" className="mb-2">
            {unread > 0 && <span className="cl-muted text-[14px]">{unread} unread</span>}
          </PanelHead>
          {loading && <ClSkeleton rows={4} label="Loading notifications" />}
          {error && <ClError message={error.message} onRetry={reload} />}
          {data && data.notifications.length === 0 && (
            <ClEmpty
              icon="bell"
              tone="cl-tone-sand"
              title="Nothing yet"
              hint="Marks, new recordings and upcoming classes are announced here."
            />
          )}
          {data?.notifications.map((n) => <NotificationRow key={n.id} notification={n} onRead={reload} />)}
        </section>
      )}
    </>
  );
}

function NotificationRow({ notification, onRead }: { notification: AppNotification; onRead: () => void }) {
  const { token } = useSession();

  async function markRead() {
    if (!token || notification.read) return;
    try {
      await api.notifications.markRead(token, notification.id);
      onRead();
    } catch {
      // Not worth interrupting the read for. The badge corrects itself on the next load.
    }
  }

  const isAnnouncement = notification.type === 'announcement';
  const body = (
    <>
      {isAnnouncement ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={TEACHER_AVATAR} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="cl-ic40 cl-tone-sky">
          <ClIcon name={ICON[notification.type]} small />
        </span>
      )}
      <span className="cl-grow-main">
        <span className="block text-[14px]">
          <span className={notification.read ? undefined : 'font-medium'}>
            {isAnnouncement ? TEACHER_NAME : notification.title}
          </span>
          <span className="cl-muted"> · {formatRelative(notification.createdAt)}</span>
        </span>
        <span className="cl-sub" style={{ fontSize: 14 }}>
          {isAnnouncement && <span className="block text-fg">{notification.title}</span>}
          {notification.message}
        </span>
      </span>
      {!notification.read && (
        <span className="cl-dot shrink-0" style={{ background: 'var(--cl-blue)' }} role="img" aria-label="Unread" />
      )}
    </>
  );

  // `link` is always an in-app deep link, never an absolute URL, so it is safe
  // to hand straight to next/link.
  return notification.link ? (
    <Link href={notification.link} onClick={markRead} className="cl-grow items-start">
      {body}
    </Link>
  ) : (
    <button type="button" onClick={markRead} className="cl-grow w-full items-start text-start">
      {body}
    </button>
  );
}
