import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  StudentSessionsService,
  type StudentAttendanceResponse,
  type StudentSessionView,
} from './student-sessions.service.js';
import { TimetableQueryDto } from './dto/student-sessions.dto.js';

/**
 * The student's own session surface (`SESS-6`, `SESS-7`).
 *
 * `[REPLACE]`s `GET /courses/:id/live-sessions` and `.../next`
 * (`LiveSessionsController`, removed this slice) - a session belongs to a
 * group now, not a course (migration 019), and a student's timetable is every
 * group they sit in, not one course at a time.
 *
 * `me`-route shape follows `students.controller.ts`: `req.user.sub` is the
 * only student id in play. **Never a path or query `studentId`** - the only
 * student a student may read is themselves.
 */
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class StudentSessionsController {
  constructor(private readonly studentSessions: StudentSessionsService) {}

  @Get('me/timetable')
  async getTimetable(
    @Query() query: TimetableQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentSessionView[]> {
    return this.studentSessions.getTimetable(req.user.sub, query);
  }

  @Get('me/attendance')
  async getAttendance(
    @Request() req: { user: JwtPayload },
  ): Promise<StudentAttendanceResponse> {
    return this.studentSessions.getAttendance(req.user.sub);
  }
}
