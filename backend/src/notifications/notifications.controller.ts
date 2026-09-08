import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  NotificationsService,
  NotificationListResponse,
} from './notifications.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';
import type { Notification } from './interfaces/notification-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

/**
 * Every signed-in LMS role reads its *own* notifications.
 *
 * This was `@Roles(Role.Student)` while students were the only recipients.
 * §5.14's `all_tas` audience changed that: an announcement addressed to the
 * assistants lands in mailboxes no assistant could open, which is not a
 * feature. The teacher is included for the same reason a course announcement
 * they post could later be addressed to them - and because the shell's badge
 * should not have to special-case a role.
 *
 * Widening the role list does not widen what anyone can *read*: every method
 * below passes `req.user.sub` and the repository's `user_id = $2` predicate is
 * the authorization check (see `PostgresNotificationRepository.markRead`).
 * Visitor and Parent are absent - neither has a backend at all (§7.1).
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student, Role.Assistant, Role.Teacher)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Query() query: ListNotificationsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<NotificationListResponse> {
    return this.notificationsService.list(req.user.sub, query.unreadOnly ?? false);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @Request() req: { user: JwtPayload },
  ): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(req.user.sub);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param('id') notificationId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<Notification> {
    return this.notificationsService.markRead(notificationId, req.user.sub);
  }
}
