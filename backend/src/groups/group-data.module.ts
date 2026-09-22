import { Global, Module } from '@nestjs/common';
import { StudentGroupsService } from './student-groups.service.js';
import type { GroupRepository } from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from './repositories/in-memory-group.repository.js';
import { PostgresGroupRepository } from './repositories/postgres-group.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';

/**
 * The group *data*, separated from the group *surface* and made `@Global()`.
 *
 * **The cycle this was built to break no longer exists, and that is recorded
 * rather than quietly inherited.** It existed because the learning mode lived
 * on `GroupCourse`, so `CoursesService` had to read group data, while
 * `GroupsModule` already imported `CoursesModule` to validate a course before
 * enrolling a group in one - a cycle `forwardRef` would only have hidden.
 * `D-9` retired the learning mode (unit 2 slice 2a, 2026-09-20),
 * `LearningModeService` is deleted, and `CoursesService` no longer touches
 * group data. This module's own `CoursesModule` import went with it.
 *
 * It stays `@Global()` anyway, for the narrower reason that four feature
 * modules - `AssessmentsModule`, `ManageModule`, `AnnouncementsModule` and
 * `GroupsModule` - read `GROUP_REPOSITORY` or `StudentGroupsService`, and
 * de-globalising it is an import-graph change with no behavioural payoff that
 * belongs in its own task rather than inside a destructive migration's slice.
 * **It is no longer load-bearing**, which is the fact a future reader needs:
 * do not cite it as precedent for a fourth global module.
 *
 * What is global is deliberately **only the data and the one derived question**:
 * `GROUP_REPOSITORY` and `StudentGroupsService`. `GroupsService`, which writes,
 * stays behind `GroupsModule` and is not reachable without importing it.
 *
 * Registered in `app.module.ts` beside `AuditModule` rather than with the
 * feature modules, so the global providers are visible where the other globals
 * are.
 */
@Global()
@Module({
  providers: [
    StudentGroupsService,
    InMemoryGroupRepository,
    PostgresGroupRepository,
    repositoryProvider<GroupRepository>(GROUP_REPOSITORY, InMemoryGroupRepository, PostgresGroupRepository),
  ],
  exports: [GROUP_REPOSITORY, StudentGroupsService],
})
export class GroupDataModule {}
