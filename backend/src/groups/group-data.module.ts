import { Global, Module } from '@nestjs/common';
import { LearningModeService } from './learning-mode.service.js';
import type { GroupRepository } from './interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from './interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from './repositories/in-memory-group.repository.js';
import { PostgresGroupRepository } from './repositories/postgres-group.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { CoursesModule } from '../courses/courses.module.js';

/**
 * The group *data*, separated from the group *surface* and made `@Global()`.
 *
 * This exists to break a module cycle rather than for tidiness, so the reason
 * is worth stating plainly. Once the learning mode moved onto `GroupCourse`
 * (CLAUDE.md §5.2), the services that render a student's course - `Courses`,
 * `Dashboard`, `Reports`, `Manage` - all need to read group data. But
 * `GroupsModule` needs `CoursesModule` (it validates a course before enrolling
 * a group in one), so `CoursesModule` importing `GroupsModule` back would be a
 * cycle, and `forwardRef` would only hide it.
 *
 * `@Global()` is the codebase's existing answer to exactly this shape -
 * `AuditModule` is global for the same reason, because §5.4 makes an audit
 * entry part of what a mutating action *is* and every feature module needs it.
 * A student's learning mode is now the same kind of cross-cutting fact.
 *
 * What is global is deliberately **only the data and the one derived question**:
 * `GROUP_REPOSITORY` and `LearningModeService`. `GroupsService`, which writes,
 * stays behind `GroupsModule` and is not reachable without importing it.
 *
 * Registered in `app.module.ts` beside `AuditModule` rather than with the
 * feature modules, so the global providers are visible where the other globals
 * are.
 */
@Global()
@Module({
  imports: [CoursesModule],
  providers: [
    LearningModeService,
    InMemoryGroupRepository,
    PostgresGroupRepository,
    repositoryProvider<GroupRepository>(GROUP_REPOSITORY, InMemoryGroupRepository, PostgresGroupRepository),
  ],
  exports: [GROUP_REPOSITORY, LearningModeService],
})
export class GroupDataModule {}
