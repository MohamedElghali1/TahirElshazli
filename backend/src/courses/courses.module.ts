import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from './repositories/in-memory-course.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { LiveSessionsModule } from '../live-sessions/live-sessions.module.js';

@Module({
  imports: [AuthModule, EnrollmentsModule, RecordingsModule, LiveSessionsModule],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    {
      provide: COURSE_REPOSITORY,
      useClass: InMemoryCourseRepository,
    },
  ],
  exports: [CoursesService],
})
export class CoursesModule {}
