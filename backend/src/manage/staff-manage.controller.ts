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
  ManageService,
  type CourseRosterResponse,
  type ManageOverview,
  type OutlineModule,
} from './manage.service.js';
import {
  GradingService,
  type GradingQueueItem,
  type GradingQueueResponse,
} from './grading.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import type { Recording } from '../recordings/interfaces/recording-repository.interface.js';
import type { LiveSession } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { GradeSubmissionDto } from './dto/grade-submission.dto.js';
import { ListGradingQueueQueryDto } from './dto/queries.dto.js';

/**
 * `/staff/*` - the surface both roles share, always TA-scoped and never scoped
 * for the teacher (CLAUDE.md §5.11).
 *
 * Every handler passes the actor straight through to a service that starts with
 * `StaffScopeService`. Nothing here decides access itself, and nothing here
 * filters a wider result down - a course a TA does not hold 404s from the scope
 * service before any data is read.
 *
 * No `@UseGuards`: `JwtAuthGuard` and `RolesGuard` are global in
 * `app.module.ts`, and `RolesGuard` refuses any route with no `@Roles`.
 */
@Controller('staff')
@Roles(Role.Assistant, Role.Teacher)
export class StaffManageController {
  constructor(
    private readonly manage: ManageService,
    private readonly grading: GradingService,
    private readonly recordings: ManageRecordingsService,
    private readonly liveSessions: ManageLiveSessionsService,
  ) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /** Dashboard counts, scoped by role. Carries no revenue figure (§1). */
  @Get('overview')
  async overview(@Request() req: { user: JwtPayload }): Promise<ManageOverview> {
    return this.manage.overview(this.actor(req));
  }

  @Get('courses/:courseId/roster')
  async roster(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<CourseRosterResponse> {
    return this.manage.roster(courseId, this.actor(req));
  }

  @Get('courses/:courseId/outline')
  async outline(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<OutlineModule[]> {
    return this.manage.outline(courseId, this.actor(req));
  }

  @Get('courses/:courseId/submissions')
  async submissions(
    @Param('courseId') courseId: string,
    @Query() query: ListGradingQueueQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<GradingQueueResponse> {
    return this.grading.queue(courseId, this.actor(req), { status: query.status });
  }

  /**
   * Grading - the TA's core permission under §2.2, and the first non-admin
   * mutation the audit log covers (§5.4).
   *
   * No course id in the path on purpose: the course is resolved from the
   * submission's own assessment, so a submission id from a course the caller
   * does not hold cannot be smuggled in behind a course id that they do.
   */
  @Post('submissions/:submissionId/grade')
  @HttpCode(HttpStatus.OK)
  async grade(
    @Param('submissionId') submissionId: string,
    @Body() body: GradeSubmissionDto,
    @Request() req: { user: JwtPayload },
  ): Promise<GradingQueueItem> {
    return this.grading.grade(submissionId, this.actor(req), {
      score: body.score,
      feedback: body.feedback,
      annotatedFileUrl: body.annotatedFileUrl,
    });
  }

  /** Read-only for a TA. The write routes live on the admin controller. */
  @Get('courses/:courseId/recordings')
  async listRecordings(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<Recording[]> {
    return this.recordings.list(courseId, this.actor(req));
  }

  /**
   * Read-only for a TA, same as recordings: they need the schedule to mark
   * attendance against it. The scheduling writes are teacher-only and live on
   * the admin controller - see `ManageLiveSessionsService` for why, and for
   * what would change if §11 resolves `CRS-11` the other way.
   */
  @Get('courses/:courseId/live-sessions')
  async listLiveSessions(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession[]> {
    return this.liveSessions.list(courseId, this.actor(req));
  }
}
