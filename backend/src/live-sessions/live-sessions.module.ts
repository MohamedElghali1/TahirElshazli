import { Module } from '@nestjs/common';
import { StudentSessionsController } from './student-sessions.controller.js';
import { StudentSessionsService } from './student-sessions.service.js';
import { LiveSessionsService } from './live-sessions.service.js';
import type { LiveSessionRepository } from './interfaces/live-session-repository.interface.js';
import { LIVE_SESSION_REPOSITORY } from './interfaces/live-session-repository.interface.js';
import type { AttendanceRepository } from './interfaces/attendance-repository.interface.js';
import { ATTENDANCE_REPOSITORY } from './interfaces/attendance-repository.interface.js';
import { InMemoryLiveSessionRepository } from './repositories/in-memory-live-session.repository.js';
import { PostgresLiveSessionRepository } from './repositories/postgres-live-session.repository.js';
import { InMemoryAttendanceRepository } from './repositories/in-memory-attendance.repository.js';
import { PostgresAttendanceRepository } from './repositories/postgres-attendance.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';

/**
 * `GROUP_REPOSITORY` is not imported here: `GroupDataModule` is `@Global()`
 * (`CLAUDE.md` §5) precisely so consumers like `LiveSessionsService` - which
 * now has to translate a course into its group to serve the legacy
 * course-keyed reads - and `StudentSessionsService` - which reads a student's
 * own group memberships directly - can inject it without an import edge.
 */
@Module({
  imports: [AuthModule, EnrollmentsModule],
  controllers: [StudentSessionsController],
  providers: [
    LiveSessionsService,
    StudentSessionsService,
    InMemoryLiveSessionRepository,
    PostgresLiveSessionRepository,
    InMemoryAttendanceRepository,
    PostgresAttendanceRepository,
    repositoryProvider<LiveSessionRepository>(LIVE_SESSION_REPOSITORY, InMemoryLiveSessionRepository, PostgresLiveSessionRepository),
    repositoryProvider<AttendanceRepository>(ATTENDANCE_REPOSITORY, InMemoryAttendanceRepository, PostgresAttendanceRepository),
  ],
  // The tokens are exported alongside the service so `ManageModule` can reach
  // the *same* instances. Re-providing them there would build a second
  // in-memory array, and a session scheduled through the admin console would
  // be invisible to the student reading it through this module.
  exports: [LiveSessionsService, LIVE_SESSION_REPOSITORY, ATTENDANCE_REPOSITORY],
})
export class LiveSessionsModule {}
