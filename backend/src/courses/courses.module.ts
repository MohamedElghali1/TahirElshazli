import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from './repositories/in-memory-course.repository.js';

@Module({
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
