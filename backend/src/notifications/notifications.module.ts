import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import type { NotificationRepository } from './interfaces/notification-repository.interface.js';
import { NOTIFICATION_REPOSITORY } from './interfaces/notification-repository.interface.js';
import { InMemoryNotificationRepository } from './repositories/in-memory-notification.repository.js';
import { PostgresNotificationRepository } from './repositories/postgres-notification.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    InMemoryNotificationRepository,
    PostgresNotificationRepository,
    repositoryProvider<NotificationRepository>(NOTIFICATION_REPOSITORY, InMemoryNotificationRepository, PostgresNotificationRepository),
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
