import { Module } from '@nestjs/common';
import { AdminGroupsController } from './admin-groups.controller.js';
import { ClassmatesController } from './classmates.controller.js';
import { ClassmatesService } from './classmates.service.js';
import { GroupsService } from './groups.service.js';
import { StaffGroupsController } from './staff-groups.controller.js';
import type { GroupRepository } from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from './repositories/in-memory-group.repository.js';
import { PostgresGroupRepository } from './repositories/postgres-group.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { StaffModule } from '../staff/staff.module.js';

/**
 * Groups (CLAUDE.md §5.16) and the two surfaces built directly on them: the
 * staff console's placement routes and the student's classmate list (§5.17).
 *
 * Three controllers rather than one, because the role boundary is carried at
 * class level exactly as it is in `manage/`: `AdminGroupsController` is
 * `@Roles(Teacher)`, `StaffGroupsController` is `@Roles(Assistant, Teacher)`,
 * and `ClassmatesController` is `@Roles(Student)`. Reading any one file tells
 * you who can reach every route in it.
 *
 * `GROUP_REPOSITORY` is exported because the reads that resolve a student's
 * learning mode (§5.2) and, once targeting lands, their assessment list
 * (§5.16) belong to other modules and must reach *this* instance - re-providing
 * the token elsewhere would build a second `InMemoryGroupRepository` with its
 * own arrays, and a placement written here would be invisible there. That is
 * the same trap `EnrollmentsModule` documents.
 *
 * Imports: `AuthModule` for `USER_REPOSITORY`, `CoursesModule` for
 * `COURSE_REPOSITORY`, `EnrollmentsModule` for the classmate list's enrollment
 * gate, `StaffModule` for `StaffScopeService`. `AuditModule` is `@Global()` and
 * needs no import.
 */
@Module({
  imports: [AuthModule, CoursesModule, EnrollmentsModule, StaffModule],
  controllers: [
    AdminGroupsController,
    StaffGroupsController,
    ClassmatesController,
  ],
  providers: [
    GroupsService,
    ClassmatesService,
    InMemoryGroupRepository,
    PostgresGroupRepository,
    repositoryProvider<GroupRepository>(GROUP_REPOSITORY, InMemoryGroupRepository, PostgresGroupRepository),
  ],
  exports: [GroupsService, GROUP_REPOSITORY],
})
export class GroupsModule {}
