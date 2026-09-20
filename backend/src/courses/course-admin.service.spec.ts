import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CourseAdminService } from './course-admin.service.js';
import { COURSE_REPOSITORY } from './interfaces/course-repository.interface.js';
import { InMemoryCourseRepository } from './repositories/in-memory-course.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { Role } from '../auth/roles.enum.js';

const TEACHER = { id: 'teacher-1', role: 'teacher' };
const FULL_ADMIN = { id: 'admin-1', role: 'admin' };

const NEW_COURSE = {
  title: 'IGCSE Physics',
  description: 'Papers 1 and 2',
  slug: 'igcse-physics',
  teacherName: 'Dr. Tahir Elshazli',
};

describe('CourseAdminService', () => {
  let service: CourseAdminService;
  let courses: InMemoryCourseRepository;
  let audit: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseAdminService,
        AuditService,
        // The real `DatabaseService` on a null pool: `AuditService.record`
        // refuses to write outside a transaction, so a stub would hide a
        // missing wrap rather than catch it.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: COURSE_REPOSITORY, useClass: InMemoryCourseRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    }).compile();

    service = module.get(CourseAdminService);
    courses = module.get(COURSE_REPOSITORY);
    audit = module.get(AuditService);
  });

  describe('create', () => {
    it('creates a draft course with an empty outline', async () => {
      const created = await service.create(NEW_COURSE, TEACHER);
      expect(created).toMatchObject({
        slug: 'igcse-physics',
        title: 'IGCSE Physics',
        // **Draft by default.** A course that published itself on creation
        // would put an empty outline on the marketing site.
        isPublished: false,
        sequentialLockEnabled: false,
        thumbnailUrl: null,
        modules: [],
      });
      expect(await courses.findById(created.id)).not.toBeNull();
    });

    it('keeps a new draft off the public catalog until it is published', async () => {
      await service.create(NEW_COURSE, TEACHER);
      const published = await courses.findPublished(50, 0);
      expect(published.map((c) => c.slug)).not.toContain('igcse-physics');
    });

    it('honours an explicit isPublished', async () => {
      const created = await service.create(
        { ...NEW_COURSE, isPublished: true, sequentialLockEnabled: true },
        TEACHER,
      );
      expect(created).toMatchObject({
        isPublished: true,
        sequentialLockEnabled: true,
      });
    });

    it('409s a slug that is already taken', async () => {
      await expect(
        service.create({ ...NEW_COURSE, slug: 'as-chemistry' }, TEACHER),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('writes a course.created entry with a null before', async () => {
      const created = await service.create(NEW_COURSE, FULL_ADMIN);
      const page = await audit.find({ limit: 50, action: 'course.created' });
      const entry = page.entries.find((e) => e.targetId === created.id)!;
      expect(entry).toMatchObject({
        actorId: 'admin-1',
        // `actorRoleOf`, never a ternary.
        actorRole: Role.Admin,
        targetType: 'course',
        courseId: created.id,
        before: null,
      });
      expect(entry.after).toMatchObject({ slug: 'igcse-physics' });
    });
  });

  describe('update', () => {
    it('changes the named fields and leaves the rest alone', async () => {
      const updated = await service.update(
        'course-1',
        { title: 'AS Chemistry (2026)' },
        TEACHER,
      );
      expect(updated).toMatchObject({
        title: 'AS Chemistry (2026)',
        slug: 'as-chemistry',
        sequentialLockEnabled: true,
      });
      // The outline is not this method's business and must survive it.
      expect(updated.modules).toHaveLength(3);
    });

    it('un-publishes a course without touching anything else', async () => {
      const updated = await service.update(
        'course-1',
        { isPublished: false },
        TEACHER,
      );
      expect(updated.isPublished).toBe(false);
      expect((await courses.findPublished(50, 0)).map((c) => c.id)).not.toContain(
        'course-1',
      );
    });

    it('404s a course that does not exist', async () => {
      await expect(
        service.update('course-nope', { title: 'x' }, TEACHER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s a slug that belongs to another course, and allows its own', async () => {
      await expect(
        service.update('course-1', { slug: 'ielts-preparation-live' }, TEACHER),
      ).rejects.toBeInstanceOf(ConflictException);
      // Re-sending the slug it already has is not a conflict with itself.
      await expect(
        service.update('course-1', { slug: 'as-chemistry' }, TEACHER),
      ).resolves.toMatchObject({ slug: 'as-chemistry' });
    });

    it('records a before that is not an alias of the after', async () => {
      // The bug this guards has shipped twice: the in-memory driver hands back
      // the stored row itself, so a `before` held by reference is mutated by
      // the update and the entry records a change that appears never to have
      // happened - evidence-shaped and empty.
      await service.update('course-1', { title: 'Renamed' }, TEACHER);
      const page = await audit.find({ limit: 50, action: 'course.updated' });
      const entry = page.entries[0];
      expect(entry.before).toMatchObject({ title: 'AS Chemistry' });
      expect(entry.after).toMatchObject({ title: 'Renamed' });
      expect(entry.before).not.toEqual(entry.after);
    });
  });
});
