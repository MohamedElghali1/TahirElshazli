import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffScopeService } from './staff-scope.service.js';
import { AssistantScopeRepositoryModule } from './assistant-scope-repository.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';

/**
 * `StaffScopeService` is exported because every TA surface - grading,
 * attendance, quizzes, announcements, groups - has to call it before touching
 * data (`CLAUDE.md` §7). It is the reason this module exists.
 *
 * `CoursesModule` is imported for `COURSE_REPOSITORY`, which it re-exports.
 * `GROUP_REPOSITORY` needs no import edge: `GroupDataModule` is `@Global()`.
 * `ASSISTANT_SCOPE_REPOSITORY` lives in its own module (moved out for
 * `PEOPLE-4`/`AUTH-4`, same reason `STUDENT_REPOSITORY` has one) - `AuthModule`
 * needs the same instance for `acceptInvitation`, and this module already
 * imports `AuthModule`, so a repository token `AuthModule` could import back
 * has to live somewhere neither module owns.
 * `AdminStaffController` is gone with `course_staff_assignments` (`AUTH-2`) -
 * assigning an assistant is now a *group* grant, and its route is unit 5's
 * `PATCH /admin/assistants/{userId}`.
 */
@Module({
  imports: [AuthModule, CoursesModule, AssistantScopeRepositoryModule],
  controllers: [StaffController],
  providers: [StaffService, StaffScopeService],
  exports: [StaffScopeService],
})
export class StaffModule {}
