import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import type { ReportRepository } from './interfaces/report-repository.interface.js';
import { REPORT_REPOSITORY } from './interfaces/report-repository.interface.js';
import { InMemoryReportRepository } from './repositories/in-memory-report.repository.js';
import { PostgresReportRepository } from './repositories/postgres-report.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AssessmentsModule } from '../assessments/assessments.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule, AssessmentsModule, CoursesModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    InMemoryReportRepository,
    PostgresReportRepository,
    repositoryProvider<ReportRepository>(REPORT_REPOSITORY, InMemoryReportRepository, PostgresReportRepository),
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
