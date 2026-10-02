import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Request } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { WeeklyReportsService, type WeeklyReportView, type WeeklyReportWeekView } from './weekly-reports.service.js';
import type { WeeklyReport } from './interfaces/weekly-report-repository.interface.js';
import { GroupWeekQueryDto, PublishWeeklyReportsDto } from './dto/weekly-report-query.dto.js';

/**
 * The teacher/admin weekly-report surface (`REM-031`, `D-63`, `D-66`). No
 * group scope filter: this whole route class is `STAFF_ADMIN`, so an
 * assistant never reaches it (`D-66` - assistants have no access at all).
 */
@Controller('admin/weekly-reports')
@Roles(...STAFF_ADMIN)
export class AdminWeeklyReportsController {
  constructor(private readonly weeklyReports: WeeklyReportsService) {}

  @Get('weeks')
  async listWeeks(): Promise<WeeklyReportWeekView[]> {
    return this.weeklyReports.listWeeks();
  }

  @Get()
  async listGroupWeek(@Query() query: GroupWeekQueryDto): Promise<WeeklyReportView[]> {
    return this.weeklyReports.listGroupWeek(query.groupId, query.weekStart);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Body() body: PublishWeeklyReportsDto,
    @Request() req: { user: JwtPayload },
  ): Promise<WeeklyReport[]> {
    return this.weeklyReports.publishGroupWeek(
      { id: req.user.sub, role: req.user.role },
      body.groupId,
      body.weekStart,
    );
  }
}
