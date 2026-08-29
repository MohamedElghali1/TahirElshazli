import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NOTIFICATION_REPOSITORY } from './interfaces/notification-repository.interface.js';
import { InMemoryNotificationRepository } from './repositories/in-memory-notification.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};

describe('NotificationsController', () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        { provide: NOTIFICATION_REPOSITORY, useClass: InMemoryNotificationRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list only the caller notifications, newest first', async () => {
    const { notifications, unreadCount } = await controller.list({}, STUDENT);
    expect(notifications.map((n) => n.id)).toEqual([
      'notif-1',
      'notif-2',
      'notif-3',
      'notif-4',
    ]);
    expect(notifications.every((n) => n.userId === 'student-1')).toBe(true);
    expect(unreadCount).toBe(2);
  });

  it('should filter to unread only', async () => {
    const { notifications } = await controller.list({ unreadOnly: true }, STUDENT);
    expect(notifications.map((n) => n.id)).toEqual(['notif-1', 'notif-2']);
  });

  it('should mark one notification read and drop the unread count', async () => {
    await controller.markRead('notif-1', STUDENT);
    const { unreadCount } = await controller.list({}, STUDENT);
    expect(unreadCount).toBe(1);
  });

  it('should not let a student mark another student notification read', async () => {
    await expect(controller.markRead('notif-5', STUDENT)).rejects.toThrow();
  });

  it('should mark all read and report how many changed', async () => {
    expect(await controller.markAllRead(STUDENT)).toEqual({ updated: 2 });
    const { unreadCount } = await controller.list({}, STUDENT);
    expect(unreadCount).toBe(0);
    // A second call is a no-op, not an error.
    expect(await controller.markAllRead(STUDENT)).toEqual({ updated: 0 });
  });
});
