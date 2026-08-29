import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { StudentsModule } from '../students/students.module.js';
import { AssessmentsModule } from '../assessments/assessments.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { MaterialsModule } from '../materials/materials.module.js';
import { LiveSessionsModule } from '../live-sessions/live-sessions.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [
    AuthModule,
    EnrollmentsModule,
    CoursesModule,
    StudentsModule,
    AssessmentsModule,
    RecordingsModule,
    MaterialsModule,
    LiveSessionsModule,
    ReportsModule,
    NotificationsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
