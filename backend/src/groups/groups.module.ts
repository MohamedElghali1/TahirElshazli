import { Module } from '@nestjs/common';
import { AdminGroupsController } from './admin-groups.controller.js';
import { ClassmatesController } from './classmates.controller.js';
import { ClassmatesService } from './classmates.service.js';
import { GroupsService } from './groups.service.js';
import { StaffGroupsController } from './staff-groups.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { StaffModule } from '../staff/staff.module.js';

/**
 * The group *surface* (CLAUDE.md §5.16) and the student classmate list (§5.17).
 * The repository and `LearningModeService` live in `GroupDataModule`, which is
 * `@Global()` - see that file for why.
 *
 * Three controllers rather than one, because the role boundary is carried at
 * class level exactly as it is in `manage/`: `AdminGroupsController` is
 * `@Roles(Teacher)`, `StaffGroupsController` is `@Roles(Assistant, Teacher)`,
 * and `ClassmatesController` is `@Roles(Student)`. Reading any one file tells
 * you who can reach every route in it.
 *
 * `GROUP_REPOSITORY` is **not** re-provided here. It is global, and providing
 * it again would build a second `InMemoryGroupRepository` with its own arrays -
 * a placement written through this module would be invisible to the dashboard
 * reading it through `LearningModeService`. That is the trap
 * `EnrollmentsModule` documents, arrived at from the other direction.
 *
 * Imports: `AuthModule` for `USER_REPOSITORY`, `CoursesModule` for
 * `COURSE_REPOSITORY`, `EnrollmentsModule` for the classmate list's enrollment
 * gate, `StaffModule` for `StaffScopeService`.
 */
@Module({
  imports: [AuthModule, CoursesModule, EnrollmentsModule, StaffModule],
  controllers: [
    AdminGroupsController,
    StaffGroupsController,
    ClassmatesController,
  ],
  providers: [GroupsService, ClassmatesService],
  exports: [GroupsService],
})
export class GroupsModule {}
