import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  AnnouncementsService,
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
} from './announcements.service.js';
import type { Announcement } from './interfaces/announcement-repository.interface.js';
import {
  ListAnnouncementsQueryDto,
  PostCourseAnnouncementDto,
} from './dto/post-announcement.dto.js';

/**
 * `/staff/*` - shared by TA and admin, TA-scoped through `StaffScopeService`
 * (CLAUDE.md §5.11), matching `StaffManageController` exactly.
 *
 * This is the one write on the whole `/staff` surface a TA may make besides
 * grading: §2.2's preset grants "post course announcements" in as many words.
 * The scope is the course in the path and there is no audience field on the
 * body, so the widest thing reachable here is one course the caller holds.
 *
 * No `@UseGuards`: `JwtAuthGuard` and `RolesGuard` are global in
 * `app.module.ts`, and `RolesGuard` refuses any route with no `@Roles`.
 */
@Controller('staff')
@Roles(Role.Assistant, Role.Teacher)
export class StaffAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Get('courses/:courseId/announcements')
  async list(
    @Param('courseId') courseId: string,
    @Query() query: ListAnnouncementsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement[]> {
    return this.announcements.listForCourse(
      courseId,
      this.actor(req),
      query.limit ?? DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
      query.offset ?? 0,
    );
  }

  @Post('courses/:courseId/announcements')
  @HttpCode(HttpStatus.CREATED)
  async post(
    @Param('courseId') courseId: string,
    @Body() body: PostCourseAnnouncementDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.postToCourse(courseId, this.actor(req), {
      title: body.title,
      body: body.body,
    });
  }
}
