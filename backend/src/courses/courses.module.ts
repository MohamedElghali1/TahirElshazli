import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { AdminCoursesController } from './admin-courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CourseAdminService } from './course-admin.service.js';
import type { CourseRepository } from './interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from './repositories/in-memory-course.repository.js';
import { PostgresCourseRepository } from './repositories/postgres-course.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { LiveSessionsModule } from '../live-sessions/live-sessions.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule, RecordingsModule, LiveSessionsModule],
  controllers: [CoursesController, AdminCoursesController],
  providers: [
    CoursesService,
    // Course lifecycle (`DOM-5`). Needs no new import: COURSE_REPOSITORY is
    // provided below and AuditService/DatabaseService are global.
    CourseAdminService,
    InMemoryCourseRepository,
    PostgresCourseRepository,
    repositoryProvider<CourseRepository>(COURSE_REPOSITORY, InMemoryCourseRepository, PostgresCourseRepository),
  ],
  // COURSE_REPOSITORY is exported, not just CoursesService: StaffModule needs
  // the repository itself (its admin branch reads every course, which no
  // student-facing service method does). Re-providing the classes there would
  // build a second InMemoryCourseRepository with its own state.
  exports: [CoursesService, COURSE_REPOSITORY],
})
export class CoursesModule {}
