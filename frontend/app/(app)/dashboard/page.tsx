'use client';

import Link from 'next/link';
import {
  ArrowRightIcon,
  BellIcon,
  ClipboardTextIcon,
  VideoCameraIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatPercent, formatRelative, formatDateTime } from '@/lib/format';
import type {
  CourseListItem,
  AppNotification,
  NotificationType,
} from '@/lib/types';
import {
  Chip,
  EmptyState,
  ErrorState,
  Meter,
  Metric,
  Panel,
  RowsSkeleton,
  ButtonLink,
} from '@/components/ui';
import { PageBody, PageHeader, StatRow } from '@/components/app/page-parts';
import {
  PageTransition,
  StaggerList,
  StaggerItem,
  motion,
} from '@/components/app/motion';

/* --- Notification icon map ---------------------------------------------- */

const NOTIF_ICON: Record<NotificationType, typeof BellIcon> = {
  grade_posted: CheckCircleIcon,
  new_recording: VideoCameraIcon,
  live_session_soon: BellIcon,
  assessment_available: ClipboardTextIcon,
};

/**
 * The app's landing screen: every course the student is enrolled on, with its
 * completion figure. The per-course dashboard lives at /learn/[id] because
 * the backend's dashboard endpoint is itself per-course.
 */
export default function DashboardPage() {
  const { user } = useSession();
  const { data, error, loading, reload } = useApi(
    (token) => api.courses.list(token),
    [],
  );

  // Notifications for the inline inbox — same read the shell badge does.
  const { data: notifications } = useApi(
    (token) => api.notifications.list(token),
    [],
  );

  // Per-course dashboard for quick-access stats (first enrolled course).
  const firstCourseId = data?.[0]?.id;
  const { data: dashboard } = useApi(
    (token) =>
      firstCourseId
        ? api.dashboard.get(token, firstCourseId)
        : Promise.resolve(null),
    [firstCourseId],
  );

  const firstName = user?.name.split(' ')[0] ?? '';
  const unread = notifications?.unreadCount ?? 0;
  const recentUnread = (notifications?.notifications ?? [])
    .filter((n) => !n.read)
    .slice(0, 3);

  return (
    <PageTransition>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        subtitle="Pick up where you left off."
        action={
          <ButtonLink href="/catalog" variant="secondary">
            Browse courses
          </ButtonLink>
        }
      />
      <PageBody className="flex flex-col gap-[var(--sp-6)]">
        {/* ---- Quick Access Row ----------------------------------------- */}
        {data && data.length > 0 && (
          <StaggerList>
            <StatRow>
              <StaggerItem>
                <Metric
                  label="Pending homework"
                  value={dashboard?.stats.homeworkPending ?? '—'}
                  hint={
                    dashboard?.stats.answersAvailable
                      ? `${dashboard.stats.answersAvailable} corrected`
                      : undefined
                  }
                  href={
                    firstCourseId
                      ? `/learn/${firstCourseId}/assessments`
                      : undefined
                  }
                />
              </StaggerItem>
              <StaggerItem>
                <Metric
                  label="Unread notifications"
                  value={unread}
                  hint={unread > 0 ? 'Tap to view inbox' : 'All caught up'}
                  href="/notifications"
                />
              </StaggerItem>
              <StaggerItem>
                <Metric
                  label="Next session"
                  value={
                    dashboard?.nextLiveSession
                      ? formatDateTime(dashboard.nextLiveSession.scheduledAt)
                      : '—'
                  }
                  hint={dashboard?.nextLiveSession?.title}
                  href={
                    firstCourseId
                      ? `/learn/${firstCourseId}/sessions`
                      : undefined
                  }
                />
              </StaggerItem>
              <StaggerItem>
                <Metric
                  label="Course catalog"
                  value={`${data.length} enrolled`}
                  hint="Browse and enroll"
                  href="/catalog"
                />
              </StaggerItem>
            </StatRow>
          </StaggerList>
        )}

        {/* ---- Inline Inbox --------------------------------------------- */}
        {recentUnread.length > 0 && (
          <StaggerList delay={0.2}>
            <StaggerItem>
              <Panel
                title="Recent notifications"
                action={
                  <Link
                    href="/notifications"
                    className="text-[var(--fs-xs)] text-[var(--fg-tertiary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
                  >
                    View all ({unread})
                  </Link>
                }
                bodyClassName=""
              >
                <ul className="rows">
                  {recentUnread.map((notification) => (
                    <InboxRow key={notification.id} notification={notification} />
                  ))}
                </ul>
              </Panel>
            </StaggerItem>
          </StaggerList>
        )}

        {/* ---- Loading / Error / Empty ---------------------------------- */}
        {loading && <RowsSkeleton rows={3} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {data && data.length === 0 && (
          <EmptyState
            title="No courses yet"
            body="Pick a course from the catalog and it appears here with its timetable, work and recordings."
            action={
              <ButtonLink href="/catalog" variant="primary">
                Browse courses
              </ButtonLink>
            }
          />
        )}

        {/* ---- Course grid with stagger animation ----------------------- */}
        {data && data.length > 0 && (
          <StaggerList
            className="grid gap-[var(--sp-4)] lg:grid-cols-2"
            delay={0.15}
          >
            {data.map((course) => (
              <StaggerItem key={course.id}>
                <CourseCard course={course} />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </PageBody>
    </PageTransition>
  );
}

/* --- Inline notification row -------------------------------------------- */

function InboxRow({ notification }: { notification: AppNotification }) {
  const Icon = NOTIF_ICON[notification.type];
  return (
    <li>
      <Link
        href={notification.link ?? '/notifications'}
        className="row flex items-start gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)] bg-[var(--bg-wash-subtle)] hover:bg-[var(--bg-wash)]"
      >
        <Icon
          size={16}
          weight="fill"
          className="mt-[2px] shrink-0 text-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
            {notification.title}
          </p>
          <p className="mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            {notification.message}
          </p>
        </div>
        <span className="num shrink-0 text-[var(--fs-xxs)] text-[var(--fg-muted)]">
          {formatRelative(notification.createdAt)}
        </span>
      </Link>
    </li>
  );
}

/* --- Course card with hover animation ----------------------------------- */

function CourseCard({ course }: { course: CourseListItem }) {
  const { progress } = course;

  // CLAUDE.md §5.2 - the enrollment's mode decides what "progress" means here.
  const isRecorded = progress.type === 'recorded';
  const percentage = isRecorded
    ? progress.completionPercentage
    : progress.attendancePercentage;
  const detail = isRecorded
    ? `${progress.completedLessons} of ${progress.totalLessons} lessons done`
    : `${progress.attendedSessions} of ${progress.totalSessions} sessions attended`;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0.2, 1] }}
    >
      <Link
        href={`/learn/${course.id}`}
        className="group flex h-full flex-col rounded-[var(--r-sm)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-4)] transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]"
      >
        <div className="flex items-start justify-between gap-[var(--sp-3)]">
          <div className="min-w-0">
            <h2 className="truncate text-[var(--fs-md)] font-semibold text-[var(--fg-primary)]">
              {course.title}
            </h2>
            <p className="mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              {course.teacherName}
            </p>
          </div>
          <Chip tone={isRecorded ? 'violet' : 'teal'}>
            {isRecorded ? 'Recorded' : 'Live'}
          </Chip>
        </div>

        <p className="mt-[var(--sp-3)] line-clamp-2 text-[var(--fs-base)] text-[var(--fg-secondary)]">
          {course.description}
        </p>

        <div className="mt-[var(--sp-4)] flex items-baseline justify-between">
          <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            {isRecorded ? 'Course completion' : 'Attendance'}
          </span>
          <span className="num text-[var(--fs-md)] text-[var(--fg-primary)]">
            {formatPercent(percentage)}
          </span>
        </div>
        <div className="mt-[var(--sp-2)]">
          <Meter
            value={percentage}
            label={isRecorded ? 'Course completion' : 'Attendance'}
          />
        </div>
        <p className="num mt-[var(--sp-2)] text-[var(--fs-xxs)] text-[var(--fg-muted)]">
          {detail}
        </p>

        <span className="mt-[var(--sp-4)] inline-flex items-center gap-[var(--sp-2)] text-[var(--fs-base)] text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)] group-hover:text-[var(--fg-primary)]">
          Open course
          <ArrowRightIcon size={14} />
        </span>
      </Link>
    </motion.div>
  );
}
