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
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  DirectoryService,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  type StudentDirectoryEntry,
} from './directory.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import type { Recording } from '../recordings/interfaces/recording-repository.interface.js';
import { CreateRecordingDto } from './dto/create-recording.dto.js';
import { UpdateRecordingDto } from './dto/update-recording.dto.js';
import { ListDirectoryQueryDto } from './dto/queries.dto.js';
import { RegistrationApprovalService } from './registration-approval.service.js';
import {
  AcceptRegistrationDto,
  RejectRegistrationDto,
} from './dto/registration.dto.js';
import { AdminStudentsService, type StudentDetail } from './admin-students.service.js';
import {
  AdminUpdateStudentDto,
  CreateStudentDto,
} from './dto/student-admin.dto.js';
import { AdminAssistantsService, type Assistant } from './admin-assistants.service.js';
import { AssistantWriteDto } from './dto/assistant-admin.dto.js';

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
 * Kept as its own controller rather than per-route `@Roles` on the shared one:
 * the class-level decorator is the thing a reader checks, and mixing two role
 * sets in one file makes it stop being the answer.
 */
@Controller('admin')
@Roles(...STAFF_ADMIN)
export class AdminManageController {
  constructor(
    private readonly directory: DirectoryService,
    private readonly recordings: ManageRecordingsService,
    private readonly registrations: RegistrationApprovalService,
    private readonly adminStudents: AdminStudentsService,
    private readonly adminAssistants: AdminAssistantsService,
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
      status: query.status,
      limit: query.limit ?? DEFAULT_DIRECTORY_PAGE_SIZE,
      offset: query.offset ?? 0,
    });
  }

  /**
   * Accept a waiting registration: activate, enrol, place - one transaction
   * (`DOM-4`). 200, not 201: nothing is created here that the caller did not
   * already have an id for.
   *
   * Teacher and admin only, by the class-level `@Roles(...STAFF_ADMIN)`. An
   * assistant gets 403 before the service is reached.
   */
  @Post('students/:studentId/accept')
  @HttpCode(HttpStatus.OK)
  async acceptRegistration(
    @Param('studentId') studentId: string,
    @Body() body: AcceptRegistrationDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentDirectoryEntry> {
    return this.registrations.accept(studentId, body.groupId, this.actor(req));
  }

  /**
   * Reject one. Also `registration.reject`, one of the four verbs withheld
   * from an assistant - the decorator is the outer gate and the service
   * asserts the capability as its first statement.
   */
  @Post('students/:studentId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectRegistration(
    @Param('studentId') studentId: string,
    @Body() body: RejectRegistrationDto,
    @Request() req: { user: JwtPayload },
  ): Promise<{ ok: true }> {
    return this.registrations.reject(studentId, body.reason, this.actor(req));
  }

  /** The staff detail view - every profile field, not the list row's subset (`PEOPLE-2`). */
  @Get('students/:studentId')
  async studentDetail(
    @Param('studentId') studentId: string,
  ): Promise<StudentDetail> {
    return this.adminStudents.detail(studentId);
  }

  /** Edits any field, including the three staff-owned ones (`PEOPLE-2`). */
  @Patch('students/:studentId')
  async updateStudent(
    @Param('studentId') studentId: string,
    @Body() body: AdminUpdateStudentDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentDetail> {
    return this.adminStudents.update(studentId, body, this.actor(req));
  }

  /**
   * Creates a student directly, already `active`, and emails a sign-in link
   * (`PEOPLE-3`). 201: this one does create something the caller had no id for.
   */
  @Post('students')
  @HttpCode(HttpStatus.CREATED)
  async createStudent(
    @Body() body: CreateStudentDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentDetail> {
    return this.adminStudents.create(body, this.actor(req));
  }

  /** The assistants/admins list - real accounts and pending invitations, merged (`PEOPLE-4`). */
  @Get('assistants')
  async assistants(): Promise<Assistant[]> {
    return this.adminAssistants.list();
  }

  /** Invites an assistant or admin (`AUTH-4`). No account exists until they accept. */
  @Post('assistants')
  @HttpCode(HttpStatus.CREATED)
  async inviteAssistant(
    @Body() body: AssistantWriteDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Assistant> {
    return this.adminAssistants.invite(body, this.actor(req));
  }

  /** Changes role/scope/groupIds - on a real account, or a still-pending invitation. */
  @Patch('assistants/:userId')
  async updateAssistant(
    @Param('userId') userId: string,
    @Body() body: AssistantWriteDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Assistant> {
    return this.adminAssistants.update(userId, body, this.actor(req));
  }

  /** Cancels a still-pending invitation. Never a real account - see `AdminAssistantsService`. */
  @Delete('assistants/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAssistant(
    @Param('userId') userId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    return this.adminAssistants.remove(userId, this.actor(req));
  }

  @Post('assistants/:userId/resend')
  @HttpCode(HttpStatus.OK)
  async resendAssistantInvitation(
    @Param('userId') userId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ ok: true }> {
    return this.adminAssistants.resend(userId, this.actor(req));
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
}
