import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Notification,
  NotificationRepository,
  NotificationType,
} from './interfaces/notification-repository.interface.js';
import { NOTIFICATION_REPOSITORY } from './interfaces/notification-repository.interface.js';

export interface NotificationListResponse {
  notifications: Notification[];
  unreadCount: number;
}

/** One notification, addressed to many people. */
export interface FanOutPayload {
  type: NotificationType;
  title: string;
  message: string;
  /**
   * A *page* route or null - never an API route and never absolute, for the
   * reasons on `Notification.link`. Null is the honest answer when there is no
   * page that shows the thing: a platform-wide announcement has none.
   */
  link: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: NotificationRepository,
  ) {}

  async list(
    userId: string,
    unreadOnly: boolean,
  ): Promise<NotificationListResponse> {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationRepo.findByUser(userId, unreadOnly),
      this.notificationRepo.countUnread(userId),
    ]);
    return { notifications, unreadCount };
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationRepo.countUnread(userId);
  }

  /**
   * Deliver one payload to a list of recipients, returning how many rows were
   * written.
   *
   * The recipient list is resolved by the *caller* at the moment of sending
   * (CLAUDE.md §5.14) and never stored; what persists is one notification per
   * person, which is what makes an announcement readable at all.
   *
   * Duplicate ids are collapsed first. A student enrolled twice, or an audience
   * assembled from two overlapping queries, would otherwise get the same
   * announcement twice in their feed.
   */
  async fanOut(
    recipientIds: readonly string[],
    payload: FanOutPayload,
  ): Promise<number> {
    const unique = [...new Set(recipientIds)];
    return this.notificationRepo.createMany(
      unique.map((userId) => ({ userId, ...payload })),
    );
  }

  async markRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.markRead(
      notificationId,
      userId,
    );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.notificationRepo.markAllRead(userId) };
  }
}
