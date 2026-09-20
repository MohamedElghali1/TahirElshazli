import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  AnnouncementsService,
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
} from './announcements.service.js';
import type { Announcement } from './interfaces/announcement-repository.interface.js';
import {
  ListAnnouncementsQueryDto,
  PostAnnouncementDto,
} from './dto/post-announcement.dto.js';

/**
 * `/admin/*` - teacher only and unscoped (CLAUDE.md §5.11). Nothing here joins
 * through `CourseStaffAssignment`, and nothing should.
 *
 * The platform-wide audiences live here and nowhere else. That is the whole
 * role boundary for announcements: §2.2 gives a TA their own courses and never
 * platform-wide data, so `all_students` and `all_tas` are reachable only
 * through a controller a TA cannot enter. A TA who types this URL gets a 403
 * from `RolesGuard` - not a 404 - because unlike an unassigned course, the
 * route is not something they could ever hold.
 */
@Controller('admin')
@Roles(...STAFF_ADMIN)
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /** Every announcement, whatever its audience - the teacher's sent history. */
  @Get('announcements')
  async list(
    @Query() query: ListAnnouncementsQueryDto,
  ): Promise<Announcement[]> {
    return this.announcements.listAll(
      query.limit ?? DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
      query.offset ?? 0,
    );
  }

  @Post('announcements')
  @HttpCode(HttpStatus.CREATED)
  async post(
    @Body() body: PostAnnouncementDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.post(this.actor(req), body.audience, {
      title: body.title,
      body: body.body,
    });
  }
}
