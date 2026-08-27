import { Test, TestingModule } from '@nestjs/testing';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { STUDENT_REPOSITORY } from './interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from './repositories/in-memory-student.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('StudentsController', () => {
  let controller: StudentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        StudentsService,
        {
          provide: STUDENT_REPOSITORY,
          useClass: InMemoryStudentRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StudentsController>(StudentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return student profile', async () => {
    const profile = await controller.getMyProfile({ user: { sub: 'student-1', email: 'student@example.com', role: 'student' } });
    expect(profile).toBeDefined();
    expect(profile.name).toBe('Ahmed Hassan');
  });
});
