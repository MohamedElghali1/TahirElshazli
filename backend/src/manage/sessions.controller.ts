import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import type { LiveSession } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import {
  BulkMarkAttendanceDto,
  CreateSessionDto,
  ListSessionsQueryDto,
  UpdateSessionDto,
  type AttendanceSheetItem,
} from './dto/session.dto.js';

/**
 * `/staff/sessions` and `/staff/groups/:groupId/sessions` - the staff session
 * and attendance work surface (`SESS-1` .. `SESS-5`).
 *
 * All three staff roles (`STAFF_ALL`: teacher, admin, assistant).
 * `D-6` puts sessions on the group grain: an assistant may create, edit,
 * publish and mark attendance for their held groups only.
 *
 * Route ordering: literal sub-paths like `sessions/planned` are declared
 * before param paths like `sessions/:sessionId` so Nest does not swallow
 * `planned` as an id parameter.
 */
@Controller('staff')
@Roles(...STAFF_ALL)
export class SessionsController {
  constructor(private readonly liveSessions: ManageLiveSessionsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /**
   * The week grid (`SESS-5`): in-scope sessions within a date range.
   * Returns both `planned` and `published` states.
   */
  @Get('sessions')
  async list(
    @Query() query: ListSessionsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession[]> {
    return this.liveSessions.list(this.actor(req), query);
  }

  /**
   * The draft timetable (`SESS-4`): planned sessions for in-scope groups.
   * Declared before `:sessionId` routes to avoid route swallowing.
   */
  @Get('sessions/planned')
  async listPlanned(
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession[]> {
    return this.liveSessions.listPlanned(this.actor(req));
  }

  /**
   * Create a session for a group (`SESS-1`).
   */
  @Post('groups/:groupId/sessions')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('groupId') groupId: string,
    @Body() body: CreateSessionDto,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession> {
    return this.liveSessions.create(groupId, this.actor(req), {
      title: body.title,
      meetingLink: body.meetingLink,
      scheduledAt: body.scheduledAt,
      endsAt: body.endsAt,
      assistantId: body.assistantId,
      description: body.description,
      privateNotes: body.privateNotes,
      isVisible: body.isVisible,
      state: body.state,
    });
  }

  /**
   * Partial update (`SESS-1`).
   */
  @Patch('sessions/:sessionId')
  async update(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateSessionDto,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession> {
    return this.liveSessions.update(sessionId, this.actor(req), {
      title: body.title,
      meetingLink: body.meetingLink,
      scheduledAt: body.scheduledAt,
      endsAt: body.endsAt,
      assistantId: body.assistantId,
      description: body.description,
      privateNotes: body.privateNotes,
      isVisible: body.isVisible,
      state: body.state,
    });
  }

  /**
   * Cancel a session (`SESS-1`).
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ removed: true }> {
    return this.liveSessions.remove(sessionId, this.actor(req));
  }

  /**
   * Promote a planned session to published (`SESS-4`).
   * Idempotent 200 no-op if already published.
   */
  @Post('sessions/:sessionId/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession> {
    return this.liveSessions.publish(sessionId, this.actor(req));
  }

  /**
   * Attendance sheet (`SESS-3`): every member of the session's group,
   * each with their status or null when unmarked.
   */
  @Get('sessions/:sessionId/attendance')
  async getAttendance(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<AttendanceSheetItem[]> {
    return this.liveSessions.getAttendanceSheet(sessionId, this.actor(req));
  }

  /**
   * Whole-sheet bulk attendance write (`SESS-3`).
   */
  @Put('sessions/:sessionId/attendance')
  @HttpCode(HttpStatus.OK)
  async markAttendance(
    @Param('sessionId') sessionId: string,
    @Body() body: BulkMarkAttendanceDto,
    @Request() req: { user: JwtPayload },
  ): Promise<{ recorded: true }> {
    return this.liveSessions.markAttendance(
      sessionId,
      this.actor(req),
      body.entries,
    );
  }
}
