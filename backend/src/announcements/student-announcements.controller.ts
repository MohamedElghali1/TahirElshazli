import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  AnnouncementsService,
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
} from './announcements.service.js';
import type { Announcement } from './interfaces/announcement-repository.interface.js';
import { ListAnnouncementsQueryDto } from './dto/post-announcement.dto.js';

/**
 * The student's side of an announcement (CLAUDE.md §5.18).
 *
 * §5.18 reads the client's instruction as one end-to-end requirement rather
 * than three CRUD screens: the acceptance test is a student opening the app and
 * finding what was just posted. Announcements were the piece that was
 * *authorable but not readable* - the body reached the mailbox as a
 * notification and there was nowhere to go from there, which is why
 * `Notification.link` is null for one. This route is that somewhere.
 *
 * `@Controller()` with the path on the method, matching `RecordingsController`
 * and `ClassmatesController`: the route is course-scoped but the resource is
 * not a course.
 */
@Controller()
@Roles(Role.Student)
export class StudentAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('courses/:courseId/announcements')
  async list(
    @Param('courseId') courseId: string,
    @Query() query: ListAnnouncementsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement[]> {
    return this.announcements.listForStudent(
      courseId,
      req.user.sub,
      query.limit ?? DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
      query.offset ?? 0,
    );
  }
}
