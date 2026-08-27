import { Test, TestingModule } from '@nestjs/testing';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from './repositories/in-memory-course.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('CoursesController', () => {
  let controller: CoursesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [
        CoursesService,
        {
          provide: COURSE_REPOSITORY,
          useClass: InMemoryCourseRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CoursesController>(CoursesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list enrolled courses', async () => {
    const courses = await controller.listCourses({ user: { sub: 'student-1', email: 'student@example.com', role: 'student' } });
    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0]).toHaveProperty('learningMode');
    expect(courses[0]).toHaveProperty('progress');
  });

  it('should return course detail', async () => {
    const detail = await controller.getCourseDetail('course-1', { user: { sub: 'student-1', email: 'student@example.com', role: 'student' } });
    expect(detail).toBeDefined();
    expect(detail.modules.length).toBeGreaterThan(0);
    expect(detail).toHaveProperty('learningMode');
    expect(detail).toHaveProperty('progress');
  });
});
