import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssessmentAuthoringService } from './assessment-authoring.service.js';
import { AssessmentsController } from '../assessments/assessments.controller.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { StaffScopeService } from '../staff/staff-scope.service.js';
import { COURSE_STAFF_REPOSITORY } from '../staff/interfaces/course-staff-repository.interface.js';
import { InMemoryCourseStaffRepository } from '../staff/repositories/in-memory-course-staff.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../auth/roles.enum.js';

/** assistant-1 holds course-1; assistant-2 holds nothing. */
const TA = { id: 'assistant-1', role: 'assistant' };
const OTHER_TA = { id: 'assistant-2', role: 'assistant' };
const ADMIN = { id: 'teacher-1', role: 'teacher' };

/** student-1 and student-2 are both in group-1, which studies course-1. */
const STUDENT_1 = {
  user: { sub: 'student-1', email: 's1@example.com', role: 'student', jti: 'j1' },
};

const TASK = {
  title: 'Kinetics problem set',
  description: 'Rates and orders',
  instructions: 'Upload a single PDF.',
  type: 'assignment' as const,
  topics: ['Kinetics'],
  lessonId: null,
  availableFrom: '2026-09-01T00:00:00Z',
  availableTo: '2026-12-01T23:59:59Z',
  dueAt: '2026-09-20T23:59:59Z',
  maxScore: 30,
  allowedFileTypes: ['application/pdf'],
  maxFileSizeBytes: 10 * 1024 * 1024,
  targets: [{ groupId: 'group-1' }],
};

