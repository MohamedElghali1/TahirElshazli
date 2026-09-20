import { Module } from '@nestjs/common';
import { StaffManageController } from './staff-manage.controller.js';
import { AdminManageController } from './admin-manage.controller.js';
import { ManageService } from './manage.service.js';
import { GradingService } from './grading.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import { DirectoryService } from './directory.service.js';
import { RegistrationApprovalService } from './registration-approval.service.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { WorkAnalyticsController } from './work-analytics.controller.js';
import { WorkAnalyticsGateService } from './work-analytics-gate.service.js';
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
  controllers: [
    StaffManageController,
    AdminManageController,
    WorkAnalyticsController,
  ],
  providers: [
    ManageService,
    GradingService,
    ManageRecordingsService,
    ManageLiveSessionsService,
    DirectoryService,
    // The registration queue (`DOM-4`). Needs no new import edge: CoursesModule
    // is already here for CoursesService, GROUP_REPOSITORY is global, and
    // USER_REPOSITORY arrives with AuthModule.
    RegistrationApprovalService,
    // Authoring (§5.18). Needs no new import: ASSESSMENT_REPOSITORY comes from
    // AssessmentsModule above, and GROUP_REPOSITORY is global.
    AssessmentAuthoringService,
    // The access decision for every analytics route. These endpoints are keyed
    // by *assessment* id, so the course has to be resolved from the assessment
    // before it can be scoped on - one service rather than four lines repeated
    // per handler (CLAUDE.md §5.11).
    WorkAnalyticsGateService,
  ],
})
export class ManageModule {}
