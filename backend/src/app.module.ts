import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard.js';
import { AuthModule } from './auth/auth.module.js';
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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global so a new controller is rate limited by default rather than by
    // remembering to decorate it. Routes tighten it with @RateLimit.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
