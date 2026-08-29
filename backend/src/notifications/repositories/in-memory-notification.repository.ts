import { Injectable } from '@nestjs/common';
import type {
  Notification,
  NotificationRepository,
} from '../interfaces/notification-repository.interface.js';

@Injectable()
export class InMemoryNotificationRepository implements NotificationRepository {
  private notifications: Notification[] = [
    {
      id: 'notif-1',
      userId: 'student-1',
      type: 'live_session_soon',
      title: 'Live session today',
      message: 'Organic Chemistry Q&A starts at 18:00.',
      link: '/courses/course-1/live-sessions',
      read: false,
      createdAt: '2026-08-27T09:00:00Z',
    },
    {
      id: 'notif-2',
      userId: 'student-1',
      type: 'grade_posted',
      title: 'Mid-term Assignment marked',
      message: 'You scored 35/40. Feedback and an annotated copy are available.',
      link: '/assessments/assess-3',
      read: false,
      createdAt: '2026-08-22T10:05:00Z',
    },
    {
      id: 'notif-3',
      userId: 'student-1',
      type: 'grade_posted',
      title: 'Organic Synthesis Assignment marked',
      message: 'You scored 34/40.',
      link: '/assessments/assess-7',
      read: true,
      createdAt: '2026-08-12T13:05:00Z',
    },
    {
      id: 'notif-4',
      userId: 'student-1',
      type: 'new_recording',
      title: 'New recording: Halogenoalkanes',
      message: 'Chapter 3 - Halogenoalkanes is now available to watch.',
      link: '/courses/course-1/recordings',
      read: true,
      createdAt: '2026-04-28T19:30:00Z',
    },
    {
      id: 'notif-5',
      userId: 'student-2',
      type: 'new_recording',
      title: 'New recording: Alkenes',
      message: 'Chapter 3 - Alkenes is now available to watch.',
      link: '/courses/course-1/recordings',
      read: false,
      createdAt: '2026-04-14T19:30:00Z',
    },
  ];

  async findByUser(userId: string, unreadOnly: boolean): Promise<Notification[]> {
    return this.notifications
      .filter((n) => n.userId === userId && (!unreadOnly || !n.read))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async markRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification | null> {
    const notification = this.notifications.find(
      (n) => n.id === notificationId && n.userId === userId,
    );
    if (!notification) {
      return null;
    }
    notification.read = true;
    return notification;
  }

  async markAllRead(userId: string): Promise<number> {
    let updated = 0;
    for (const notification of this.notifications) {
      if (notification.userId === userId && !notification.read) {
        notification.read = true;
        updated += 1;
      }
    }
    return updated;
  }

  async countUnread(userId: string): Promise<number> {
    return this.notifications.filter((n) => n.userId === userId && !n.read).length;
  }
}
