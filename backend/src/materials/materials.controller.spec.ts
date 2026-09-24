import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import { MATERIAL_REPOSITORY } from './interfaces/material-repository.interface.js';
import { InMemoryMaterialRepository } from './repositories/in-memory-material.repository.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';

const STUDENT = {
  user: { sub: 'student-1', email: 'student@example.com', role: 'student', jti: 'j1' },
};

describe('MaterialsController', () => {
  let controller: MaterialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [
        EnrollmentsService,
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        MaterialsService,
        { provide: MATERIAL_REPOSITORY, useClass: InMemoryMaterialRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MaterialsController>(MaterialsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should back all three quick-access links with content', async () => {
    const grouped = await controller.listMaterials('course-1', {}, STUDENT);
    expect(grouped.course_notes).toHaveLength(3);
    expect(grouped.study_materials).toHaveLength(3);
    expect(grouped.important_files).toHaveLength(2);
  });

  it('should keep the response shape stable when filtering by category', async () => {
    const grouped = await controller.listMaterials('course-1', {
      category: 'important_files',
    }, STUDENT);
    expect(Object.keys(grouped).sort()).toEqual([
      'course_notes',
      'important_files',
      'study_materials',
    ]);
    expect(grouped.important_files).toHaveLength(2);
    expect(grouped.course_notes).toEqual([]);
  });

  it('should scope materials to the requested course', async () => {
    const grouped = await controller.listMaterials('course-2', {}, STUDENT);
    expect(grouped.course_notes).toHaveLength(1);
    expect(grouped.course_notes[0].courseId).toBe('course-2');
  });

  it('should refuse materials for a course the student is not enrolled in', async () => {
    // student-2 is enrolled in course-1 only; course-2 materials are off limits.
    await expect(
      controller.listMaterials('course-2', {}, {
        user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
      }),
    ).rejects.toThrow();
  });

  it('should refuse materials for a course that does not exist', async () => {
    await expect(
      controller.listMaterials('course-unknown', {}, STUDENT),
    ).rejects.toThrow();
  });
  it('should carry lessonId so the lesson detail page can filter on it', async () => {
    // `STU-3` shows "its material" by matching `lessonId` against the
    // recording's. If the memory driver drops the field the filter silently
    // matches nothing, which renders as "nothing attached to this lesson" —
    // a wrong answer that looks like a legitimate empty state.
    const grouped = await controller.listMaterials('course-1', {}, STUDENT);
    const notes = grouped.course_notes;

    expect(notes.some((m) => m.lessonId === 'lesson-1')).toBe(true);

    // Null is the normal case, and it must be null rather than undefined: the
    // two behave identically in a `=== lessonId` filter but only one of them
    // means "this material is course-wide" rather than "the driver forgot".
    const all = Object.values(grouped).flat();
    const courseWide = all.filter((m) => m.lessonId === null);
    expect(courseWide.length).toBeGreaterThan(0);
    expect(all.every((m) => m.lessonId !== undefined)).toBe(true);
  });
});
