import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  ManageService,
  type CourseRosterResponse,
  type ManageOverview,
  type OutlineModule,
} from './manage.service.js';
import {
  GradingService,
  type AssessmentRosterResponse,
  type GradingQueueItem,
  type GradingQueueResponse,
  type MarkbookResponse,
} from './grading.service.js';
import { toMarkbookCsv } from './markbook-csv.js';
import { AnnotationsService } from './annotations.service.js';
import type { SubmissionAnnotation } from '../assessments/interfaces/assessment-repository.interface.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import type { Recording } from '../recordings/interfaces/recording-repository.interface.js';
import type { LiveSession } from '../live-sessions/interfaces/live-session-repository.interface.js';
import {
  AssessmentAuthoringService,
  type AuthoredAssessment,
  type StaffTask,
} from './assessment-authoring.service.js';
import { StaffTasksQueryDto } from './dto/staff-tasks-query.dto.js';
import { GradeSubmissionDto } from './dto/grade-submission.dto.js';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/annotation.dto.js';
import { ListGradingQueueQueryDto } from './dto/queries.dto.js';
import {
  CreateAssessmentDto,
  SetAssessmentTargetsDto,
  UpdateAssessmentDto,
} from './dto/assessment.dto.js';

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
@Roles(...STAFF_ALL)
export class StaffManageController {
  constructor(
    private readonly manage: ManageService,
    private readonly grading: GradingService,
    private readonly recordings: ManageRecordingsService,
    private readonly liveSessions: ManageLiveSessionsService,
    private readonly authoring: AssessmentAuthoringService,
    private readonly annotations: AnnotationsService,
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
   * `MARK-3`: one task's whole cohort, non-submitters included - the roster
   * `queue` above cannot show, because a non-submitter never produces a row.
   * No course id in the path: resolved from the assessment itself, same
   * reasoning as `grade` below.
   */
  @Get('assessments/:assessmentId/submissions')
  async assessmentSubmissions(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<AssessmentRosterResponse> {
    return this.grading.rosterForAssessment(assessmentId, this.actor(req));
  }

  /**
   * `BOOK-1`: the student x task grid for one group, term total included.
   * Group-grain (`D-10`): the path names a group, so this is scoped exactly
   * like every other `/staff/groups/*` route - see `GradingService.markbook`.
   */
  @Get('groups/:groupId/markbook')
  async markbook(
    @Param('groupId') groupId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<MarkbookResponse> {
    return this.grading.markbook(groupId, this.actor(req));
  }

  /**
   * `BOOK-3`: the same grid as CSV. Calls the identical `markbook` the grid
   * route does - never a second read - so the file can never disagree with
   * the screen. `filename*` carries the group's own name through RFC 5987 so
   * an Arabic group name survives the header (CLAUDE.md §1).
   */
  @Get('groups/:groupId/markbook.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async markbookCsv(
    @Param('groupId') groupId: string,
    @Request() req: { user: JwtPayload },
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const data = await this.grading.markbook(groupId, this.actor(req));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="markbook.csv"; filename*=UTF-8''${encodeURIComponent(
        `markbook-${data.groupName}.csv`,
      )}`,
    );
    return toMarkbookCsv(data);
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

  /**
   * `MARK-2`: release a saved mark to the student. Same no-course-id-in-path
   * reasoning as `grade` above.
   */
  @Post('submissions/:submissionId/return')
  @HttpCode(HttpStatus.OK)
  async returnSubmission(
    @Param('submissionId') submissionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<GradingQueueItem> {
    return this.grading.returnToStudent(submissionId, this.actor(req));
  }

  /**
   * The overlay's data (`MARK-1`, `D-2`): every mark drawn on a submission, in
   * one page-percentage coordinate space. No course id in the path, same
   * reasoning as `grade` above - resolved from the submission's own
   * assessment so a submission id for a course the caller does not hold
   * cannot be smuggled in.
   */
  @Get('submissions/:submissionId/annotations')
  async listAnnotations(
    @Param('submissionId') submissionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<SubmissionAnnotation[]> {
    return this.annotations.list(submissionId, this.actor(req));
  }

  @Post('submissions/:submissionId/annotations')
  @HttpCode(HttpStatus.CREATED)
  async createAnnotation(
    @Param('submissionId') submissionId: string,
    @Body() body: CreateAnnotationDto,
    @Request() req: { user: JwtPayload },
  ): Promise<SubmissionAnnotation> {
    return this.annotations.create(submissionId, this.actor(req), {
      fileId: body.fileId ?? null,
      page: body.page,
      kind: body.kind,
      x: body.x,
      y: body.y,
      path: body.path,
      colour: body.colour,
      width: body.width,
      body: body.body,
    });
  }

  /**
   * No submission id in the path: resolved from the annotation itself, same
   * shape as `grade` and `createAnnotation` above.
   *
   * `D-45`: refused for anyone but the annotation's own author - no teacher
   * or admin override. The service enforces it; nothing here decides access.
   */
  @Patch('annotations/:annotationId')
  async updateAnnotation(
    @Param('annotationId') annotationId: string,
    @Body() body: UpdateAnnotationDto,
    @Request() req: { user: JwtPayload },
  ): Promise<SubmissionAnnotation> {
    return this.annotations.update(annotationId, this.actor(req), body);
  }

  /** `D-45`: same author-only rule as `updateAnnotation`. */
  @Delete('annotations/:annotationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAnnotation(
    @Param('annotationId') annotationId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.annotations.remove(annotationId, this.actor(req));
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

  /**
   * Every task the caller reaches, across courses (`TASK-6`). Group-grain: a
   * task appears through a held target, and its targets are narrowed to held
   * groups - unlike the course-grained per-course list below (`AUTH-6`).
   */
  @Get('tasks')
  async listTasks(
    @Query() query: StaffTasksQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StaffTask[]> {
    return this.authoring.listForStaff(this.actor(req), {
      courseId: query.courseId,
      groupId: query.groupId,
      search: query.search,
      status: query.status,
    });
  }

  /**
   * Authoring (CLAUDE.md §5.18). On the **staff** controller, not the admin
   * one, because the client settled §11's open question on 2026-09-10: a
   * teaching assistant may create both assignments and quizzes. One role rule,
   * no branch on the task's `type` - §2.2 warns against exactly that.
   *
   * Scoped like everything else here: the course in the path goes through
   * `StaffScopeService` before anything is read or written.
   */
  @Get('courses/:courseId/assessments')
  async listAssessments(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<AuthoredAssessment[]> {
    return this.authoring.list(courseId, this.actor(req));
  }

  @Post('courses/:courseId/assessments')
  @HttpCode(HttpStatus.CREATED)
  async createAssessment(
    @Param('courseId') courseId: string,
    @Body() body: CreateAssessmentDto,
    @Request() req: { user: JwtPayload },
  ): Promise<AuthoredAssessment> {
    return this.authoring.create(courseId, this.actor(req), {
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      type: body.type,
      topics: body.topics,
      lessonId: body.lessonId ?? null,
      availableFrom: body.availableFrom,
      availableTo: body.availableTo,
      dueAt: body.dueAt,
      maxScore: body.maxScore,
      allowedFileTypes: body.allowedFileTypes,
      maxFileSizeBytes: body.maxFileSizeBytes,
      workType: body.workType,
      externalUrl: body.externalUrl,
      googleForm: body.googleForm,
      targets: body.targets,
      draftId: body.draftId,
      attachments: body.attachments,
      allowResubmission: body.allowResubmission,
      visibility: body.visibility,
      markerId: body.markerId,
      submissionModes: body.submissionModes,
    });
  }

  /** No `courseId` in the path: it is read off the assessment and scoped on. */
  @Patch('assessments/:assessmentId')
  async updateAssessment(
    @Param('assessmentId') assessmentId: string,
    @Body() body: UpdateAssessmentDto,
    @Request() req: { user: JwtPayload },
  ): Promise<AuthoredAssessment> {
    return this.authoring.update(assessmentId, this.actor(req), body);
  }

  /** Re-aims a task: the whole audience, replaced (§5.16). */
  @Post('assessments/:assessmentId/targets')
  async setAssessmentTargets(
    @Param('assessmentId') assessmentId: string,
    @Body() body: SetAssessmentTargetsDto,
    @Request() req: { user: JwtPayload },
  ): Promise<AuthoredAssessment> {
    return this.authoring.setTargets(
      assessmentId,
      this.actor(req),
      body.targets,
    );
  }

  /** Refused once anything has been submitted - the service says why. */
  @Delete('assessments/:assessmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAssessment(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.authoring.remove(assessmentId, this.actor(req));
  }
}
