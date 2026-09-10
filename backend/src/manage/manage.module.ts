import { Module } from '@nestjs/common';
import { StaffManageController } from './staff-manage.controller.js';
import { AdminManageController } from './admin-manage.controller.js';
import { ManageService } from './manage.service.js';
import { GradingService } from './grading.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import { DirectoryService } from './directory.service.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { AssessmentsModule } from '../assessments/assessments.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { LiveSessionsModule } from '../live-sessions/live-sessions.module.js';

/**
 * The TA and admin work surface: overview, roster, grading, the recording
 * library, the live-session schedule, and the people directory.
 *
 * It provides no repositories of its own. Every one is imported from the module
 * that owns it, because re-providing a token here would build a *second*
 * instance - and under the in-memory driver that means a second array, so a
 * grade written through this module would be invisible to the student reading
 * it through `AssessmentsModule`. The exported tokens exist for exactly this.
 *
 * `StaffModule` supplies `StaffScopeService`, which every read and write here
 * goes through first (CLAUDE.md §5.11). `AuditService` arrives via the global
 * `AuditModule`.
 */
@Module({
  imports: [
    AuthModule,
    StaffModule,
    CoursesModule,
    EnrollmentsModule,
    AssessmentsModule,
    RecordingsModule,
    LiveSessionsModule,
  ],
  controllers: [StaffManageController, AdminManageController],
  providers: [
    ManageService,
    GradingService,
    ManageRecordingsService,
    ManageLiveSessionsService,
    DirectoryService,
    // Authoring (§5.18). Needs no new import: ASSESSMENT_REPOSITORY comes from
    // AssessmentsModule above, and GROUP_REPOSITORY is global.
    AssessmentAuthoringService,
  ],
})
export class ManageModule {}
