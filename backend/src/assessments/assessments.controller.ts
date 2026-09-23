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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import { STUDENT_UPLOAD_LIMIT } from '../common/rate-limit/limits.js';
import { UploadsService, type UploadedFileLike } from '../common/storage/uploads.service.js';
import {
  AssessmentsService,
  AssessmentListItem,
  AssessmentDetail,
  STUDENT_UPLOAD_MAX_BYTES,
} from './assessments.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto.js';
import { ListAssessmentsQueryDto } from './dto/list-assessments-query.dto.js';
import type { StoredSubmission } from './interfaces/assessment-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class AssessmentsController {
  constructor(
    private readonly assessmentsService: AssessmentsService,
    private readonly uploads: UploadsService,
  ) {}

  @Get('courses/:id/assessments')
  async listAssessments(
    @Param('id') courseId: string,
    @Query() query: ListAssessmentsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<AssessmentListItem[]> {
    return this.assessmentsService.getAssessmentsForCourse(courseId, req.user.sub, {
      type: query.type,
    });
  }

  @Get('assessments/:id')
  async getAssessmentDetail(
    @Param('id') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<AssessmentDetail> {
    return this.assessmentsService.getAssessmentDetail(assessmentId, req.user.sub);
  }

  @Post('assessments/:id/submissions')
  async submitAssessment(
    @Param('id') assessmentId: string,
    @Body() dto: SubmitAssessmentDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StoredSubmission> {
    return this.assessmentsService.submitAssessment(
      assessmentId,
      req.user.sub,
      { fileUrl: dto.fileUrl, files: dto.files, answerText: dto.answerText },
    );
  }

  /**
   * One file for a submission to this task (`D-48` (a)) - the first upload a
   * student can make. Its own contract rather than a widened staff route
   * (`SECURITY.md` §2.4): the task decides the types and the ceiling, it has
   * its own rate limit, and it attaches nothing - the file becomes work only
   * when `POST .../submissions` names it.
   *
   * Memory storage and a multer ceiling, as the staff route: nothing touches
   * disk before the whitelist has run, and multer stops reading at 20 MB. The
   * client's filename is never read.
   */
  @Post('assessments/:id/files')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(STUDENT_UPLOAD_LIMIT)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: STUDENT_UPLOAD_MAX_BYTES, files: 1 } }),
  )
  async uploadFile(
    @Param('id') assessmentId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Request() req: { user: JwtPayload },
  ): Promise<{ url: string; mimeType: string }> {
    const rules = await this.assessmentsService.uploadRulesFor(assessmentId, req.user.sub);
    const stored = await this.uploads.store(file, rules);
    return { url: stored.url, mimeType: stored.mimeType };
  }
}
