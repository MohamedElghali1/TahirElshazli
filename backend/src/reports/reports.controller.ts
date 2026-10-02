import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { ReportsService, ReportSummary } from './reports.service.js';
import { WeeklyReportsService } from './weekly-reports.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { ReportDocument } from './interfaces/report-repository.interface.js';
import type { WeeklyReport } from './interfaces/weekly-report-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly weeklyReportsService: WeeklyReportsService,
  ) {}

  @Get('courses/:id/reports/summary')
  async getSummary(
    @Param('id') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<ReportSummary> {
    return this.reportsService.getSummary(courseId, req.user.sub);
  }

  @Get('courses/:id/reports/documents')
  async listDocuments(
    @Param('id') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<ReportDocument[]> {
    return this.reportsService.getDocuments(courseId, req.user.sub);
  }

  @Get('reports/documents/:documentId')
  async getDocument(
    @Param('documentId') documentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<ReportDocument> {
    return this.reportsService.getDocument(documentId, req.user.sub);
  }

  /**
   * The caller's own published weekly reports (`REM-031`), newest first. No id
   * route, so there is no other student's id to guess (`D-66`): `studentId`
   * comes only from the JWT.
   */
  @Get('reports/weekly')
  async listWeeklyReports(@Request() req: { user: JwtPayload }): Promise<WeeklyReport[]> {
    return this.weeklyReportsService.listPublishedForStudent(req.user.sub);
  }
}
