import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffScopeService } from './staff-scope.service.js';
import type { AssistantScopeRepository } from './interfaces/assistant-scope-repository.interface.js';
import { ASSISTANT_SCOPE_REPOSITORY } from './interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from './repositories/in-memory-assistant-scope.repository.js';
import { PostgresAssistantScopeRepository } from './repositories/postgres-assistant-scope.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';

/**
 * `StaffScopeService` is exported because every TA surface - grading,
 * attendance, quizzes, announcements, groups - has to call it before touching
 * data (`CLAUDE.md` §7). It is the reason this module exists.
 *
 * `CoursesModule` is imported for `COURSE_REPOSITORY`, which it re-exports.
 * `GROUP_REPOSITORY` needs no import edge: `GroupDataModule` is `@Global()`.
 * `AdminStaffController` is gone with `course_staff_assignments` (`AUTH-2`) -
 * assigning an assistant is now a *group* grant, and its route is unit 5's
 * `PATCH /admin/assistants/{userId}`.
 */
@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [StaffController],
  providers: [
    StaffService,
    StaffScopeService,
    InMemoryAssistantScopeRepository,
    PostgresAssistantScopeRepository,
    repositoryProvider<AssistantScopeRepository>(ASSISTANT_SCOPE_REPOSITORY, InMemoryAssistantScopeRepository, PostgresAssistantScopeRepository),
  ],
  exports: [StaffScopeService],
})
export class StaffModule {}
