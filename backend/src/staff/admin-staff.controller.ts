import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { StaffService, type CourseStaffMember } from './staff.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { AssignStaffDto } from './dto/assign-staff.dto.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

/**
 * `/admin/*` - admin only and unscoped (CLAUDE.md §5.11). TA-to-course
 * assignment is listed under admin in §2.2, and it is the write that decides
 * every TA's reach, so it is audited on both sides (§5.4).
 *
 * Kept in its own controller rather than added to `StaffController` with a
 * per-route `@Roles`: the class-level decorator is the thing a reader checks,
 * and mixing the two role sets in one file makes it stop being the answer.
 */
@Controller('admin/courses/:courseId/staff')
@Roles(Role.Teacher)
export class AdminStaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list(
    @Param('courseId') courseId: string,
  ): Promise<CourseStaffMember[]> {
    return this.staffService.listCourseStaff(courseId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async assign(
    @Param('courseId') courseId: string,
    @Body() body: AssignStaffDto,
    @Request() req: { user: JwtPayload },
  ): Promise<CourseStaffMember> {
    return this.staffService.assign(courseId, body.userId, {
      id: req.user.sub,
      role: req.user.role,
    });
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  async unassign(
    @Param('courseId') courseId: string,
    @Param('userId') userId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ removed: true }> {
    return this.staffService.unassign(courseId, userId, {
      id: req.user.sub,
      role: req.user.role,
    });
  }
}
