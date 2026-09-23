import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  AssessmentsService,
  AssessmentListItem,
  AssessmentDetail,
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
  constructor(private readonly assessmentsService: AssessmentsService) {}

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
      dto.fileUrl,
      dto.answerText,
      dto.files,
      dto.linkUrl,
    );
  }
}
