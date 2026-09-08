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
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  DirectoryService,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  type DirectoryEntry,
  type StudentDirectoryEntry,
} from './directory.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import type { Recording } from '../recordings/interfaces/recording-repository.interface.js';
import type { LiveSession } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { CreateRecordingDto } from './dto/create-recording.dto.js';
import { UpdateRecordingDto } from './dto/update-recording.dto.js';
import { CreateLiveSessionDto } from './dto/create-live-session.dto.js';
import { UpdateLiveSessionDto } from './dto/update-live-session.dto.js';
import { ListDirectoryQueryDto } from './dto/queries.dto.js';

/**
 * `/admin/*` - teacher only and unscoped (CLAUDE.md §5.11). Nothing in this
 * file joins through `CourseStaffAssignment`, and nothing should.
 *
 * Recording writes live here rather than on the shared `/staff` controller
 * because §2.2's preset grants a TA materials but not recordings, and the
 * client's instruction was that *the teacher* uploads them. If that widens,
 * the routes move to `StaffManageController` and the service is untouched -
 * which is why the service takes a `StaffActor` rather than assuming admin.
 *
 * Live-session scheduling is here for the same reason and on the same terms:
 * §2.2's preset omits it and §11 records the board's `CRS-11` as an unresolved
 * disagreement, so the narrow reading ships. `ManageLiveSessionsService`
 * carries the full argument.
 *
 * Kept as its own controller rather than per-route `@Roles` on the shared one:
 * the class-level decorator is the thing a reader checks, and mixing two role
 * sets in one file makes it stop being the answer.
 */
@Controller('admin')
@Roles(Role.Teacher)
export class AdminManageController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly recordings: ManageRecordingsService,
    private readonly liveSessions: ManageLiveSessionsService,
  ) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /** The full student directory - admin only, never a TA surface (§2.2). */
  @Get('students')
  async students(
    @Query() query: ListDirectoryQueryDto,
  ): Promise<StudentDirectoryEntry[]> {
    return this.directory.students({
      search: query.search,
      limit: query.limit ?? DEFAULT_DIRECTORY_PAGE_SIZE,
      offset: query.offset ?? 0,
    });
  }

  /** The picker behind "assign a TA to this course". */
  @Get('assistants')
  async assistants(
    @Query() query: ListDirectoryQueryDto,
  ): Promise<DirectoryEntry[]> {
    return this.directory.assistants({
      search: query.search,
      limit: query.limit ?? DEFAULT_DIRECTORY_PAGE_SIZE,
      offset: query.offset ?? 0,
    });
  }

  @Post('courses/:courseId/recordings')
  @HttpCode(HttpStatus.CREATED)
  async createRecording(
    @Param('courseId') courseId: string,
    @Body() body: CreateRecordingDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Recording> {
    return this.recordings.create(courseId, this.actor(req), {
      moduleId: body.moduleId,
      lessonId: body.lessonId,
      title: body.title,
      chapter: body.chapter,
      topics: body.topics,
      videoUrl: body.videoUrl,
      durationSeconds: body.durationSeconds,
      lessonDate: body.lessonDate,
    });
  }

  @Patch('recordings/:recordingId')
  async updateRecording(
    @Param('recordingId') recordingId: string,
    @Body() body: UpdateRecordingDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Recording> {
    return this.recordings.update(recordingId, this.actor(req), body);
  }

  @Delete('recordings/:recordingId')
  @HttpCode(HttpStatus.OK)
  async deleteRecording(
    @Param('recordingId') recordingId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ removed: true }> {
    return this.recordings.remove(recordingId, this.actor(req));
  }

  @Post('courses/:courseId/live-sessions')
  @HttpCode(HttpStatus.CREATED)
  async createLiveSession(
    @Param('courseId') courseId: string,
    @Body() body: CreateLiveSessionDto,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession> {
    return this.liveSessions.create(courseId, this.actor(req), {
      title: body.title,
      zoomLink: body.zoomLink,
      scheduledAt: body.scheduledAt,
      durationMinutes: body.durationMinutes,
    });
  }

  @Patch('live-sessions/:sessionId')
  async updateLiveSession(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateLiveSessionDto,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession> {
    return this.liveSessions.update(sessionId, this.actor(req), body);
  }

  @Delete('live-sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async deleteLiveSession(
    @Param('sessionId') sessionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ removed: true }> {
    return this.liveSessions.remove(sessionId, this.actor(req));
  }
}
