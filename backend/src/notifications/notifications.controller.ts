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

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
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
