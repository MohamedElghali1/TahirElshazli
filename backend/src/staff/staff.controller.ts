import { Controller, Get, Query, Request } from '@nestjs/common';
import { StaffService, type StaffCourseSummary } from './staff.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { ListStaffCoursesQueryDto } from './dto/list-staff-courses-query.dto.js';
import {
  DEFAULT_COURSE_PAGE_SIZE,
  MAX_COURSE_PAGE_SIZE,
} from './staff.service.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

/**
 * `/staff/*` - shared by TA and admin, and always scoped for the TA
 * (CLAUDE.md §5.11). The admin reaches the same routes and is not scoped, which
 * `StaffService` expresses as two different queries rather than one filtered
 * result.
 *
 * No `@UseGuards` here: `JwtAuthGuard` and `RolesGuard` are registered globally
 * in `app.module.ts`, and `RolesGuard` refuses any route with no `@Roles`.
 */
@Controller('staff')
@Roles(Role.Assistant, Role.Teacher)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get('courses')
  async listCourses(
    @Query() query: ListStaffCoursesQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StaffCourseSummary[]> {
    return this.staffService.listCourses(
      { id: req.user.sub, role: req.user.role },
      Math.min(query.limit ?? DEFAULT_COURSE_PAGE_SIZE, MAX_COURSE_PAGE_SIZE),
      query.offset ?? 0,
    );
  }
}
