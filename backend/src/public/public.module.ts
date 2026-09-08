import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { PublicCoursesController } from './public-courses.controller.js';
import { PublicCoursesService } from './public-courses.service.js';

/**
 * Imports `CoursesModule` for its exported `COURSE_REPOSITORY` rather than
 * re-providing the repository classes - re-providing them would build a second
 * `InMemoryCourseRepository` with its own array, and the public site would then
 * disagree with the student catalog about what exists.
 */
@Module({
  imports: [CoursesModule],
  controllers: [PublicCoursesController],
  providers: [PublicCoursesService],
})
export class PublicModule {}
