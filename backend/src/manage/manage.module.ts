import { Module } from '@nestjs/common';
import { StorageModule } from '../common/storage/storage.module.js';
import { StaffManageController } from './staff-manage.controller.js';
import { AdminManageController } from './admin-manage.controller.js';
import { ManageService } from './manage.service.js';
import { GradingService } from './grading.service.js';
import { ManageRecordingsService } from './manage-recordings.service.js';
import { ManageLiveSessionsService } from './manage-live-sessions.service.js';
import { DirectoryService } from './directory.service.js';
import { RegistrationApprovalService } from './registration-approval.service.js';
import { AdminStudentsService } from './admin-students.service.js';
import { AdminAssistantsService } from './admin-assistants.service.js';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { WorkAnalyticsController } from './work-analytics.controller.js';
import { WorkAnalyticsGateService } from './work-analytics-gate.service.js';
import { MarkingController } from './marking.controller.js';
import { MarkingService } from './marking.service.js';
import { SubmissionAccessService } from './submission-access.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { AssessmentsModule } from '../assessments/assessments.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { LiveSessionsModule } from '../live-sessions/live-sessions.module.js';
import { StudentRepositoryModule } from '../students/student-repository.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AssistantScopeRepositoryModule } from '../staff/assistant-scope-repository.module.js';
import { AssistantInvitationRepositoryModule } from './assistant-invitation-repository.module.js';
import { TaskDraftsController } from './task-drafts.controller.js';
import { SessionsController } from './sessions.controller.js';
import { TaskDraftsService } from './task-drafts.service.js';
import type { TaskDraftRepository } from './interfaces/task-draft-repository.interface.js';
import { TASK_DRAFT_REPOSITORY } from './interfaces/task-draft-repository.interface.js';
import { InMemoryTaskDraftRepository } from './repositories/in-memory-task-draft.repository.js';
import { PostgresTaskDraftRepository } from './repositories/postgres-task-draft.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';

/**
 * The TA and admin work surface: overview, roster, grading, the recording
 * library, the live-session schedule, and the people directory.
 *
 * It provides one repository of its own, `TASK_DRAFT_REPOSITORY` (`TASK-2`):
 * only this module consumes it, so unlike the invitation repository it needs
 * no separate module to break a cycle. Every other repository is imported from
 * the module that owns it, because re-providing a token here would build a
 * *second* instance - and under the in-memory driver that means a second array, so a
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
    // `UploadsService.enabled`: a task may not ask for uploads the server
    // cannot take (`D-48` (b)).
    StorageModule,
    StaffModule,
    CoursesModule,
    EnrollmentsModule,
    AssessmentsModule,
    RecordingsModule,
    LiveSessionsModule,
    StudentRepositoryModule,
    MailModule,
    // The assistant invitation flow (`PEOPLE-4`, `AUTH-4`). `GROUP_REPOSITORY`
    // needs no import edge - `GroupDataModule` is `@Global()`.
    AssistantScopeRepositoryModule,
    AssistantInvitationRepositoryModule,
  ],
  controllers: [
    StaffManageController,
    AdminManageController,
    WorkAnalyticsController,
    TaskDraftsController,
    SessionsController,
    MarkingController,
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
    // The staff-facing detail/edit/create surface (`PEOPLE-2`, `PEOPLE-3`).
    // Needs StudentRepositoryModule (the profile row) and MailModule
    // (the sign-in-link send) - neither previously imported here.
    AdminStudentsService,
    // The assistants list, invitation flow and scope editing (`PEOPLE-4`,
    // `PEOPLE-6`, `AUTH-4`). Needs `AssistantScopeRepositoryModule` and
    // `AssistantInvitationRepositoryModule`, neither previously imported here.
    AdminAssistantsService,
    // Authoring (§5.18). Needs no new import: ASSESSMENT_REPOSITORY comes from
    // AssessmentsModule above, and GROUP_REPOSITORY is global.
    AssessmentAuthoringService,
    // The access decision for every analytics route. These endpoints are keyed
    // by *assessment* id, so the course has to be resolved from the assessment
    // before it can be scoped on - one service rather than four lines repeated
    // per handler (CLAUDE.md §5.11).
    WorkAnalyticsGateService,
    // Marking (unit 7). The annotation repository is NOT provided here: it
    // comes from `AssessmentsModule`, which the student read needs it in too
    // (assumption A-13).
    SubmissionAccessService,
    MarkingService,
    // The draft library (`TASK-2`), and the one repository this module owns.
    TaskDraftsService,
    InMemoryTaskDraftRepository,
    PostgresTaskDraftRepository,
    repositoryProvider<TaskDraftRepository>(
      TASK_DRAFT_REPOSITORY,
      InMemoryTaskDraftRepository,
      PostgresTaskDraftRepository,
    ),
  ],
})
export class ManageModule {}
