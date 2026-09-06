import { Module } from '@nestjs/common';
import { AdminStaffController } from './admin-staff.controller.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffScopeService } from './staff-scope.service.js';
import type { CourseStaffRepository } from './interfaces/course-staff-repository.interface.js';
import { COURSE_STAFF_REPOSITORY } from './interfaces/course-staff-repository.interface.js';
import { InMemoryCourseStaffRepository } from './repositories/in-memory-course-staff.repository.js';
import { PostgresCourseStaffRepository } from './repositories/postgres-course-staff.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';

/**
 * `StaffScopeService` is exported because every future TA surface - grading,
 * attendance, quizzes, announcements - has to call it before touching data
 * (CLAUDE.md §5.11). It is the reason this module exists; the two controllers
 * are the smallest thing that proves it works.
 *
 * `CoursesModule` is imported for `COURSE_REPOSITORY`, which it re-exports.
 */
@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [StaffController, AdminStaffController],
  providers: [
    StaffService,
    StaffScopeService,
    InMemoryCourseStaffRepository,
    PostgresCourseStaffRepository,
    repositoryProvider<CourseStaffRepository>(COURSE_STAFF_REPOSITORY, InMemoryCourseStaffRepository, PostgresCourseStaffRepository),
  ],
  exports: [StaffScopeService],
})
export class StaffModule {}
