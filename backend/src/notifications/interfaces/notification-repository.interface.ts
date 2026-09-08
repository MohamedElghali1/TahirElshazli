export type NotificationType =
  | 'grade_posted'
  | 'new_recording'
  | 'live_session_soon'
  | 'assessment_available'
  /**
   * An announcement, fanned out to one recipient (CLAUDE.md §5.14).
   *
   * The union is closed and mirrored by a CHECK constraint on
   * `notifications.type`, so adding this member without migration `005` would
   * fail every insert under Postgres and none under the memory driver - which
   * is the two-driver failure the integration suite exists to catch.
   */
  | 'announcement';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /**
   * An in-app deep link, never an absolute URL - the client renders it into a
   * <Link href>, so an absolute one would make notification content an
   * open-redirect.
   *
   * It must be a *page* route, not an API route. The two do not match: the
   * assessments API lives at /assessments/:id while the page lives at
   * /learn/:courseId/assessments/:id. Writing the API shape here produces a
   * notification that 404s when clicked.
   */
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** What a sender supplies. `id`, `read` and `createdAt` are the repository's. */
export type NewNotification = Omit<Notification, 'id' | 'read' | 'createdAt'>;

export interface NotificationRepository {
  findByUser(userId: string, unreadOnly: boolean): Promise<Notification[]>;
  /**
   * Deliver one payload to many people in a single write.
   *
   * A batch method rather than a loop over a `create`, because the caller is an
   * announcement fan-out (CLAUDE.md §5.14) and a per-recipient round trip is a
   * cohort-sized N+1 the moment the platform has the "thousands of students"
   * §1 targets. Returns how many rows were written, which is what the sender
   * reports back as the audience size.
   */
  createMany(notifications: readonly NewNotification[]): Promise<number>;
  markRead(notificationId: string, userId: string): Promise<Notification | null>;
  markAllRead(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
