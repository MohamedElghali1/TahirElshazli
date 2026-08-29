import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NOTIFICATION_REPOSITORY } from './interfaces/notification-repository.interface.js';
import { InMemoryNotificationRepository } from './repositories/in-memory-notification.repository.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: InMemoryNotificationRepository,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
