import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { PublicModule } from './public/public.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { StudentsModule } from './students/students.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { AssessmentsModule } from './assessments/assessments.module.js';
import { LiveSessionsModule } from './live-sessions/live-sessions.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { AuditModule } from './audit/audit.module.js';
import { StaffModule } from './staff/staff.module.js';
import { ManageModule } from './manage/manage.module.js';
import { AnnouncementsModule } from './announcements/announcements.module.js';
import { GroupsModule } from './groups/groups.module.js';
import { GroupDataModule } from './groups/group-data.module.js';

@Module({
  imports: [
    // Global, and first: every feature module's repository provider
    // resolves against the driver this module configures.
    DatabaseModule,
    // Global too, and listed second: CLAUDE.md §5.4 makes an audit entry part
    // of what a mutating TA/admin action *is*, so it has to be available to
    // every feature module that follows.
    AuditModule,
    // Global as well, and for the same shape of reason: once the learning mode
    // moved onto `GroupCourse` (§5.2), every service that renders a student's
    // course needs group data, and `GroupsModule` already depends on
    // `CoursesModule`. Global exports break that cycle without `forwardRef`.
    // Only the repository and `LearningModeService` are global; the writes stay
    // behind `GroupsModule`.
    GroupDataModule,
    RateLimitModule,
    AuthModule,
    EnrollmentsModule,
    StudentsModule,
    CoursesModule,
    RecordingsModule,
    MaterialsModule,
    AssessmentsModule,
    LiveSessionsModule,
    ReportsModule,
    NotificationsModule,
    DashboardModule,
    StaffModule,
    // The TA + admin work surface. After StaffModule, which owns the scoping
    // service every route in it depends on.
    ManageModule,
    // Also after StaffModule, for the same scoping service - and after
    // NotificationsModule, whose service it fans announcements out through
    // (CLAUDE.md §5.14).
    AnnouncementsModule,
    // Groups (CLAUDE.md §5.16) - the cohorts a course is taught to, the staff
    // placement routes and the student classmate list. After StaffModule for
    // the scoping service, AuthModule and CoursesModule for the two
    // repositories it borrows, and EnrollmentsModule for the gate the
    // classmate list checks first (§5.17).
    GroupsModule,
    // The anonymous Visitor surface - the public course catalog the marketing
    // site reads. After CoursesModule, whose COURSE_REPOSITORY it borrows.
    PublicModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global so a new controller is rate limited by default rather than by
    // remembering to decorate it. Routes tighten it with @RateLimit.
    //
    // Nest runs global guards in registration order, which is why the next two
    // are listed after it and in this order: rate limiting first (it keys on IP
    // and must run before any work), then authentication, then authorization.
    // Registering them here rather than per controller makes both fail-closed -
    // a new controller is protected because it exists, not because someone
    // remembered @UseGuards. That default is what CLAUDE.md §5.11 needs before
    // the /api/staff surface is written.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
