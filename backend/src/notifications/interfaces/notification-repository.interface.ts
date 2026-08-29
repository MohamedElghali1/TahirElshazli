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
  /** In-app deep link, e.g. /assessments/assess-3 - never an absolute URL. */
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
