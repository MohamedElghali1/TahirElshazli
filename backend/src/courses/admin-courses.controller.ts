import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { CourseAdminService } from './course-admin.service.js';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto.js';
import type { StoredCourse } from './interfaces/course-repository.interface.js';

/**
 * Course lifecycle (`DOM-5`) - `/admin/*`, so teacher and admin only and
 * unscoped (`CLAUDE.md` §6).
 *
 * It lives in `CoursesModule`, beside the repository that owns the aggregate,
 * rather than on `AdminManageController` with the recordings and sessions:
 * those act *within* a course, this one creates and edits the course itself.
 *
 * `@Roles(...STAFF_ADMIN)` at class level is the outer gate, and
 * `STAFF_ADMIN` never contains `Role.Assistant` (`auth/staff-roles.ts`), so an
 * assistant is refused with 403 before the service is reached.
 */
@Controller('admin/courses')
@Roles(...STAFF_ADMIN)
export class AdminCoursesController {
  constructor(private readonly courseAdmin: CourseAdminService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateCourseDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StoredCourse> {
    return this.courseAdmin.create(body, this.actor(req));
  }

  @Patch(':courseId')
  async update(
    @Param('courseId') courseId: string,
    @Body() body: UpdateCourseDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StoredCourse> {
    return this.courseAdmin.update(courseId, body, this.actor(req));
  }
}
