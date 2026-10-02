import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import type { ReportRepository } from './interfaces/report-repository.interface.js';
import { REPORT_REPOSITORY } from './interfaces/report-repository.interface.js';
import { InMemoryReportRepository } from './repositories/in-memory-report.repository.js';
import { PostgresReportRepository } from './repositories/postgres-report.repository.js';
import type { WeeklyReportRepository } from './interfaces/weekly-report-repository.interface.js';
import { WEEKLY_REPORT_REPOSITORY } from './interfaces/weekly-report-repository.interface.js';
import { InMemoryWeeklyReportRepository } from './repositories/in-memory-weekly-report.repository.js';
import { PostgresWeeklyReportRepository } from './repositories/postgres-weekly-report.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AssessmentsModule } from '../assessments/assessments.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { StorageModule } from '../common/storage/storage.module.js';
import { LiveSessionsModule } from '../live-sessions/live-sessions.module.js';
import { WeeklyReportsService } from './weekly-reports.service.js';
import { WeeklyReportsScheduler } from './weekly-reports.scheduler.js';

@Module({
  // `LiveSessionsModule` for `StudentSessionsService.getAttendanceForGroupWeek`
  // (`WeeklyReportsService.compose`'s attendance half, `REM-031`). No cycle:
  // `LiveSessionsModule` imports only `AuthModule`/`EnrollmentsModule`.
  // `GROUP_REPOSITORY` needs no import - `GroupDataModule` is `@Global()`.
  imports: [
    AuthModule,
    EnrollmentsModule,
    AssessmentsModule,
    CoursesModule,
    StorageModule,
    LiveSessionsModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    WeeklyReportsService,
    WeeklyReportsScheduler,
    InMemoryReportRepository,
    PostgresReportRepository,
    repositoryProvider<ReportRepository>(REPORT_REPOSITORY, InMemoryReportRepository, PostgresReportRepository),
    InMemoryWeeklyReportRepository,
    PostgresWeeklyReportRepository,
    repositoryProvider<WeeklyReportRepository>(
      WEEKLY_REPORT_REPOSITORY,
      InMemoryWeeklyReportRepository,
      PostgresWeeklyReportRepository,
    ),
  ],
  exports: [ReportsService, WeeklyReportsService],
})
export class ReportsModule {}
