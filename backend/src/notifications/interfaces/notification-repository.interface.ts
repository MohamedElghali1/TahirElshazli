export type NotificationType =
  | 'grade_posted'
  | 'new_recording'
  | 'live_session_soon'
  | 'assessment_available';

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

export interface NotificationRepository {
  findByUser(userId: string, unreadOnly: boolean): Promise<Notification[]>;
  markRead(notificationId: string, userId: string): Promise<Notification | null>;
  markAllRead(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