describe('Assessment authoring (§5.18) and targeting (§5.16)', () => {
  let authoring: AssessmentAuthoringService;
  let student: AssessmentsController;
  let audit: AuditService;
  let groups: InMemoryGroupRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        AssessmentAuthoringService,
        AssessmentsService,
        EnrollmentsService,
        StudentGroupsService,
        StaffScopeService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so every module that audits needs the real
        // `DatabaseService`. A null pool selects the memory driver, where
        // `runInTransaction` is a passthrough that still enters the context.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: COURSE_STAFF_REPOSITORY, useClass: InMemoryCourseStaffRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    authoring = module.get(AssessmentAuthoringService);
    student = module.get(AssessmentsController);
    audit = module.get(AuditService);
    groups = module.get(GROUP_REPOSITORY);
  });

  const entries = async () => (await audit.find({ limit: 50 })).entries;

  describe('a TA may author both assignments and quizzes', () => {
    it('lets an assistant create an assignment and records them as the actor', async () => {
      // The client settled this on 2026-09-10, against the preset's narrower
      // reading. One role rule, no branch on `type`.
      const created = await authoring.create('course-1', TA, TASK);
      expect(created.title).toBe('Kinetics problem set');
      expect(created.targets.map((t) => t.groupId)).toEqual(['group-1']);

      const entry = (await entries()).find((e) => e.action === 'assessment.created');
      expect(entry?.actorId).toBe('assistant-1');
      expect(entry?.actorRole).toBe(Role.Assistant);
      // The audience is what a dispute turns on, so it is in the snapshot.
      expect(entry?.after).toMatchObject({ targetGroups: 'group-1' });
    });

    it('lets an assistant create a quiz too', async () => {
      const quiz = await authoring.create('course-1', TA, {
        ...TASK,
        type: 'quiz',
        title: 'Kinetics quiz',
      });
      expect(quiz.type).toBe('quiz');
    });

    it('404s a course the assistant does not hold', async () => {
      await expect(
        authoring.create('course-1', OTHER_TA, TASK),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the window has to be coherent before it is stored (§5.10)', () => {
    it('rejects an inverted availability window', async () => {
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          availableFrom: '2026-12-01T00:00:00Z',
          availableTo: '2026-09-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a due date outside the window', async () => {
      // Otherwise the task is permanently `locked` with nothing to explain it.
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          dueAt: '2027-01-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an edit that would invert the stored window', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK);
      await expect(
        authoring.update(created.id, ADMIN, {
          availableTo: '2026-08-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('targeting is the audience (§5.16)', () => {
    it('refuses a task set for nobody', async () => {
      await expect(
        authoring.create('course-1', ADMIN, { ...TASK, targets: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a group that does not study this course', async () => {
      // group-2 studies course-2. Without this check the task would be set for
      // a cohort that does not take the subject.
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          targets: [{ groupId: 'group-2' }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses the same group twice', async () => {
      await expect(
        authoring.create('course-1', ADMIN, {
          ...TASK,
          targets: [{ groupId: 'group-1' }, { groupId: 'group-1' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaces the whole audience on re-target, and logs both sides', async () => {
      const second = await groups.create({
        name: 'Chemistry — Monday',
        teacherId: 'teacher-1',
      });
      await groups.addCourse({
        groupId: second.id,
        courseId: 'course-1',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
      });
      const created = await authoring.create('course-1', ADMIN, TASK);

      const retargeted = await authoring.setTargets(created.id, ADMIN, [
        { groupId: second.id },
      ]);
      expect(retargeted.targets.map((t) => t.groupId)).toEqual([second.id]);

      const entry = (await entries()).find((e) => e.action === 'assessment.targeted');
      expect(entry?.before).toEqual({ targetGroups: 'group-1' });
      expect(entry?.after).toEqual({ targetGroups: second.id });
      expect(entry?.before).not.toEqual(entry?.after);
    });
  });

  describe('the student sees only what was set for their group', () => {
    it('shows a newly created task on the student list', async () => {
      const before = await student.listAssessments('course-1', {}, STUDENT_1);
      await authoring.create('course-1', ADMIN, TASK);
      const after = await student.listAssessments('course-1', {}, STUDENT_1);

      // §5.18's actual acceptance test: a student opens the app and the thing
      // that was just posted is there.
      expect(after).toHaveLength(before.length + 1);
      expect(after.map((a) => a.title)).toContain('Kinetics problem set');
    });

    it('hides a task set for another group on the same course', async () => {
      const other = await groups.create({
        name: 'Chemistry — Monday',
        teacherId: 'teacher-1',
      });
      await groups.addCourse({
        groupId: other.id,
        courseId: 'course-1',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
      });
      const secret = await authoring.create('course-1', ADMIN, {
        ...TASK,
        title: 'Only for the Monday group',
        targets: [{ groupId: other.id }],
      });

      const list = await student.listAssessments('course-1', {}, STUDENT_1);
      expect(list.map((a) => a.title)).not.toContain('Only for the Monday group');

      // And not reachable by id either - enrollment alone stopped being enough
      // the moment work was set per group.
      await expect(
        student.getAssessmentDetail(secret.id, STUDENT_1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applies a per-group window override to the student it belongs to', async () => {
      const created = await authoring.create('course-1', ADMIN, {
        ...TASK,
        targets: [{ groupId: 'group-1', dueAt: '2026-11-30T23:59:59Z' }],
      });
      const detail = await student.getAssessmentDetail(created.id, STUDENT_1);
      // The override, not the assessment's own 2026-09-20.
      expect(detail.dueAt).toBe('2026-11-30T23:59:59Z');
    });

    it('leaves an unplaced student with an empty list, not an error', async () => {
      // §7.2's state. student-2 holds course-1 and sits in group-1; remove them
      // and the course goes quiet rather than erroring.
      await groups.removeMember('group-1', 'student-2');
      const student2 = {
        user: { sub: 'student-2', email: 's2@example.com', role: 'student', jti: 'j2' },
      };
      await expect(student.listAssessments('course-1', {}, student2)).resolves.toEqual([]);
    });
  });

  describe('deleting is guarded by the student work on it', () => {
    it('deletes a task nobody has submitted to', async () => {
      const created = await authoring.create('course-1', ADMIN, TASK);
      await authoring.remove(created.id, ADMIN);
      const list = await student.listAssessments('course-1', {}, STUDENT_1);
      expect(list.map((a) => a.id)).not.toContain(created.id);

      const entry = (await entries()).find((e) => e.action === 'assessment.deleted');
      expect(entry?.before).toMatchObject({ title: 'Kinetics problem set' });
      expect(entry?.after).toBeNull();
    });

    it('refuses to delete one that has a submission', async () => {
      // assess-3 carries sub-1. A submission is a student's work and §6 keeps
      // history where history matters, so this refuses rather than cascading.
      await expect(
        authoring.remove('assess-3', ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
