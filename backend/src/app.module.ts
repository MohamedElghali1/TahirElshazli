import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
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

@Module({
  imports: [
    // Global, and first: every feature module's repository provider
    // resolves against the driver this module configures.
    DatabaseModule,
    // Global too, and listed second: CLAUDE.md §5.4 makes an audit entry part
    // of what a mutating TA/admin action *is*, so it has to be available to
    // every feature module that follows.
    AuditModule,
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
