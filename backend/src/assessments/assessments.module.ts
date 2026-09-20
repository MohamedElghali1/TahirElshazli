import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import type { AssessmentRepository } from './interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from './repositories/in-memory-assessment.repository.js';
import { PostgresAssessmentRepository } from './repositories/postgres-assessment.repository.js';
import type { WorkRepository } from './interfaces/work-repository.interface.js';
import {
  EXTERNAL_WORK_BINDER,
  WORK_REPOSITORY,
} from './interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from './repositories/in-memory-work.repository.js';
import { PostgresWorkRepository } from './repositories/postgres-work.repository.js';
import { GoogleFormSyncService } from './google-form-sync.service.js';
import { WorkAnalyticsService } from './work-analytics.service.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { GoogleIntegrationModule } from '../integrations/google/google-integration.module.js';

/**
 * Assessments, plus the work types layered onto them.
 *
 * `GoogleIntegrationModule` is imported for the access token and the Forms
 * client, and **not** for the credential repository - that is deliberately not
 * exported, so the stored refresh token has exactly one reader and it is not
 * here.
 *
 * **`GroupsModule` is no longer imported.** The denominator of a completion
 * rate is the union of the *targeted groups'* members (§5.16), never the course
 * roster - but `WorkAnalyticsService` now reads `GROUP_REPOSITORY` from the
 * global `GroupDataModule` for it, because `GroupsService.members` became
 * caller-scoped with `D-10` and a scoped read would make the denominator quietly
 * depend on who is looking.
 */
@Module({
  imports: [
    AuthModule,
    EnrollmentsModule,
    GoogleIntegrationModule,
  ],
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    GoogleFormSyncService,
    WorkAnalyticsService,
    InMemoryAssessmentRepository,
    PostgresAssessmentRepository,
    repositoryProvider<AssessmentRepository>(
      ASSESSMENT_REPOSITORY,
      InMemoryAssessmentRepository,
      PostgresAssessmentRepository,
    ),
    InMemoryWorkRepository,
    PostgresWorkRepository,
    repositoryProvider<WorkRepository>(
      WORK_REPOSITORY,
      InMemoryWorkRepository,
      PostgresWorkRepository,
    ),
    // The authoring service binds external work through this port and never
    // learns which providers exist. `useExisting` rather than `useClass` so it
    // is the *same* instance as `GoogleFormSyncService` above - a second one
    // would hold a second in-memory repository and bind into a mirror nothing
    // else reads, which is the defect CLAUDE.md §7.1 describes for re-provided
    // repository tokens.
    { provide: EXTERNAL_WORK_BINDER, useExisting: GoogleFormSyncService },
  ],
  // `manage/` provides no repositories of its own (CLAUDE.md §7.1) - re-providing
  // a token there would build a second in-memory instance, so a result synced
  // through one would be invisible to the other. Hence the token exports.
  exports: [
    EXTERNAL_WORK_BINDER,
    AssessmentsService,
    ASSESSMENT_REPOSITORY,
    WORK_REPOSITORY,
    GoogleFormSyncService,
    WorkAnalyticsService,
  ],
})
export class AssessmentsModule {}
