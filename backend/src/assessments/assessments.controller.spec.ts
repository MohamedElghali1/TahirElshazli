import { Test, TestingModule } from '@nestjs/testing';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { ASSESSMENT_REPOSITORY } from './interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from './repositories/in-memory-assessment.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';

describe('AssessmentsController', () => {
  let controller: AssessmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        AssessmentsService,
        {
          provide: ASSESSMENT_REPOSITORY,
          useClass: InMemoryAssessmentRepository,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssessmentsController>(AssessmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list assessments with computed status', async () => {
    const assessments = await controller.listAssessments('course-1', { user: { sub: 'student-1', email: 'student@example.com', role: 'student' } });
    expect(assessments.length).toBeGreaterThan(0);
    for (const a of assessments) {
      expect(['locked', 'available', 'submitted', 'corrected']).toContain(a.status);
    }
  });

  it('should return assessment detail with computed status', async () => {
    const detail = await controller.getAssessmentDetail('assess-3', { user: { sub: 'student-1', email: 'student@example.com', role: 'student' } });
    expect(detail).toBeDefined();
    expect(detail.status).toBe('corrected');
    expect(detail.submission).not.toBeNull();
  });
});
