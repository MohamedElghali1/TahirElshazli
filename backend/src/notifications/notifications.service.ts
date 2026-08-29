import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Notification,
  NotificationRepository,
} from './interfaces/notification-repository.interface.js';
import { NOTIFICATION_REPOSITORY } from './interfaces/notification-repository.interface.js';

export interface NotificationListResponse {
  notifications: Notification[];
  unreadCount: number;
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
