import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from '../src/database/database.service.js';
import { MigrationRunner } from '../src/database/migration-runner.js';
import { PostgresUserRepository } from '../src/auth/repositories/postgres-user.repository.js';
import { PostgresStudentRepository } from '../src/students/repositories/postgres-student.repository.js';
import { PostgresCourseRepository } from '../src/courses/repositories/postgres-course.repository.js';
import { PostgresEnrollmentRepository } from '../src/enrollments/repositories/postgres-enrollment.repository.js';
import { PostgresMaterialRepository } from '../src/materials/repositories/postgres-material.repository.js';
import { PostgresRecordingRepository } from '../src/recordings/repositories/postgres-recording.repository.js';
import { PostgresLiveSessionRepository } from '../src/live-sessions/repositories/postgres-live-session.repository.js';
import { PostgresAssessmentRepository } from '../src/assessments/repositories/postgres-assessment.repository.js';
import { PostgresReportRepository } from '../src/reports/repositories/postgres-report.repository.js';
import { PostgresNotificationRepository } from '../src/notifications/repositories/postgres-notification.repository.js';
import { PostgresAssistantScopeRepository } from '../src/staff/repositories/postgres-assistant-scope.repository.js';
import { PostgresAuditLogRepository } from '../src/audit/repositories/postgres-audit-log.repository.js';
import { PostgresAnnouncementRepository } from '../src/announcements/repositories/postgres-announcement.repository.js';
import { PostgresGroupRepository } from '../src/groups/repositories/postgres-group.repository.js';
import { PostgresBlogRepository } from '../src/blog/repositories/postgres-blog.repository.js';
import { PostgresMailDeliveryRepository } from '../src/mail/postgres-mail-delivery.repository.js';
import { PostgresAssistantInvitationRepository } from '../src/manage/repositories/postgres-assistant-invitation.repository.js';
import { PostgresTaskDraftRepository } from '../src/manage/repositories/postgres-task-draft.repository.js';
import type { NewAssessment } from '../src/assessments/interfaces/assessment-repository.interface.js';
import { Role } from '../src/auth/roles.enum.js';

/**
 * Executes the real SQL against a real Postgres.
 *
 * Skipped unless TEST_DATABASE_URL points at a database this suite may DROP
 * SCHEMA on - it starts from an empty schema every run, so pointing it at
 * anything you care about will destroy it.
 *
 *   docker compose up -d postgres
 *   TEST_DATABASE_URL=postgresql://dev:devpassword@localhost:5432/tahirelshazli_test \
 *     npm run test:integration
 *
 * The assertions are deliberately the ones a unit test against the in-memory
 * stub cannot make: that the DDL parses, that the ON CONFLICT upsert really
 * only moves progress forward, that the revision archive and the overwrite
 * commit as one unit, and that markRead scoped by user_id refuses another
 * student's row.
 */
/** A task with every unit-6 setting at its default; tests override what they assert. */
const NEW_TASK: NewAssessment = {
  courseId: 'course-1',
  lessonId: null,
  title: 'Unit 6 integration task',
  description: '',
  instructions: '',
  type: 'homework',
  topics: [],
  availableFrom: '2026-09-01T00:00:00.000Z',
  availableTo: '2026-12-01T00:00:00.000Z',
  dueAt: '2026-11-01T00:00:00.000Z',
  maxScore: 20,
  allowedFileTypes: ['application/pdf'],
  maxFileSizeBytes: 10485760,
  workType: 'file_upload',
  externalUrl: null,
  visibility: 'published',
  markerId: null,
  allowResubmission: true,
  submissionModes: [],
  draftId: null,
  attachments: [],
};

const connectionString = process.env.TEST_DATABASE_URL;
const describeIfDb = connectionString ? describe : describe.skip;

describeIfDb('Postgres repositories', () => {
  let pool: Pool;
  let db: DatabaseService;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    db = new DatabaseService(pool);

    // A clean schema per run: the migration ledger and every table go, so the
    // migration is exercised from nothing rather than from whatever the last
    // run left behind.
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');

    const runner = new MigrationRunner(db);
    await runner.migrate();
    await runner.seed();
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('applies migrations idempotently', async () => {
    const applied = await new MigrationRunner(db).migrate();
    expect(applied).toEqual([]);
  });

  /**
   * Migration 014's post-conditions, asserted against the catalog rather than
   * inferred from a repository read (`DOM-3` + `DOM-4`). Every one of
   * migrations 001-008 found something on its first real run; this is what
   * that habit looks like written down.
   */
  describe('migration 014', () => {
    it('constrains users.status to the three values', async () => {
      const bad = db.query(
        `INSERT INTO users (id, email, password_hash, role, name, status)
         VALUES ('bad-status', 'bad@example.com', 'x', 'student', 'Bad', 'pendng')`,
      );
      await expect(bad).rejects.toThrow(/users_status_check/);
    });

    it('defaults an existing-style insert to active, so nobody predating the queue is locked out', async () => {
      await db.query(
        `INSERT INTO users (id, email, password_hash, role, name)
         VALUES ('legacy-1', 'legacy@example.com', 'x', 'student', 'Legacy')`,
      );
      const row = await db.queryOne<{ status: string }>(
        `SELECT status FROM users WHERE id = 'legacy-1'`,
      );
      expect(row?.status).toBe('active');
      await db.query(`DELETE FROM users WHERE id = 'legacy-1'`);
    });

    it('indexes the waiting queue, partially', async () => {
      const row = await db.queryOne<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = current_schema() AND indexname = 'users_waiting_idx'`,
      );
      expect(row?.indexdef).toMatch(/WHERE \(status = 'waiting'/);
    });

    it('adds the three staff columns to student_profiles, all nullable', async () => {
      const rows = await db.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'student_profiles'
            AND column_name IN ('school_name', 'parent_email', 'staff_notes')
          ORDER BY column_name`,
      );
      expect(rows).toEqual([
        { column_name: 'parent_email', is_nullable: 'YES' },
        { column_name: 'school_name', is_nullable: 'YES' },
        { column_name: 'staff_notes', is_nullable: 'YES' },
      ]);
    });

    it('does not add a students.mode column (ruling R-2)', async () => {
      // `D-4` struck `students.mode`. Asserted rather than assumed, because
      // five documents still described it when this slice started and the
      // cheapest way for it to reappear is somebody trusting one of them.
      const rows = await db.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'student_profiles'
            AND column_name = 'mode'`,
      );
      expect(rows).toEqual([]);
    });
  });

  /**
   * The registration queue, through the Postgres driver, and **the rollback
   * `RegistrationApprovalService.accept` depends on**.
   *
   * The unit spec proves every write of `accept` is inside one
   * `runInTransaction`; only this driver can prove that the wrap actually
   * undoes them. The memory driver's `runInTransaction` is a documented
   * passthrough with no rollback.
   */
  describe('the registration queue in Postgres', () => {
    const repo = () => new PostgresUserRepository(db);

    it('round-trips a waiting account and moves it through the queue', async () => {
      const r = repo();
      const created = await r.create({
        email: `queued-${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Queued Student',
        role: Role.Student,
        status: 'waiting',
      });
      expect(created.status).toBe('waiting');
      expect((await r.findById(created.id))?.status).toBe('waiting');

      await r.setStatus(created.id, 'active');
      expect((await r.findById(created.id))?.status).toBe('active');

      await r.setStatus(created.id, 'rejected');
      expect((await r.findById(created.id))?.status).toBe('rejected');
      await db.query('DELETE FROM users WHERE id = $1', [created.id]);
    });

    it('filters the directory by status, and shows every status when given none', async () => {
      const r = repo();
      const created = await r.create({
        email: `queued2-${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Zzz Queued Student',
        role: Role.Student,
        status: 'waiting',
      });

      const waiting = await r.findByRole([Role.Student], {
        status: 'waiting',
        limit: 50,
        offset: 0,
      });
      expect(waiting.map((u) => u.id)).toEqual([created.id]);

      const everyone = await r.findByRole([Role.Student], {
        limit: 50,
        offset: 0,
      });
      expect(everyone.map((u) => u.id)).toContain(created.id);
      expect(everyone.length).toBeGreaterThan(waiting.length);

      // The status filter and the search filter compose rather than replace.
      const searched = await r.findByRole([Role.Student], {
        status: 'waiting',
        search: 'Zzz',
        limit: 50,
        offset: 0,
      });
      expect(searched.map((u) => u.id)).toEqual([created.id]);
      await db.query('DELETE FROM users WHERE id = $1', [created.id]);
    });

    it('rolls a half-finished acceptance back', async () => {
      // The named risk: activation committing without the enrolment leaves a
      // student who is `active`, in a group, and enrolled on nothing - every
      // course read 404s and nothing on any screen says why.
      const r = repo();
      const created = await r.create({
        email: `rollback-${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Rollback Student',
        role: Role.Student,
        status: 'waiting',
      });

      await expect(
        db.runInTransaction(async () => {
          await r.setStatus(created.id, 'active');
          // Stands in for `CoursesService.enroll` failing mid-accept.
          throw new Error('enrol failed');
        }),
      ).rejects.toThrow('enrol failed');

      expect((await r.findById(created.id))?.status).toBe('waiting');
      await db.query('DELETE FROM users WHERE id = $1', [created.id]);
    });
  });

  describe('student profile staff fields', () => {
    it('reads the three staff-owned columns from the seeded profile', async () => {
      const profile = await new PostgresStudentRepository(db).findByUserId(
        'student-1',
      );
      expect(profile).toMatchObject({
        schoolName: 'El Alsson School',
        parentEmail: 'parent1@example.com',
        staffNotes: 'Needs extra practice on titration.',
      });
    });

    it('leaves them null on a profile created at registration', async () => {
      const r = new PostgresStudentRepository(db);
      const user = await new PostgresUserRepository(db).create({
        email: `profiled-${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Profiled Student',
        role: Role.Student,
        status: 'waiting',
      });
      const profile = await r.createForUser({
        userId: user.id,
        name: 'Profiled Student',
        email: user.email,
      });
      expect(profile).toMatchObject({
        schoolName: null,
        parentEmail: null,
        staffNotes: null,
      });
      await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    });
  });

  describe('course lifecycle in Postgres', () => {
    const repo = () => new PostgresCourseRepository(db);

    it('creates a draft course with an empty outline', async () => {
      const created = await repo().create({
        slug: `igcse-physics-${Date.now()}`,
        isPublished: false,
        title: 'IGCSE Physics',
        description: 'Papers 1 and 2',
        thumbnailUrl: null,
        teacherName: 'Dr. Tahir Elshazli',
        sequentialLockEnabled: false,
      });
      expect(created).toMatchObject({
        title: 'IGCSE Physics',
        isPublished: false,
        modules: [],
      });
      expect(await repo().findById(created.id)).toMatchObject({
        id: created.id,
      });
      // A draft is absent from the published read, which is what the public
      // catalog is built on.
      const published = await repo().findPublished(100, 0);
      expect(published.map((c) => c.id)).not.toContain(created.id);
      await db.query('DELETE FROM courses WHERE id = $1', [created.id]);
    });

    it('refuses a duplicate slug at the index, even if a service check is skipped', async () => {
      await expect(
        repo().create({
          slug: 'as-chemistry',
          isPublished: false,
          title: 'Clash',
          description: 'x',
          thumbnailUrl: null,
          teacherName: 'x',
          sequentialLockEnabled: false,
        }),
      ).rejects.toThrow(/courses_slug_key/);
    });

    it('updates only the named columns and keeps the outline', async () => {
      const updated = await repo().update('course-1', {
        title: 'AS Chemistry (2026)',
      });
      expect(updated).toMatchObject({
        title: 'AS Chemistry (2026)',
        slug: 'as-chemistry',
        // COALESCE left these alone rather than nulling them.
        sequentialLockEnabled: true,
        isPublished: true,
      });
      expect(updated!.modules.length).toBeGreaterThan(0);
      await repo().update('course-1', { title: 'AS Chemistry' });
    });

    it('tells "leave alone" from "clear it" on the one nullable column', async () => {
      const r = repo();
      await r.update('course-1', { thumbnailUrl: 'https://example.com/a.png' });
      // Absent: untouched.
      expect((await r.update('course-1', { title: 'AS Chemistry' }))?.thumbnailUrl)
        .toBe('https://example.com/a.png');
      // Explicit null: cleared. COALESCE alone cannot express this, which is
      // why the column carries the extra boolean parameter.
      expect((await r.update('course-1', { thumbnailUrl: null }))?.thumbnailUrl)
        .toBeNull();
    });

    it('sets false rather than reading it as "leave alone"', async () => {
      // The COALESCE trap on a boolean column: `false` is not NULL, so it must
      // survive. A driver that tested truthiness would silently ignore it.
      const r = repo();
      expect((await r.update('course-1', { isPublished: false }))?.isPublished)
        .toBe(false);
      await r.update('course-1', { isPublished: true });
    });

    it('returns null for a course that does not exist', async () => {
      expect(await repo().update('course-nope', { title: 'x' })).toBeNull();
    });
  });

  describe('users', () => {
    const repo = () => new PostgresUserRepository(db);

    it('finds a seeded user case-insensitively', async () => {
      const user = await repo().findByEmail('STUDENT@example.com');
      expect(user?.id).toBe('student-1');
      expect(user?.role).toBe(Role.Student);
      expect(user?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('creates a user and reads it back', async () => {
      const created = await repo().create({
        email: '  New.Student@Example.com ',
        passwordHash: 'hash',
        name: 'New Student',
        role: Role.Student,
        status: 'active',
      });
      expect(created.email).toBe('new.student@example.com');
      expect(await repo().findById(created.id)).toMatchObject({
        id: created.id,
      });
    });

    it('redeems a reset token exactly once', async () => {
      const r = repo();
      await r.createPasswordResetToken(
        'student-1',
        'token-single-use',
        new Date(Date.now() + 60_000).toISOString(),
      );
      await r.markPasswordResetTokenUsed('token-single-use');
      const first = await r.findPasswordResetToken('token-single-use');
      expect(first?.usedAt).not.toBeNull();

      // A second redemption must not move the timestamp: the WHERE clause
      // carries `used_at IS NULL`, so it matches no row.
      await r.markPasswordResetTokenUsed('token-single-use');
      const second = await r.findPasswordResetToken('token-single-use');
      expect(second?.usedAt).toBe(first?.usedAt);
    });
  });

  describe('student profiles', () => {
    it('derives enrolledCourseCount from enrollments', async () => {
      const repo = new PostgresStudentRepository(db);
      expect((await repo.findByUserId('student-1'))?.enrolledCourseCount).toBe(2);
      expect((await repo.findByUserId('student-2'))?.enrolledCourseCount).toBe(1);
    });

    it('distinguishes an omitted field from an explicit null', async () => {
      const repo = new PostgresStudentRepository(db);
      const renamed = await repo.updateByUserId('student-1', { name: 'Ali E.' });
      expect(renamed?.name).toBe('Ali E.');
      // phone was not in the update, so it must survive untouched.
      expect(renamed?.phone).toBe('+201234567890');

      const cleared = await repo.updateByUserId('student-1', { phone: null });
      expect(cleared?.phone).toBeNull();
      expect(cleared?.name).toBe('Ali E.');
    });
  });

  describe('courses', () => {
    it('assembles the module and lesson tree in order', async () => {
      const course = await new PostgresCourseRepository(db).findById('course-1');
      expect(course?.sequentialLockEnabled).toBe(true);
      expect(course?.modules.map((m) => m.id)).toEqual(['mod-1', 'mod-2', 'mod-3']);
      expect(course?.modules[0]?.lessons.map((l) => l.order)).toEqual([1, 2, 3, 4]);
    });

    it('returns null for an unknown course', async () => {
      expect(await new PostgresCourseRepository(db).findById('nope')).toBeNull();
    });

    it('loads many courses with their trees in one batch', async () => {
      const repo = new PostgresCourseRepository(db);
      const courses = await repo.findByIds(['course-1', 'course-2']);
      expect(courses.map((c) => c.id).sort()).toEqual(['course-1', 'course-2']);
      // The tree must be attached to the right course, which is the thing a
      // batched join gets wrong if the GROUP key is missing.
      const one = courses.find((c) => c.id === 'course-1');
      const two = courses.find((c) => c.id === 'course-2');
      expect(one?.modules).toHaveLength(3);
      expect(two?.modules).toHaveLength(1);
      expect(two?.modules[0]?.id).toBe('mod-4');
    });

    it('skips unknown ids rather than returning holes, and short-circuits empty', async () => {
      const repo = new PostgresCourseRepository(db);
      expect(
        (await repo.findByIds(['course-1', 'nope'])).map((c) => c.id),
      ).toEqual(['course-1']);
      expect(await repo.findByIds([])).toEqual([]);
    });

    it('resolves a course by its public slug, tree attached', async () => {
      const course = await new PostgresCourseRepository(db).findBySlug(
        'as-chemistry',
      );
      expect(course?.id).toBe('course-1');
      expect(course?.isPublished).toBe(true);
      expect(course?.modules).toHaveLength(3);
    });

    it('returns null for an unknown slug', async () => {
      expect(
        await new PostgresCourseRepository(db).findBySlug('no-such-course'),
      ).toBeNull();
    });

    /**
     * The one that matters: `findPublished` must filter, not merely order.
     * Un-publishing a seeded course has to remove it here while leaving
     * `findAll` - the admin's list - untouched.
     */
    it('excludes unpublished courses from findPublished but not findAll', async () => {
      const repo = new PostgresCourseRepository(db);
      await db.query(
        `UPDATE courses SET is_published = false WHERE id = 'course-3'`,
      );
      try {
        const published = await repo.findPublished(100, 0);
        const all = await repo.findAll(100, 0);
        expect(published.map((c) => c.id)).not.toContain('course-3');
        expect(all.map((c) => c.id)).toContain('course-3');
      } finally {
        await db.query(
          `UPDATE courses SET is_published = true WHERE id = 'course-3'`,
        );
      }
    });

    it('pages findPublished by title', async () => {
      const repo = new PostgresCourseRepository(db);
      const firstPage = await repo.findPublished(1, 0);
      const secondPage = await repo.findPublished(1, 1);
      expect(firstPage).toHaveLength(1);
      expect(secondPage).toHaveLength(1);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
      // ORDER BY title, and 'AS Chemistry' sorts first of the three.
      expect(firstPage[0].title.localeCompare(secondPage[0].title)).toBeLessThan(0);
    });
  });

  describe('enrollments', () => {
    it('is the access gate, and no longer carries the learning mode', async () => {
      const repo = new PostgresEnrollmentRepository(db);
      expect(await repo.find('course-1', 'student-1')).not.toBeNull();
      expect(await repo.find('course-2', 'student-1')).not.toBeNull();
      // student-2 holds course-1 only.
      expect(await repo.find('course-2', 'student-2')).toBeNull();
      // Migration 007 dropped the column and 012 retired the concept (`D-9`).
      // Asserting its absence on the shape is what stops it being quietly
      // re-added as a second source of truth for something that no longer
      // exists.
      expect(await repo.find('course-1', 'student-1')).not.toHaveProperty(
        'learningMode',
      );
    });
  });

  /* The count-only reads the staff overview uses. Each one replaced a
     per-course fetch-then-length, so the assertion that matters is not a
     literal but agreement with the method it replaced: if SQL and the row
     path ever disagree, the console silently shows a wrong integer. */
  describe('staff overview counts', () => {
    const courseIds = ['course-1', 'course-2'];

    it('counts enrollments per course and distinct students across them', async () => {
      const repo = new PostgresEnrollmentRepository(db);

      const perCourse = await repo.countByCourses(courseIds);
      for (const courseId of courseIds) {
        const rows = await repo.findByCourse(courseId);
        expect(perCourse[courseId] ?? 0).toBe(rows.length);
      }

      // Distinct people, not the sum: student-1 holds both seeded courses, so
      // a sum would over-count them and this assertion would fail.
      const distinct = await repo.countDistinctStudents(courseIds);
      const expected = new Set<string>();
      for (const courseId of courseIds) {
        for (const row of await repo.findByCourse(courseId)) {
          expected.add(row.studentId);
        }
      }
      expect(distinct).toBe(expected.size);
      const sum = Object.values(perCourse).reduce((a, b) => a + b, 0);
      expect(distinct).toBeLessThan(sum);
    });

    it('counts recordings per course', async () => {
      const repo = new PostgresRecordingRepository(db);
      const counts = await repo.countByCourses(courseIds);
      for (const courseId of courseIds) {
        const rows = await repo.findByCourseForStaff(courseId);
        expect(counts[courseId] ?? 0).toBe(rows.length);
      }
    });

    it('counts ungraded submissions per course', async () => {
      const repo = new PostgresAssessmentRepository(db);
      const counts = await repo.countUngradedSubmissionsByCourses(courseIds);

      for (const courseId of courseIds) {
        const assessments = await repo.findByCourse(courseId);
        const submissions = await repo.findSubmissionsForAssessments(
          assessments.map((a) => a.id),
        );
        const ungraded = submissions.filter((s) => s.correctedAt === null).length;
        expect(counts[courseId] ?? 0).toBe(ungraded);
      }
    });

    it('answers an empty course list without a round trip', async () => {
      const enrollments = new PostgresEnrollmentRepository(db);
      const recordings = new PostgresRecordingRepository(db);
      const assessments = new PostgresAssessmentRepository(db);
      // A TA assigned to nothing reaches all three with an empty array;
      // `= ANY('{}')` would be valid SQL but a pointless round trip.
      expect(await enrollments.countDistinctStudents([])).toBe(0);
      expect(await recordings.countByCourses([])).toEqual({});
      expect(await assessments.countUngradedSubmissionsByCourses([])).toEqual({});
    });
  });

  describe('materials', () => {
    it('filters by category and sorts newest first', async () => {
      const repo = new PostgresMaterialRepository(db);
      const all = await repo.findByCourse('course-1');
      expect(all).toHaveLength(8);
      expect(new Date(all[0]!.uploadedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(all[1]!.uploadedAt).getTime(),
      );

      const notes = await repo.findByCourse('course-1', 'course_notes');
      expect(notes.every((m) => m.category === 'course_notes')).toBe(true);
      expect(notes).toHaveLength(3);
    });
  });

  describe('recordings', () => {
    it('joins progress and filters by chapter and topic', async () => {
      const repo = new PostgresRecordingRepository(db);
      const all = await repo.findByCourse('course-1', 'student-1');
      expect(all).toHaveLength(12);
      expect(all[0]?.completed).toBe(true);
      // A recording with no progress row must read as zero, not undefined.
      expect(all[11]?.watchedSeconds).toBe(0);

      expect(
        await repo.findByCourse('course-1', 'student-1', { chapter: 'Chapter 2' }),
      ).toHaveLength(4);
      expect(
        await repo.findByCourse('course-1', 'student-1', {
          topic: 'Physical Chemistry',
        }),
      ).toHaveLength(3);
    });

    it('never moves watch progress backwards or unsets a completion', async () => {
      const repo = new PostgresRecordingRepository(db);
      const forward = await repo.upsertProgress('rec-9', 'student-1', 2400);
      expect(forward.completed).toBe(true);
      expect(forward.completedAt).not.toBeNull();

      const rewind = await repo.upsertProgress('rec-9', 'student-1', 10);
      expect(rewind.watchedSeconds).toBe(2400);
      expect(rewind.completed).toBe(true);
      // Stamped once on the transition, never rewritten by a rewatch.
      expect(rewind.completedAt).toBe(forward.completedAt);
    });

    it('caps watched seconds at the recording duration', async () => {
      const repo = new PostgresRecordingRepository(db);
      const progress = await repo.upsertProgress('rec-10', 'student-2', 999_999);
      expect(progress.watchedSeconds).toBe(2640);
    });
  });

  describe('live sessions', () => {
    it('scopes attendance to the course through the session join', async () => {
      const repo = new PostgresLiveSessionRepository(db);
      expect(await repo.findByCourse('course-1')).toHaveLength(3);

      const courseTwo = await repo.findAttendanceForCourse('course-2', 'student-1');
      expect(courseTwo.map((a) => a.sessionId).sort()).toEqual(['sess-5', 'sess-6']);
      expect(await repo.findAttendanceForCourse('course-1', 'student-2')).toEqual([]);
    });

    it('schedules a session into the running order and reads it back', async () => {
      const repo = new PostgresLiveSessionRepository(db);
      const created = await repo.create({
        courseId: 'course-1',
        title: 'Integration clinic',
        zoomLink: 'https://zoom.us/j/70000000001',
        scheduledAt: '2026-08-25T18:00:00Z',
        durationMinutes: 45,
      });
      expect(await repo.findById(created.id)).toMatchObject({
        title: 'Integration clinic',
        durationMinutes: 45,
      });

      // ORDER BY scheduled_at, so it lands between sess-1 and sess-2 rather
      // than at the end - the thing an append-ordered list would get wrong.
      const schedule = await repo.findByCourse('course-1');
      expect(schedule.map((s) => s.id)).toEqual([
        'sess-1',
        created.id,
        'sess-2',
        'sess-3',
      ]);

      await repo.remove(created.id);
    });

    it('leaves an omitted field alone on update', async () => {
      const repo = new PostgresLiveSessionRepository(db);
      const created = await repo.create({
        courseId: 'course-1',
        title: 'Before',
        zoomLink: 'https://zoom.us/j/70000000002',
        scheduledAt: '2026-11-01T18:00:00Z',
        durationMinutes: 60,
      });

      // The COALESCE path: `zoom_link` was not supplied and must survive.
      const updated = await repo.update(created.id, { title: 'After' });
      expect(updated).toMatchObject({
        title: 'After',
        zoomLink: 'https://zoom.us/j/70000000002',
        durationMinutes: 60,
      });
      expect(await repo.update('nope', { title: 'x' })).toBeNull();

      await repo.remove(created.id);
    });

    it('cancels a session, taking its attendance with it', async () => {
      const repo = new PostgresLiveSessionRepository(db);
      const created = await repo.create({
        courseId: 'course-1',
        title: 'Doomed',
        zoomLink: 'https://zoom.us/j/70000000003',
        scheduledAt: '2026-11-08T18:00:00Z',
        durationMinutes: 30,
      });
      await db.query(
        `INSERT INTO attendance (session_id, student_id, attended) VALUES ($1, 'student-1', true)`,
        [created.id],
      );

      expect(await repo.remove(created.id)).toBe(true);
      // ON DELETE CASCADE, which is a real loss of history and the reason the
      // audit entry keeps a full `before` snapshot.
      const orphans = await db.query(
        'SELECT session_id FROM attendance WHERE session_id = $1',
        [created.id],
      );
      expect(orphans).toEqual([]);
      // A second removal is false, not a lie about having deleted something.
      expect(await repo.remove(created.id)).toBe(false);
      expect(await repo.findById(created.id)).toBeNull();
    });
  });

  describe('assessments', () => {
    it('filters by type and sorts by due date descending', async () => {
      const repo = new PostgresAssessmentRepository(db);
      expect(await repo.findByCourse('course-1')).toHaveLength(8);
      const quizzes = await repo.findByCourse('course-1', { type: 'quiz' });
      expect(quizzes.every((a) => a.type === 'quiz')).toBe(true);
      expect(quizzes).toHaveLength(3);
    });

    it('batches one student’s submissions across many assessments', async () => {
      const repo = new PostgresAssessmentRepository(db);
      const ids = ['assess-3', 'assess-4', 'assess-5', 'assess-2'];
      const mine = await repo.findSubmissionsForStudent(ids, 'student-1');
      // assess-2 has no submission, so four ids yield three rows.
      expect(mine.map((s) => s.assessmentId).sort()).toEqual([
        'assess-3',
        'assess-4',
        'assess-5',
      ]);

      // Scoped: student-2 has submitted nothing, and a batch read is exactly
      // where an unscoped query would hand over a whole cohort's marks.
      expect(await repo.findSubmissionsForStudent(ids, 'student-2')).toEqual([]);
      expect(await repo.findSubmissionsForStudent([], 'student-1')).toEqual([]);
    });

    it('preserves per-assessment upload rules', async () => {
      const assessment = await new PostgresAssessmentRepository(db).findById('assess-3');
      expect(assessment?.allowedFileTypes).toEqual(['application/pdf']);
      expect(assessment?.maxFileSizeBytes).toBe(10 * 1024 * 1024);
      expect(assessment?.topics).toEqual(['Moles', 'Physical Chemistry']);
    });

    it('archives a revision and leaves an omitted field alone', async () => {
      const repo = new PostgresAssessmentRepository(db);
      const created = await repo.createSubmission(
        'assess-1',
        'student-1',
        'https://storage.example.com/first.pdf',
        null,
      );

      const updated = await repo.updateSubmission(
        created.id,
        'student-1',
        undefined,
        'typed answer',
      );
      // fileUrl was not supplied, so the uploaded file must survive.
      expect(updated?.fileUrl).toBe('https://storage.example.com/first.pdf');
      expect(updated?.answerText).toBe('typed answer');
      // The first submission timestamp is the start of the history and never moves.
      expect(updated?.submittedAt).toBe(created.submittedAt);
      expect(new Date(updated!.lastSubmittedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.submittedAt).getTime(),
      );

      const revisions = await repo.findRevisions(created.id, 'student-1');
      expect(revisions).toHaveLength(1);
      expect(revisions[0]?.fileUrl).toBe('https://storage.example.com/first.pdf');
      expect(revisions[0]?.answerText).toBeNull();
    });

    it('returns null when the submission does not exist', async () => {
      expect(
        await new PostgresAssessmentRepository(db).updateSubmission(
          'nope',
          'student-1',
          'x',
          'y',
        ),
      ).toBeNull();
    });

    it('refuses to overwrite another student’s submission', async () => {
      const repo = new PostgresAssessmentRepository(db);
      // sub-1 belongs to student-1. Holding its id must not be enough.
      expect(
        await repo.updateSubmission('sub-1', 'student-2', 'evil.pdf', undefined),
      ).toBeNull();
      expect(await repo.findRevisions('sub-1', 'student-2')).toEqual([]);
      // And the real owner's content is untouched.
      const owner = await repo.findSubmission('assess-3', 'student-1');
      expect(owner?.fileUrl).toBe(
        'https://storage.example.com/submissions/midterm.pdf',
      );
    });
  });

  describe('report documents', () => {
    it('returns a student’s documents newest first', async () => {
      const repo = new PostgresReportRepository(db);
      const docs = await repo.findDocuments('course-1', 'student-1');
      expect(docs).toHaveLength(3);
      expect(new Date(docs[0]!.issuedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(docs[2]!.issuedAt).getTime(),
      );
      expect(await repo.findDocuments('course-1', 'student-2')).toEqual([]);
    });
  });

  describe('notifications', () => {
    it('counts and lists only the caller’s unread rows', async () => {
      const repo = new PostgresNotificationRepository(db);
      expect(await repo.countUnread('student-1')).toBe(2);
      expect(await repo.findByUser('student-1', true)).toHaveLength(2);
      expect(await repo.findByUser('student-1', false)).toHaveLength(4);
    });

    it('refuses to mark another student’s notification read', async () => {
      const repo = new PostgresNotificationRepository(db);
      // notif-5 belongs to student-2. Without `user_id` in the WHERE clause
      // this would succeed, which is the BOLA the scoping exists to prevent.
      expect(await repo.markRead('notif-5', 'student-1')).toBeNull();
      expect(await repo.countUnread('student-2')).toBe(1);

      expect((await repo.markRead('notif-1', 'student-1'))?.read).toBe(true);
      expect(await repo.markAllRead('student-1')).toBe(1);
      expect(await repo.countUnread('student-1')).toBe(0);
    });

    it('fans one payload out to many recipients in a single insert', async () => {
      const repo = new PostgresNotificationRepository(db);
      const written = await repo.createMany([
        {
          userId: 'student-1',
          type: 'announcement',
          title: 'Fan-out',
          message: 'Reached both.',
          link: '/learn/course-1',
        },
        {
          userId: 'student-2',
          type: 'announcement',
          title: 'Fan-out',
          message: 'Reached both.',
          link: null,
        },
      ]);
      expect(written).toBe(2);

      // The half the in-memory driver cannot prove: migration 005 widened the
      // `notifications_type_check` CHECK constraint, and without it every
      // announcement insert would fail here and nowhere else.
      expect(await repo.countUnread('student-1')).toBe(1);
      const forStudentTwo = await repo.findByUser('student-2', true);
      expect(forStudentTwo[0]).toMatchObject({
        type: 'announcement',
        // A NULL inside the text[] must stay SQL NULL, not the string 'null'.
        link: null,
      });

      // No round trip and no malformed `unnest` for an empty audience.
      expect(await repo.createMany([])).toBe(0);
    });

    it('still refuses a type the constraint does not name', async () => {
      await expect(
        db.query(
          `INSERT INTO notifications (id, user_id, type, title, message)
           VALUES ('notif-bad', 'student-1', 'not_a_type', 't', 'm')`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('announcements', () => {
    const repo = () => new PostgresAnnouncementRepository(db);

    it('stores the audience as a pair and hands back §6.1’s single string', async () => {
      const course = await repo().create({
        audienceType: 'course',
        courseId: 'course-1',
        title: 'Course only',
        body: 'Body.',
        postedBy: 'assistant-1',
        recipientCount: 2,
      });
      expect(course.audience).toBe('course:course-1');

      const platform = await repo().create({
        audienceType: 'all_tas',
        courseId: null,
        title: 'Every assistant',
        body: 'Body.',
        postedBy: 'teacher-1',
        recipientCount: 2,
      });
      expect(platform.audience).toBe('all_tas');
      expect(platform.courseId).toBeNull();
      expect(platform.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('refuses an audience_type and course_id that disagree', async () => {
      // The CHECK in migration 005. Neither half is reachable through the
      // service, which is exactly why the database has to be the one holding
      // the invariant.
      await expect(
        db.query(
          `INSERT INTO announcements (id, audience_type, course_id, title, body, posted_by)
           VALUES ('ann-bad-1', 'course', NULL, 't', 'b', 'teacher-1')`,
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          `INSERT INTO announcements (id, audience_type, course_id, title, body, posted_by)
           VALUES ('ann-bad-2', 'all_students', 'course-1', 't', 'b', 'teacher-1')`,
        ),
      ).rejects.toThrow();
    });

    it('stores posted_at at the precision a JS Date can represent', async () => {
      // TIMESTAMPTZ(3), not the default microsecond TIMESTAMPTZ. Migration 002
      // records what a microsecond column costs the moment a keyset cursor is
      // added over it: the audit feed silently ended after page one.
      const [row] = await db.query<{ id: string; posted_at: Date }>(
        'SELECT id, posted_at FROM announcements ORDER BY posted_at DESC, id DESC LIMIT 1',
      );
      // The exact round trip a keyset cursor would make: read the timestamp
      // out through a JS Date, hand it straight back, and require it to match
      // the row it came from. On a microsecond column this is false.
      const [same] = await db.query<{ equal: boolean }>(
        'SELECT posted_at = $2::timestamptz AS equal FROM announcements WHERE id = $1',
        [row!.id, row!.posted_at.toISOString()],
      );
      expect(same?.equal).toBe(true);
    });

    it('lists a course’s own announcements, newest first, and pages them', async () => {
      for (const title of ['older', 'newer'] as const) {
        await repo().create({
          audienceType: 'course',
          courseId: 'course-2',
          title,
          body: 'Body.',
          postedBy: 'teacher-1',
          recipientCount: 1,
        });
      }

      const courseTwo = await repo().findByCourse('course-2', 10, 0);
      expect(courseTwo.map((a) => a.title)).toEqual(['newer', 'older']);
      // A platform-wide announcement belongs to no course and must not appear.
      expect(courseTwo.every((a) => a.courseId === 'course-2')).toBe(true);

      const firstPage = await repo().findByCourse('course-2', 1, 0);
      const secondPage = await repo().findByCourse('course-2', 1, 1);
      expect(firstPage[0]?.title).toBe('newer');
      expect(secondPage[0]?.title).toBe('older');

      // findAll spans every audience, which is the admin's sent history.
      const all = await repo().findAll(100, 0);
      expect(all.map((a) => a.audience)).toContain('all_tas');
      expect(all.length).toBeGreaterThan(courseTwo.length);
    });

    it('goes with its course, and holds its author in place', async () => {
      await db.query(
        `INSERT INTO courses (id, slug, title, description, teacher_name, sequential_lock_enabled)
         VALUES ('course-ann', 'course-ann', 'Ann', 'Ann', 'Dr. Tahir Elshazli', false)`,
      );
      const posted = await repo().create({
        audienceType: 'course',
        courseId: 'course-ann',
        title: 'Goes away',
        body: 'Body.',
        postedBy: 'teacher-1',
        recipientCount: 0,
      });
      await db.query(`DELETE FROM courses WHERE id = 'course-ann'`);
      // CASCADE: unlike an audit entry, an announcement to a deleted course
      // addresses nobody and describes nothing.
      expect(await repo().findByCourse('course-ann', 10, 0)).toEqual([]);
      expect(
        (await repo().findAll(100, 0)).map((a) => a.id),
      ).not.toContain(posted.id);

      // RESTRICT on posted_by: the author cannot be deleted out from under it.
      await expect(
        db.query(`DELETE FROM users WHERE id = 'teacher-1'`),
      ).rejects.toThrow();
    });
  });

  describe('users by role', () => {
    it('resolves an audience from the role, ids only, at read time', async () => {
      // What CLAUDE.md §5.14 turns on: `all_tas` is this query, run at the
      // moment of sending, never a stored list.
      const repo = new PostgresUserRepository(db);
      const before = await repo.findIdsByRole([Role.Assistant]);
      expect(before).toContain('assistant-1');
      expect(before).not.toContain('student-1');

      const hire = await repo.create({
        email: 'late.assistant@example.com',
        passwordHash: 'hash',
        name: 'Late Assistant',
        role: Role.Assistant,
        status: 'active',
      });
      expect(await repo.findIdsByRole([Role.Assistant])).toContain(hire.id);
    });

    // AUTH-1. The `admin` value has to survive a real round trip, because
    // migration 011 is the only thing that lets `users_role_check` accept it -
    // on the memory driver the column does not exist and this cannot fail.
    it('stores and reads back the admin role', async () => {
      const repo = new PostgresUserRepository(db);
      const seeded = await repo.findById('admin-1');
      expect(seeded?.role).toBe(Role.Admin);

      const created = await repo.create({
        email: 'second.admin@example.com',
        passwordHash: 'hash',
        name: 'Second Admin',
        role: Role.Admin,
        status: 'active',
      });
      expect((await repo.findById(created.id))?.role).toBe(Role.Admin);
    });

    it('matches any of several roles, and refuses an empty list', async () => {
      // The staff directory reads both tiers in one query (AUTH-1); the
      // `= ANY($1::text[])` predicate is what makes that one round trip.
      const repo = new PostgresUserRepository(db);
      const staff = await repo.findByRole([Role.Assistant, Role.Admin], {
        limit: 50,
        offset: 0,
      });
      const ids = staff.map((u) => u.id);
      expect(ids).toContain('assistant-1');
      expect(ids).toContain('assistant-2');
      expect(ids).toContain('admin-1');
      expect(ids).not.toContain('student-1');
      expect(ids).not.toContain('teacher-1');

      // The safety property the single-role parameter used to give for free:
      // an empty list must never be read as "every account on the platform".
      await expect(
        repo.findByRole([], { limit: 50, offset: 0 }),
      ).rejects.toThrow();
      await expect(repo.findIdsByRole([])).rejects.toThrow();
    });
  });
  /**
   * **Replaces `describe('course staff assignments')`.** `AUTH-2` dropped
   * `course_staff_assignments` and moved an assistant's reach to the group
   * grain; this is the same contract, at the new grain, against the real
   * database - and the Postgres half of the idempotency property the deleted
   * `staff-scope.service.spec.ts` cases used to assert.
   */
  describe('assistant scope and group assignments', () => {
    const repo = () => new PostgresAssistantScopeRepository(db);

    it('reads the seeded scope and grant, and reports an unconfigured one', async () => {
      expect(await repo().findScope('assistant-1')).toBe('assigned_groups');
      expect(await repo().findScope('assistant-2')).toBe('assigned_groups');
      // Never configured is the third state, distinct from "holds nothing".
      expect(await repo().findScope('teacher-1')).toBeNull();

      const held = await repo().findAssignments('assistant-1');
      expect(held.map((a) => a.groupId)).toEqual(['group-1']);
      expect(held[0]?.assignedBy).toBe('teacher-1');
      expect(held[0]?.assignedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // The fixture's whole point: holding a group is not holding every group.
      expect(await repo().findAssignments('assistant-2')).toEqual([]);
    });

    it('is idempotent under the unique index rather than under a prior read', async () => {
      // The ON CONFLICT path, which the in-memory stub cannot exercise: it is
      // the database, not a preceding SELECT, that decides the second call
      // creates nothing.
      const first = await repo().assignGroup('assistant-2', 'group-2', 'teacher-1');
      expect(first.created).toBe(true);

      const second = await repo().assignGroup('assistant-2', 'group-2', 'teacher-1');
      expect(second.created).toBe(false);
      expect(second.assignment.id).toBe(first.assignment.id);

      expect(await repo().unassignGroup('assistant-2', 'group-2')).toBe(true);
      expect(await repo().unassignGroup('assistant-2', 'group-2')).toBe(false);
    });

    it('upserts a scope rather than duplicating the primary key', async () => {
      await repo().setScope('assistant-2', 'all_groups');
      expect(await repo().findScope('assistant-2')).toBe('all_groups');
      await repo().setScope('assistant-2', 'assigned_groups');
      expect(await repo().findScope('assistant-2')).toBe('assigned_groups');
    });

    it('refuses a scope value outside the two the model defines', async () => {
      // The CHECK constraint, not the TypeScript union: a bad value arriving
      // from SQL or a future migration must be refused by the database.
      await expect(
        db.query(
          `INSERT INTO assistant_scopes (user_id, scope) VALUES ('assistant-2', 'everything')
           ON CONFLICT (user_id) DO UPDATE SET scope = EXCLUDED.scope`,
        ),
      ).rejects.toThrow();
    });

    it('cascades a grant away with its group but not with its grantor', async () => {
      // ON DELETE CASCADE on group_id, RESTRICT on assigned_by. The second half
      // is what stops an admin's departure from silently revoking access.
      await db.query(
        `INSERT INTO groups (id, name, teacher_id, course_id)
         VALUES ('group-temp', 'Temp cohort', 'teacher-1', 'course-1')`,
      );
      await repo().assignGroup('assistant-2', 'group-temp', 'teacher-1');
      await db.query(`DELETE FROM groups WHERE id = 'group-temp'`);
      expect(await repo().findAssignments('assistant-2')).toEqual([]);

      await expect(
        db.query(`DELETE FROM users WHERE id = 'teacher-1'`),
      ).rejects.toThrow();
    });
  });

  /**
   * Migration 015's post-conditions, asserted against the catalog rather than
   * inferred from a repository read (`AUTH-2`). The drop is irreversible, so
   * "did it actually happen, and did the backfill actually run" is checked
   * directly rather than believed.
   */
  describe('migration 015', () => {
    const tableExists = async (name: string) => {
      const rows = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = $1`,
        [name],
      );
      return rows[0]!.n > 0;
    };

    it('drops course_staff_assignments and creates the two replacements', async () => {
      expect(await tableExists('course_staff_assignments')).toBe(false);
      expect(await tableExists('assistant_scopes')).toBe(true);
      expect(await tableExists('assistant_group_assignments')).toBe(true);
    });

    it('carries both indexes the scoped reads run on', async () => {
      const rows = await db.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = current_schema()
            AND tablename = 'assistant_group_assignments'`,
      );
      expect(rows.map((r) => r.indexname)).toEqual(
        expect.arrayContaining([
          'assistant_group_assignments_user_id_idx',
          'assistant_group_assignments_group_id_idx',
        ]),
      );
    });

    it('enforces UNIQUE (user_id, group_id)', async () => {
      await expect(
        db.query(
          `INSERT INTO assistant_group_assignments (id, user_id, group_id, assigned_by)
           VALUES ('dup-1', 'assistant-1', 'group-1', 'teacher-1')`,
        ),
      ).rejects.toThrow();
    });

    it('leaves every MIGRATED assistant with an explicit scope row', async () => {
      // "No rows" must never be ambiguous between *everything* and *not set up
      // yet* (`AUTHORIZATION_MODEL.md` §3). An assistant with no row is the
      // ambiguity this assertion exists to catch.
      //
      // Scoped to the accounts 015 and the seeds produce, deliberately. An
      // assistant **created after** the migration gets no scope row from
      // anything - nothing in this slice creates an assistant account, so the
      // only such rows are the ones this suite's own repository tests insert.
      // `StaffScopeService` fails closed on a missing row, so that is a
      // refusal and not a hole; **unit 5's assistant-creation path must write
      // the row**, and this assertion's sibling in
      // `describe('migration 015 backfills the course grants it drops')`
      // proves the migration's half unconditionally.
      const rows = await db.query<{ id: string }>(
        `SELECT u.id FROM users u
          LEFT JOIN assistant_scopes s ON s.user_id = u.id
          WHERE u.role = 'assistant' AND s.user_id IS NULL
            AND u.id IN ('assistant-1', 'assistant-2')`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('audit log', () => {
    const repo = () => new PostgresAuditLogRepository(db);

    it('starts empty - nothing seeds a history nobody made', async () => {
      expect(await repo().find({ limit: 10 })).toEqual({
        entries: [],
        nextCursor: null,
      });
    });

    it('round-trips jsonb snapshots, keeping null distinct from JSON null', async () => {
      const recorded = await repo().record({
        actorId: 'assistant-1',
        actorRole: Role.Assistant,
        action: 'course_staff.assigned',
        targetType: 'course_staff_assignment',
        targetId: 'staff-assignment-1',
        courseId: 'course-1',
        before: null,
        after: { userId: 'assistant-1', courseId: 'course-1' },
      });

      expect(recorded.before).toBeNull();
      expect(recorded.after).toEqual({
        userId: 'assistant-1',
        courseId: 'course-1',
      });

      const [row] = await db.query<{ before: unknown; after: unknown }>(
        'SELECT before, after FROM audit_log WHERE id = $1',
        [recorded.id],
      );
      // SQL NULL, not the jsonb literal `null` - they compare differently.
      expect(row?.before).toBeNull();
    });

    it('filters and pages with a keyset cursor over tied timestamps', async () => {
      // Every row in one transaction shares `now()`, so this is the tie case
      // the (created_at, id) cursor exists for - and it is the normal case
      // here, not a contrived one.
      await db.transaction(async (client) => {
        for (let i = 0; i < 5; i += 1) {
          await client.query(
            `INSERT INTO audit_log (id, actor_id, actor_role, action, target_type, target_id, course_id)
             VALUES ($1, 'teacher-1', 'teacher', 'course_staff.unassigned', 'course_staff_assignment', $2, 'course-2')`,
            [`00000000000001-00000${i}-tie`, `target-${i}`],
          );
        }
      });

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await repo().find({
          limit: 2,
          actorId: 'teacher-1',
          cursor,
        });
        seen.push(...page.entries.map((e) => e.targetId));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it('survives the deletion of what it describes', async () => {
      // No foreign keys, on purpose: deleting a course is itself auditable, and
      // a FK would take the evidence with it.
      await db.query(
        `INSERT INTO courses (id, slug, title, description, teacher_name, sequential_lock_enabled)
         VALUES ('course-gone', 'course-gone', 'Gone', 'Gone', 'Dr. Tahir Elshazli', false)`,
      );
      const recorded = await repo().record({
        actorId: 'teacher-1',
        actorRole: Role.Teacher,
        action: 'course_staff.unassigned',
        targetType: 'course_staff_assignment',
        targetId: 'staff-gone',
        courseId: 'course-gone',
        before: { userId: 'assistant-2' },
        after: null,
      });
      await db.query(`DELETE FROM courses WHERE id = 'course-gone'`);

      const page = await repo().find({ limit: 10, courseId: 'course-gone' });
      expect(page.entries.map((e) => e.id)).toContain(recorded.id);
    });
  });

  /* Groups (CLAUDE.md §5.16, as reshaped by `DOM-1`/`DOM-2`). The assertions
     worth making here are the ones an in-memory array cannot fail: that the DDL
     parses, that the UNIQUE constraint really makes `addMember` idempotent
     rather than the JavaScript `find` in front of it doing it, that
     `findStudentGroups` - a real SQL join, where the memory driver composes two
     filters - agrees with the fixture, and that the COALESCE-per-column update
     tells "leave alone" from "set to NULL". */
  describe('groups', () => {
    const repo = () => new PostgresGroupRepository(db);

    /** A group as the collapsed model needs one. */
    const newGroup = (name: string, courseId = 'course-1') => ({
      name,
      teacherId: 'teacher-1',
      courseId,
      assistantId: null,
      meets: null,
      room: null,
    });

    it('reads the seeded groups, their course and their members', async () => {
      const group = await repo().findById('group-1');
      expect(group?.name).toContain('Saturday');
      // The course is a column now - migration 013 collapsed `group_courses`.
      expect(group?.courseId).toBe('course-1');
      expect(group?.meets).toBe('Saturday 18:00');
      expect(group?.room).toBeNull();
      // Display only. `assistant-1` is named here and, deliberately, that is
      // not what decides whether they may reach the group.
      expect(group?.assistantId).toBe('assistant-1');

      const members = await repo().findMembers('group-1');
      expect(members.map((m) => m.studentId).sort()).toEqual([
        'student-1',
        'student-2',
      ]);
    });

    it('lists the groups studying one course off the new index', async () => {
      expect((await repo().findByCourse('course-1')).map((g) => g.id)).toEqual([
        'group-1',
      ]);
      expect((await repo().findByCourse('course-2')).map((g) => g.id)).toEqual([
        'group-2',
      ]);
      expect(await repo().findByCourse('course-3')).toEqual([]);
    });

    it('joins membership to group for one student and one course', async () => {
      // student-1 is in both groups; group-1 studies course-1 and group-2
      // studies course-2, so each query must return exactly its own group.
      expect(
        (await repo().findStudentGroups('student-1', 'course-1')).map((g) => g.id),
      ).toEqual(['group-1']);
      expect(
        (await repo().findStudentGroups('student-1', 'course-2')).map((g) => g.id),
      ).toEqual(['group-2']);

      // student-2 is only in group-1, so course-2 is empty for them - the
      // "two groups on one course must not see each other" property, at the
      // level the query decides it rather than the service.
      expect(await repo().findStudentGroups('student-2', 'course-2')).toEqual([]);
    });

    it('orders two groups on one course by the membership, longest-standing first', async () => {
      // `StudentGroupsService`'s tie-break, at the level the SQL decides it.
      // The sort key is `group_memberships.assigned_at` now, not the dropped
      // `group_courses.enrolled_at` - a substitution of the key, not the rule.
      const later = await repo().create(newGroup('Chemistry — Monday'));
      await repo().addMember({
        groupId: later.id,
        studentId: 'student-1',
        assignedBy: 'teacher-1',
      });

      // student-1 was placed in group-1 in January; the new one is today.
      const groups = await repo().findStudentGroups('student-1', 'course-1');
      expect(groups.map((g) => g.id)).toEqual(['group-1', later.id]);

      await db.query('DELETE FROM groups WHERE id = $1', [later.id]);
    });

    it('resolves to an empty list for an enrolled but unplaced student', async () => {
      // student-2 holds course-1 and sits in group-1. With the placement gone
      // the answer is `[]`, not an error - callers render an empty course.
      // This is the case the deleted `LearningModeService` fallback chain used
      // to protect; the chain is gone, the case is not.
      await repo().removeMember('group-1', 'student-2');
      expect(await repo().findStudentGroups('student-2', 'course-1')).toEqual([]);
      await repo().addMember({
        groupId: 'group-1',
        studentId: 'student-2',
        assignedBy: 'assistant-1',
      });
    });

    it('makes addMember idempotent through the UNIQUE constraint', async () => {
      const first = await repo().addMember({
        groupId: 'group-2',
        studentId: 'student-2',
        assignedBy: 'assistant-1',
      });
      const second = await repo().addMember({
        groupId: 'group-2',
        studentId: 'student-2',
        // A different actor on the second call: the row must keep the first
        // one. Overwriting it would rewrite the §5.4 trail with whoever
        // clicked last.
        assignedBy: 'teacher-1',
      });
      expect(second.id).toBe(first.id);
      expect(second.assignedBy).toBe('assistant-1');
      expect(
        (await repo().findMembers('group-2')).filter(
          (m) => m.studentId === 'student-2',
        ),
      ).toHaveLength(1);

      expect(await repo().removeMember('group-2', 'student-2')).toBe(true);
      // Second removal is a no-op, and says so rather than throwing.
      expect(await repo().removeMember('group-2', 'student-2')).toBe(false);
    });

    it('updates only the columns the patch names, and clears on an explicit null', async () => {
      // The distinction a plain COALESCE cannot make: `undefined` means "leave
      // alone" and `null` means "clear it", and both reach the driver as SQL
      // NULL. This is the assertion that proves the boolean flag beside each
      // nullable column is doing its job - an array cannot fail it.
      const group = await repo().create({
        ...newGroup('Patch me'),
        assistantId: 'assistant-1',
        meets: 'Friday 10:00',
        room: 'Room 1',
      });

      const renamed = await repo().update(group.id, { name: 'Renamed' });
      expect(renamed).toMatchObject({
        name: 'Renamed',
        courseId: 'course-1',
        assistantId: 'assistant-1',
        meets: 'Friday 10:00',
        room: 'Room 1',
      });

      const cleared = await repo().update(group.id, {
        assistantId: null,
        room: null,
      });
      expect(cleared).toMatchObject({
        name: 'Renamed',
        assistantId: null,
        meets: 'Friday 10:00',
        room: null,
      });

      const moved = await repo().update(group.id, { courseId: 'course-2' });
      expect(moved?.courseId).toBe('course-2');

      expect(await repo().update('group-nope', { name: 'x' })).toBeNull();
      await db.query('DELETE FROM groups WHERE id = $1', [group.id]);
    });

    it('refuses a group with no course at the database level', async () => {
      // `groups.course_id` is NOT NULL as of 013. The repository cannot write
      // one, and neither can anything else - which is what makes "a group
      // studies exactly one course" a schema fact rather than a convention.
      await expect(
        db.query(
          `INSERT INTO groups (id, name, teacher_id) VALUES ('no-course', 'x', 'teacher-1')`,
        ),
      ).rejects.toThrow(/course_id/);
    });

    it('counts members per group in one query, agreeing with the row path', async () => {
      const ids = ['group-1', 'group-2'];
      const counts = await repo().countMembersByGroups(ids);
      for (const id of ids) {
        expect(counts[id] ?? 0).toBe((await repo().findMembers(id)).length);
      }
      // A group with no members is absent rather than 0; callers default.
      const empty = await repo().create(newGroup('Empty'));
      expect((await repo().countMembersByGroups([empty.id]))[empty.id]).toBeUndefined();
      expect(await repo().countMembersByGroups([])).toEqual({});
      await db.query('DELETE FROM groups WHERE id = $1', [empty.id]);
    });

    it('cascades memberships when a group goes', async () => {
      const doomed = await repo().create(newGroup('Doomed'));
      await repo().addMember({
        groupId: doomed.id,
        studentId: 'student-1',
        assignedBy: 'teacher-1',
      });

      // There is no delete on the repository (§6: soft-delete where history
      // matters, and a group carries placement history). This asserts the DDL
      // rather than an API: if a group is ever removed by hand, it must not
      // leave orphaned rows pointing at nothing.
      await db.query('DELETE FROM groups WHERE id = $1', [doomed.id]);
      expect(await repo().findMembers(doomed.id)).toEqual([]);
    });
  });

  /* Assessment targeting (CLAUDE.md §5.16). The assertions worth making against
     a real database rather than an array: that DISTINCT ON really collapses a
     student in two groups to one row and picks the group the caller ranked
     first, that COALESCE really applies a per-group override, and that the
     UNIQUE constraint - not the JavaScript in front of it - is what makes
     setTargets idempotent. */
  describe('assessment targeting', () => {
    const repo = () => new PostgresAssessmentRepository(db);
    const groups = () => new PostgresGroupRepository(db);

    it('shows a student only what was set for a group they are in', async () => {
      // The seed targets all eight of course-1's assessments at group-1.
      const all = await repo().findByCourse('course-1');
      const targeted = await repo().findByCourseForGroups('course-1', ['group-1']);
      expect(targeted).toHaveLength(all.length);

      // A group that studies course-1 but has been set nothing.
      const empty = await groups().create({
        name: 'Empty cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      expect(await repo().findByCourseForGroups('course-1', [empty.id])).toEqual([]);

      // And no group at all - the unplaced student (§7.2) - answers empty
      // without a round trip.
      expect(await repo().findByCourseForGroups('course-1', [])).toEqual([]);
    });

    it('coalesces a per-group override over the assessment window', async () => {
      const base = (await repo().findById('assess-1'))!;
      const other = await groups().create({
        name: 'Override cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      await repo().setTargets('assess-1', [
        { groupId: 'group-1' },
        { groupId: other.id, dueAt: '2026-11-30T23:59:59.000Z' },
      ]);

      const inherited = await repo().findByIdForGroups('assess-1', ['group-1']);
      expect(inherited?.dueAt).toBe(base.dueAt);
      expect(inherited?.windowOverridden).toBe(false);

      const overridden = await repo().findByIdForGroups('assess-1', [other.id]);
      expect(overridden?.dueAt).toBe('2026-11-30T23:59:59.000Z');
      expect(overridden?.windowOverridden).toBe(true);
      // Only the overridden field moves; the rest still inherit.
      expect(overridden?.availableFrom).toBe(base.availableFrom);

      // Put the seed back: the suite shares one database across describes.
      await repo().setTargets('assess-1', [{ groupId: 'group-1' }]);
    });

    it('gives a student in two targeted groups one row, on the first group terms', async () => {
      const second = await groups().create({
        name: 'Second cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      await repo().setTargets('assess-1', [
        { groupId: 'group-1' },
        { groupId: second.id, dueAt: '2026-10-15T23:59:59.000Z' },
      ]);

      // Caller order is the tie-break: longest-standing placement first.
      const first = (
        await repo().findByCourseForGroups('course-1', ['group-1', second.id])
      ).filter((a) => a.id === 'assess-1');
      expect(first).toHaveLength(1);
      expect(first[0]!.targetGroupId).toBe('group-1');

      const reversed = (
        await repo().findByCourseForGroups('course-1', [second.id, 'group-1'])
      ).filter((a) => a.id === 'assess-1');
      expect(reversed).toHaveLength(1);
      expect(reversed[0]!.targetGroupId).toBe(second.id);
      expect(reversed[0]!.dueAt).toBe('2026-10-15T23:59:59.000Z');

      await repo().setTargets('assess-1', [{ groupId: 'group-1' }]);
    });

    it('replaces the audience rather than accumulating it', async () => {
      const second = await groups().create({
        name: 'Replace cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      await repo().setTargets('assess-2', [{ groupId: 'group-1' }, { groupId: second.id }]);
      expect(await repo().findTargets('assess-2')).toHaveLength(2);

      await repo().setTargets('assess-2', [{ groupId: second.id }]);
      const after = await repo().findTargets('assess-2');
      expect(after.map((x) => x.groupId)).toEqual([second.id]);

      await repo().setTargets('assess-2', [{ groupId: 'group-1' }]);
    });

    it('creates, edits partially, and cascades its targets away on delete', async () => {
      const created = await repo().create({
        courseId: 'course-1',
        lessonId: null,
        title: 'Integration-created task',
        description: 'd',
        instructions: 'i',
        type: 'assignment',
        topics: ['Kinetics'],
        availableFrom: '2026-09-01T00:00:00.000Z',
        availableTo: '2026-12-01T00:00:00.000Z',
        dueAt: '2026-09-20T00:00:00.000Z',
        maxScore: 30,
        allowedFileTypes: ['application/pdf'],
        maxFileSizeBytes: 10485760,
        workType: 'file_upload',
        externalUrl: null,
        visibility: 'published',
        markerId: null,
        allowResubmission: true,
        submissionModes: [],
        draftId: null,
        attachments: [],
      });
      await repo().setTargets(created.id, [{ groupId: 'group-1' }]);

      // A partial edit must leave everything it did not name alone - the
      // COALESCE-per-column shape rather than a string-built SET list (§8).
      const edited = await repo().update(created.id, { title: 'Renamed' });
      expect(edited?.title).toBe('Renamed');
      expect(edited?.maxScore).toBe(30);
      expect(edited?.topics).toEqual(['Kinetics']);
      expect(await repo().update('assess-nope', { title: 'x' })).toBeNull();

      expect(await repo().remove(created.id)).toBe(true);
      expect(await repo().findTargets(created.id)).toEqual([]);
      expect(await repo().remove(created.id)).toBe(false);
    });
  });

  /* The unit of work behind CLAUDE.md §5.4.
     
     This is the assertion the gap needed: an audit entry that fails must take
     the action it describes down with it. It can only be made against a real
     database - the memory driver has no journal to unwind, which
     `runInTransaction` says plainly rather than pretending otherwise. */
  describe('blog', () => {
    const repo = () => new PostgresBlogRepository(db);

    it('reads the seeded posts with their galleries attached', async () => {
      const post = await repo().findById('blog-1');
      expect(post?.slug).toBe('igcse-chemistry-results-june-2026');
      expect(post?.title).toContain('34 A*');
      // A real TEXT[] round trip, which the in-memory stub cannot exercise.
      expect(post?.tags).toEqual(['IGCSE', 'Chemistry', 'Results']);
      // The image and the video, in the author's order - the case a single
      // `featured_image_url` column could not have held (CLAUDE.md §5.19).
      expect(post?.media.map((m) => m.kind)).toEqual(['image', 'video']);
      expect(post?.media.map((m) => m.position)).toEqual([0, 1]);
      // BIGINT arrives from `pg` as a string; `numOrNull` is what makes this a
      // number rather than the string '412338'.
      expect(post?.media[0]?.sizeBytes).toBe(412338);
      expect(typeof post?.media[0]?.sizeBytes).toBe('number');
    });

    it('applies the clock predicate in SQL, not in the process', async () => {
      // `blog-2` is 'scheduled' with a 2026 date and `blog-3` with a 2099 one.
      // Nothing flips either row, so this is the whole scheduling mechanism:
      // if the WHERE clause is wrong, one of these assertions fails.
      const slugs = (await repo().findLive(50, 0)).map((p) => p.slug);
      expect(slugs).toContain('igcse-chemistry-results-june-2026');
      expect(slugs).toContain('ielts-speaking-band-8-walkthrough');
      expect(slugs).not.toContain('october-intake-open-evening');

      // And the row still says 'scheduled' - it was never rewritten.
      expect((await repo().findById('blog-2'))?.status).toBe('scheduled');
    });

    it('hides a draft and a future post from the by-slug read too', async () => {
      // The predicate is shared between the two reads deliberately: a by-slug
      // read that forgot it would serve an unpublished post to anyone holding
      // the link, which a list-only test would never catch.
      expect(await repo().findLiveBySlug('october-intake-open-evening')).toBeNull();

      const draft = await repo().create({
        slug: 'a-draft-for-the-integration-suite',
        title: 'Draft',
        excerpt: null,
        body: 'x',
        category: 'article',
        tags: [],
        status: 'draft',
        publishAt: new Date('2020-01-01T00:00:00Z').toISOString(),
        authorId: 'teacher-1',
      });
      expect(await repo().findLiveBySlug(draft.slug)).toBeNull();
      // But the staff read finds it.
      expect((await repo().findById(draft.id))?.status).toBe('draft');
    });

    it('pages the public feed newest first', async () => {
      const firstPage = await repo().findLive(1, 0);
      const secondPage = await repo().findLive(1, 1);
      expect(firstPage).toHaveLength(1);
      expect(secondPage).toHaveLength(1);
      expect(firstPage[0]?.id).not.toBe(secondPage[0]?.id);
      // blog-1 is dated 2026-08-22 and blog-2 2026-09-01, so the later one
      // leads. `blog_posts_live_idx` is what serves this ordering.
      expect(firstPage[0]?.slug).toBe('ielts-speaking-band-8-walkthrough');
    });

    it('refuses a status outside the union', async () => {
      // The CHECK constraint, asserted rather than assumed: a union widened in
      // TypeScript with no migration beside it would otherwise pass every unit
      // test and fail on the first real write.
      await expect(
        db.query(
          `INSERT INTO blog_posts (id, slug, title, body, status, author_id)
           VALUES ('bad-status', 'bad-status', 't', 'b', 'live', 'teacher-1')`,
        ),
      ).rejects.toThrow();
    });

    it('refuses a media kind outside the union', async () => {
      await expect(
        db.query(
          `INSERT INTO blog_post_media (id, post_id, kind, url)
           VALUES ('bad-kind', 'blog-1', 'audio', 'https://cdn.example.com/a.mp3')`,
        ),
      ).rejects.toThrow();
    });

    it('refuses a duplicate slug', async () => {
      // The constraint `uniqueSlug` leans on to settle a race it cannot win by
      // checking first.
      await expect(
        repo().create({
          slug: 'igcse-chemistry-results-june-2026',
          title: 'Same address',
          excerpt: null,
          body: 'x',
          category: 'achievement',
          tags: [],
          status: 'draft',
          publishAt: new Date().toISOString(),
          authorId: 'teacher-1',
        }),
      ).rejects.toThrow();
    });

    it('updates only the columns supplied and always bumps updated_at', async () => {
      const before = await repo().findById('blog-1');
      const after = await repo().update('blog-1', { title: 'A new headline' });

      expect(after?.title).toBe('A new headline');
      // Untouched by a patch that named neither.
      expect(after?.body).toBe(before?.body);
      expect(after?.tags).toEqual(before?.tags);
      expect(Date.parse(after?.updatedAt ?? '')).toBeGreaterThan(
        Date.parse(before?.updatedAt ?? ''),
      );
      // The gallery survives an edit to the post.
      expect(after?.media).toHaveLength(2);
    });

    it('returns the current row for an empty patch rather than failing', async () => {
      // `UPDATE ... SET` with an empty list is a syntax error, so the
      // repository short-circuits. Worth asserting because the alternative is
      // a 500 on a form submitted with nothing changed.
      expect((await repo().update('blog-1', {}))?.id).toBe('blog-1');
    });

    it('returns null when updating or deleting something that is not there', async () => {
      expect(await repo().update('no-such-post', { title: 'x' })).toBeNull();
      expect(await repo().remove('no-such-post')).toBe(false);
      expect(await repo().removeMedia('no-such-media')).toBe(false);
    });

    it('cascades the gallery away with the post, and holds the author in place', async () => {
      const created = await repo().create({
        slug: 'cascade-check',
        title: 'Cascade check',
        excerpt: null,
        body: 'x',
        category: 'achievement',
        tags: ['x'],
        status: 'published',
        publishAt: new Date().toISOString(),
        authorId: 'assistant-1',
      });
      const item = await repo().addMedia({
        postId: created.id,
        kind: 'image',
        url: '/uploads/b3f1c0de-0000-4000-8000-000000000001.png',
        caption: null,
        mimeType: 'image/png',
        sizeBytes: 1234,
        position: 0,
      });

      expect(await repo().remove(created.id)).toBe(true);
      // ON DELETE CASCADE on `post_id`.
      expect(await repo().findMedia(item.id)).toBeNull();

      // The author, by contrast, is RESTRICT by omission: an account that has
      // written posts cannot be deleted out from under them.
      await expect(
        db.query(`DELETE FROM users WHERE id = 'assistant-1'`),
      ).rejects.toThrow();
    });

    it('attaches galleries in one query for a whole page, not one per post', async () => {
      // The N+1 §7.3 still calls worth avoiding. Asserted through behaviour
      // rather than a query count: every post on the page comes back with the
      // media that belongs to it and nothing that does not.
      const page = await repo().findAll(50, 0);
      for (const post of page) {
        for (const item of post.media) {
          expect(item.postId).toBe(post.id);
        }
      }
      expect(page.find((p) => p.id === 'blog-1')?.media).toHaveLength(2);
      // A post with no media gets an empty array, not a missing key, so the
      // response shape never varies on the client.
      expect(page.find((p) => p.id === 'blog-3')?.media).toEqual([]);
    });
  });

  /**
   * Migration 018's post-conditions (unit 6), asserted against the catalog and
   * by the database refusing bad rows - not inferred from a repository read.
   * `D-28` narrowed `visibility` to two values before this file first ran.
   */
  describe('migration 018', () => {
    it('creates task_drafts with the planned columns', async () => {
      const rows = await db.query<{ column_name: string; is_nullable: string; data_type: string }>(
        `SELECT column_name, is_nullable, data_type FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'task_drafts'
          ORDER BY column_name`,
      );
      expect(rows.map((r) => r.column_name)).toEqual([
        'attachments',
        'course_id',
        'created_at',
        'created_by',
        'description',
        'id',
        'instructions',
        'title',
        'type',
        'updated_at',
        'used_count',
        'work_type',
      ]);
      expect(rows.every((r) => r.is_nullable === 'NO')).toBe(true);
      expect(rows.find((r) => r.column_name === 'attachments')?.data_type).toBe('jsonb');
    });

    it('stores created_at/updated_at at millisecond precision (TIMESTAMPTZ(3))', async () => {
      const rows = await db.query<{ column_name: string; datetime_precision: number }>(
        `SELECT column_name, datetime_precision FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'task_drafts'
            AND column_name IN ('created_at', 'updated_at')`,
      );
      expect(rows.map((r) => r.datetime_precision)).toEqual([3, 3]);
    });

    it('indexes task_drafts on (course_id, type)', async () => {
      const row = await db.queryOne<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = current_schema() AND indexname = 'task_drafts_course_id_type_idx'`,
      );
      expect(row?.indexdef).toMatch(/\(course_id, type\)/);
    });

    it('refuses a misspelt visibility, and refuses scheduled because D-28 does not store it', async () => {
      await expect(
        db.query(`UPDATE assessments SET visibility = 'hiden' WHERE id = 'assess-1'`),
      ).rejects.toThrow(/assessments_visibility_check/);
      await expect(
        db.query(`UPDATE assessments SET visibility = 'scheduled' WHERE id = 'assess-1'`),
      ).rejects.toThrow(/assessments_visibility_check/);
    });

    it('refuses an attachments object where an array belongs, on both tables', async () => {
      await expect(
        db.query(`UPDATE assessments SET attachments = '{}'::jsonb WHERE id = 'assess-1'`),
      ).rejects.toThrow(/assessments_attachments_check/);
      await expect(
        db.query(
          `INSERT INTO task_drafts (id, course_id, type, title, attachments, created_by)
           VALUES ('bad-att', 'course-1', 'homework', 'x', '{}'::jsonb, 'teacher-1')`,
        ),
      ).rejects.toThrow(/task_drafts_attachments_check/);
    });

    it('refuses a negative used_count, a blank title and an unknown submission mode', async () => {
      await expect(
        db.query(
          `INSERT INTO task_drafts (id, course_id, type, title, used_count, created_by)
           VALUES ('bad-count', 'course-1', 'homework', 'x', -1, 'teacher-1')`,
        ),
      ).rejects.toThrow(/task_drafts_used_count_check/);
      await expect(
        db.query(
          `INSERT INTO task_drafts (id, course_id, type, title, created_by)
           VALUES ('bad-title', 'course-1', 'homework', '   ', 'teacher-1')`,
        ),
      ).rejects.toThrow(/task_drafts_title_check/);
      await expect(
        db.query(
          `UPDATE assessments SET submission_modes = ARRAY['fax']::text[] WHERE id = 'assess-1'`,
        ),
      ).rejects.toThrow(/assessments_submission_modes_check/);
    });

    it('gives every existing task today’s meaning: published, resubmittable, nothing attached', async () => {
      const row = await db.queryOne<{
        visibility: string;
        allow_resubmission: boolean;
        attachments: unknown;
        submission_modes: string[];
        marker_id: string | null;
        draft_id: string | null;
      }>(
        `SELECT visibility, allow_resubmission, attachments, submission_modes,
                marker_id, draft_id
           FROM assessments WHERE id = 'assess-8'`,
      );
      expect(row).toEqual({
        visibility: 'published',
        allow_resubmission: true,
        attachments: [],
        submission_modes: [],
        marker_id: null,
        draft_id: null,
      });
    });
  });

  describe('task drafts', () => {
    const drafts = () => new PostgresTaskDraftRepository(db);
    const base = {
      courseId: 'course-1',
      type: 'homework' as const,
      workType: 'file_upload' as const,
      title: 'Integration draft',
      description: 'd',
      instructions: 'i',
      attachments: [],
      createdBy: 'teacher-1',
    };

    it('creates a draft and round-trips attachments JSONB', async () => {
      const attachments = [
        { url: '/uploads/passage.pdf', name: 'Passage', mimeType: 'application/pdf', sizeBytes: 1234, audience: 'students' as const },
        { url: 'https://example.com/a.mp3', name: 'Listening', mimeType: null, sizeBytes: null, audience: 'students' as const },
      ];
      const created = await drafts().create({ ...base, attachments });
      expect(created.usedCount).toBe(0);
      expect(created.createdBy).toBe('teacher-1');
      const read = await drafts().findById(created.id);
      expect(read?.attachments).toEqual(attachments);
      await drafts().remove(created.id);
    });

    it('lists by course ids and type, most recently edited first; null courseIds is every course; [] is none', async () => {
      const a = await drafts().create({ ...base, title: 'List A' });
      const b = await drafts().create({ ...base, title: 'List B', type: 'quiz' });
      const c = await drafts().create({ ...base, title: 'List C', courseId: 'course-2' });
      // Touch A so it is the most recently edited.
      await drafts().update(a.id, { description: 'touched' });

      const course1 = await drafts().findMany({ courseIds: ['course-1'] });
      expect(course1.map((d) => d.id)).toEqual([a.id, b.id]);
      expect((await drafts().findMany({ courseIds: ['course-1'], type: 'quiz' })).map((d) => d.id)).toEqual([b.id]);
      const all = await drafts().findMany({ courseIds: null });
      expect(all.map((d) => d.id)).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
      expect(await drafts().findMany({ courseIds: [] })).toEqual([]);
      // A courseId filter intersects the reach rather than widening it.
      expect(await drafts().findMany({ courseIds: ['course-1'], courseId: 'course-2' })).toEqual([]);

      for (const d of [a, b, c]) await drafts().remove(d.id);
    });

    it('a partial update leaves omitted fields alone and advances updated_at', async () => {
      const created = await drafts().create({ ...base, title: 'Partial' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const updated = await drafts().update(created.id, { title: 'Partial, renamed' });
      expect(updated?.title).toBe('Partial, renamed');
      expect(updated?.instructions).toBe('i');
      expect(updated?.type).toBe('homework');
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime(),
      );
      expect(updated?.createdAt).toBe(created.createdAt);
      expect(await drafts().update('nope', { title: 'x' })).toBeNull();
      await drafts().remove(created.id);
    });

    it('incrementUsedCount adds exactly one and returns null for a draft on another course', async () => {
      const created = await drafts().create({ ...base, title: 'Counted' });
      expect((await drafts().incrementUsedCount(created.id, 'course-1'))?.usedCount).toBe(1);
      expect((await drafts().incrementUsedCount(created.id, 'course-1'))?.usedCount).toBe(2);
      expect(await drafts().incrementUsedCount(created.id, 'course-2')).toBeNull();
      expect(await drafts().incrementUsedCount('nope', 'course-1')).toBeNull();
      expect((await drafts().findById(created.id))?.usedCount).toBe(2);
      await drafts().remove(created.id);
    });

    it('remove returns false for a missing draft', async () => {
      expect(await drafts().remove('nope')).toBe(false);
    });

    it('deleting a draft sets assessments.draft_id to NULL and leaves the task intact', async () => {
      const draft = await drafts().create({ ...base, title: 'Provenance' });
      const assessments = new PostgresAssessmentRepository(db);
      const task = await assessments.create({ ...NEW_TASK, draftId: draft.id, title: 'From a draft' });
      expect(task.draftId).toBe(draft.id);

      expect(await drafts().remove(draft.id)).toBe(true);
      const after = await assessments.findById(task.id);
      expect(after?.draftId).toBeNull();
      expect(after?.title).toBe('From a draft');
      await assessments.remove(task.id);
    });
  });

  describe('assessments: unit-6 columns', () => {
    const repo = () => new PostgresAssessmentRepository(db);

    it('create and update round-trip visibility, allow_resubmission, submission_modes, draft_id, attachments and marker_id', async () => {
      const attachments = [
        { url: '/uploads/scheme.pdf', name: 'Mark scheme', mimeType: 'application/pdf', sizeBytes: 99, audience: 'staff' as const },
      ];
      const created = await repo().create({
        ...NEW_TASK,
        visibility: 'hidden',
        markerId: 'assistant-1',
        allowResubmission: false,
        submissionModes: ['pdf_upload', 'photo_upload'],
        attachments,
      });
      expect(created).toMatchObject({
        visibility: 'hidden',
        markerId: 'assistant-1',
        allowResubmission: false,
        submissionModes: ['pdf_upload', 'photo_upload'],
        draftId: null,
        attachments,
      });

      const updated = await repo().update(created.id, {
        visibility: 'published',
        markerId: 'teacher-1',
        allowResubmission: true,
        submissionModes: ['doc_link'],
        attachments: [],
      });
      expect(updated).toMatchObject({
        visibility: 'published',
        markerId: 'teacher-1',
        allowResubmission: true,
        submissionModes: ['doc_link'],
        attachments: [],
      });
      // Omitted fields are left alone.
      const untouched = await repo().update(created.id, { title: 'Renamed only' });
      expect(untouched).toMatchObject({
        visibility: 'published',
        markerId: 'teacher-1',
        submissionModes: ['doc_link'],
      });
      await repo().remove(created.id);
    });

    it('update clears marker_id with the null sentinel and leaves draft_id immutable', async () => {
      const draft = await new PostgresTaskDraftRepository(db).create({
        courseId: 'course-1',
        type: 'homework',
        workType: 'file_upload',
        title: 'Immutable provenance',
        description: '',
        instructions: '',
        attachments: [],
        createdBy: 'teacher-1',
      });
      const created = await repo().create({ ...NEW_TASK, markerId: 'teacher-1', draftId: draft.id });
      const cleared = await repo().update(created.id, { markerId: null });
      expect(cleared?.markerId).toBeNull();
      expect(cleared?.draftId).toBe(draft.id);
      // `draftId` is not on AssessmentUpdate; an untyped caller sending one
      // is ignored by the SQL, which has no draft_id in its SET list.
      const sneaky = await repo().update(created.id, { draftId: null } as never);
      expect(sneaky?.draftId).toBe(draft.id);
      await repo().remove(created.id);
      await new PostgresTaskDraftRepository(db).remove(draft.id);
    });

    it('findByCourseForGroups and findByIdForGroups return the new columns', async () => {
      // Risk 2: these two reads select through their own column list.
      const created = await repo().create({
        ...NEW_TASK,
        visibility: 'hidden',
        markerId: 'teacher-1',
        allowResubmission: false,
        submissionModes: ['photo_upload'],
        attachments: [{ url: '/uploads/a.pdf', name: 'A', mimeType: null, sizeBytes: null, audience: 'students' as const }],
      });
      await repo().setTargets(created.id, [{ groupId: 'group-1' }]);
      const expected = {
        visibility: 'hidden',
        markerId: 'teacher-1',
        allowResubmission: false,
        submissionModes: ['photo_upload'],
        draftId: null,
        attachments: [{ url: '/uploads/a.pdf', name: 'A', mimeType: null, sizeBytes: null, audience: 'students' as const }],
      };
      const listed = (await repo().findByCourseForGroups('course-1', ['group-1'])).find(
        (a) => a.id === created.id,
      );
      expect(listed).toMatchObject(expected);
      expect(await repo().findByIdForGroups(created.id, ['group-1'])).toMatchObject(expected);
      // And the seeded rows carry the defaults, not undefined.
      const seeded = await repo().findByIdForGroups('assess-1', ['group-1']);
      expect(seeded).toMatchObject({
        visibility: 'published',
        markerId: null,
        allowResubmission: true,
        submissionModes: [],
        draftId: null,
        attachments: [],
      });
      await repo().remove(created.id);
    });

    it('findForStaff: null is every task; held groups restrict; [] is none; courseId, groupId and search filter; a literal % in search matches only a literal %', async () => {
      const groups = new PostgresGroupRepository(db);
      const third = await groups.create({
        name: 'findForStaff cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const shared = await repo().create({ ...NEW_TASK, title: 'Shared 100% task' });
      await repo().setTargets(shared.id, [{ groupId: 'group-1' }, { groupId: third.id }]);
      const onlyThird = await repo().create({ ...NEW_TASK, title: 'Only the third 100 task' });
      await repo().setTargets(onlyThird.id, [{ groupId: third.id }]);

      const all = await repo().findForStaff({ groupIds: null });
      expect(all.map((a) => a.id)).toEqual(expect.arrayContaining([shared.id, onlyThird.id, 'assess-1']));
      // Ordered due_at DESC, id - asserted, not assumed.
      const keys = all.map((a) => [new Date(a.dueAt).getTime(), a.id] as const);
      for (let i = 1; i < keys.length; i++) {
        const [pd, pid] = keys[i - 1];
        const [d, id] = keys[i];
        expect(pd > d || (pd === d && pid < id)).toBe(true);
      }

      const held = await repo().findForStaff({ groupIds: ['group-1'] });
      expect(held.map((a) => a.id)).toContain(shared.id);
      expect(held.map((a) => a.id)).not.toContain(onlyThird.id);
      expect(await repo().findForStaff({ groupIds: [] })).toEqual([]);

      expect(await repo().findForStaff({ groupIds: null, courseId: 'course-2' })).toEqual(
        (await repo().findForStaff({ groupIds: null })).filter((a) => a.courseId === 'course-2'),
      );
      expect(
        (await repo().findForStaff({ groupIds: null, groupId: third.id })).map((a) => a.id).sort(),
      ).toEqual([shared.id, onlyThird.id].sort());

      // `%` is a literal: "100%" matches the shared task and not "100 task".
      expect(
        (await repo().findForStaff({ groupIds: null, search: '100%' })).map((a) => a.id),
      ).toEqual([shared.id]);
      // And `_` is a literal, not "any one character".
      expect(await repo().findForStaff({ groupIds: null, search: '100_' })).toEqual([]);
      // Case-insensitive.
      expect(
        (await repo().findForStaff({ groupIds: null, search: 'shared 100' })).map((a) => a.id),
      ).toEqual([shared.id]);

      await repo().remove(shared.id);
      await repo().remove(onlyThird.id);
    });

    it('countSubmissionsByAssessments counts total and ungraded per task, in one query', async () => {
      // Seeds: sub-1 on assess-3 graded; sub-2 on assess-4 ungraded; nothing on assess-2.
      // (Earlier describes may add submissions to assess-1, so it is not asked.)
      const counts = await repo().countSubmissionsByAssessments(['assess-3', 'assess-4', 'assess-2']);
      expect(counts).toEqual({
        'assess-3': { total: 1, ungraded: 0 },
        'assess-4': { total: 1, ungraded: 1 },
      });
      expect(await repo().countSubmissionsByAssessments([])).toEqual({});
    });

    it('findTargetsForAssessments restricts to the given groups', async () => {
      const groups = new PostgresGroupRepository(db);
      const third = await groups.create({
        name: 'findTargets cohort',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const shared = await repo().create({ ...NEW_TASK, title: 'Batch targets' });
      await repo().setTargets(shared.id, [{ groupId: 'group-1' }, { groupId: third.id, dueAt: '2026-10-01T00:00:00.000Z' }]);

      const every = await repo().findTargetsForAssessments([shared.id, 'assess-1'], null);
      expect(every.filter((t) => t.assessmentId === shared.id).map((t) => t.groupId).sort()).toEqual(
        ['group-1', third.id].sort(),
      );
      expect(every.some((t) => t.assessmentId === 'assess-1')).toBe(true);
      expect(every.find((t) => t.groupId === third.id)?.dueAt).toBe('2026-10-01T00:00:00.000Z');

      const held = await repo().findTargetsForAssessments([shared.id], ['group-1']);
      expect(held.map((t) => t.groupId)).toEqual(['group-1']);
      expect(await repo().findTargetsForAssessments([shared.id], [])).toEqual([]);
      expect(await repo().findTargetsForAssessments([], null)).toEqual([]);

      await repo().remove(shared.id);
    });
  });

  describe('runInTransaction', () => {
    it('rolls the action back when the audit write fails', async () => {
      const groups = new PostgresGroupRepository(db);
      const before = (await groups.findAll(100, 0)).length;

      await expect(
        db.runInTransaction(async () => {
          await groups.create({
            name: 'Doomed by its own log',
            teacherId: 'teacher-1',
            courseId: 'course-1',
            assistantId: null,
            meets: null,
            room: null,
          });
          // Stand-in for the audit write failing, and it has to be a real
          // constraint rather than a thrown Error - the point is that the
          // *database* rejects the second half after the first half is already
          // written inside the transaction.
          //
          // A duplicate primary key, because `audit_log.actor_id` deliberately
          // has no foreign key (migration 002: a FK would cascade the evidence
          // away with the account it describes), so there is no referential
          // failure available here.
          const insert = `INSERT INTO audit_log
             (id, actor_id, actor_role, action, target_type, target_id)
             VALUES ($1, $2, $3, $4, $5, $6)`;
          const row = ['tx-dup-1', 'teacher-1', 'teacher', 'group.created', 'group', 'x'];
          await db.query(insert, row);
          await db.query(insert, row);
        }),
      ).rejects.toThrow();

      // The group is gone with it. Before the transaction landed, this count
      // would have been `before + 1`: an action done, and unlogged.
      expect((await groups.findAll(100, 0)).length).toBe(before);
    });

    it('commits both halves together when nothing fails', async () => {
      const groups = new PostgresGroupRepository(db);
      const audit = new PostgresAuditLogRepository(db);

      const created = await db.runInTransaction(async () => {
        const group = await groups.create({
          name: 'Logged properly',
          teacherId: 'teacher-1',
          courseId: 'course-1',
          assistantId: null,
          meets: null,
          room: null,
        });
        await audit.record({
          actorId: 'teacher-1',
          actorRole: Role.Teacher,
          action: 'group.created',
          targetType: 'group',
          targetId: group.id,
          courseId: null,
          before: null,
          after: { name: group.name },
        });
        return group;
      });

      expect(await groups.findById(created.id)).not.toBeNull();
      const page = await audit.find({ limit: 10, targetId: created.id });
      expect(page.entries.map((e) => e.action)).toContain('group.created');
    });

    it('joins an inner transaction to the outer one rather than nesting', async () => {
      // Postgres has no nested transactions: a second BEGIN is a no-op and the
      // inner COMMIT would end the *outer* one early, silently committing half
      // of it. `setTargets` opens its own transaction, so calling it from
      // inside an audited service method exercises exactly this.
      const assessments = new PostgresAssessmentRepository(db);
      const original = await assessments.findTargets('assess-4');

      await expect(
        db.runInTransaction(async () => {
          await assessments.setTargets('assess-4', []);
          throw new Error('fail after the inner transaction');
        }),
      ).rejects.toThrow('fail after the inner transaction');

      // If the inner COMMIT had ended the outer transaction, the cleared
      // targets would have survived the rollback.
      expect(await assessments.findTargets('assess-4')).toHaveLength(
        original.length,
      );
    });
  });

  describe('runInTransaction: authoring from a draft', () => {
    it('a create-from-draft that throws after incrementing leaves used_count unchanged', async () => {
      // Only provable here: the memory driver's runInTransaction has no
      // rollback (CLAUDE.md §9), so the count would creep there.
      const drafts = new PostgresTaskDraftRepository(db);
      const draft = await drafts.create({
        courseId: 'course-1',
        type: 'homework',
        workType: 'file_upload',
        title: 'Rolled back use',
        description: '',
        instructions: '',
        attachments: [],
        createdBy: 'teacher-1',
      });
      await expect(
        db.runInTransaction(async () => {
          await drafts.incrementUsedCount(draft.id, 'course-1');
          // The task insert that follows fails on a real constraint.
          await new PostgresAssessmentRepository(db).create({
            ...NEW_TASK,
            draftId: draft.id,
            visibility: 'scheduled' as never,
          });
        }),
      ).rejects.toThrow(/assessments_visibility_check/);
      expect((await drafts.findById(draft.id))?.usedCount).toBe(0);
      await drafts.remove(draft.id);
    });
  });

  describe('mail_deliveries', () => {
    const repo = () => new PostgresMailDeliveryRepository(db);

    it('records a delivery and returns the stored row', async () => {
      const r = repo();
      const delivery = await db.runInTransaction(() =>
        r.record({
          id: 'mail-1',
          recipient: 'test@example.com',
          template: 'password-reset',
          created_at: new Date('2026-09-21T10:00:00Z'),
        }),
      );
      expect(delivery).toMatchObject({
        id: 'mail-1',
        recipient: 'test@example.com',
        template: 'password-reset',
      });
      expect(delivery.createdAt).toBeTruthy();
    });

    it('uses the index on (recipient, created_at DESC)', async () => {
      const row = await db.queryOne<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname = 'idx_mail_deliveries_recipient_created'`,
      );
      expect(row?.indexdef).toContain('recipient');
      expect(row?.indexdef).toContain('created_at');
    });
  });

  /**
   * `PEOPLE-2`'s staff edit path (unit 5 slice 5b). Same omitted-vs-null
   * contract as the self-service `updateByUserId`, plus the three staff-owned
   * columns that path cannot express.
   */
  describe('student profiles, staff edit', () => {
    const repo = () => new PostgresStudentRepository(db);

    it('writes the staff-owned fields and leaves omitted ones untouched', async () => {
      const updated = await repo().updateByUserIdAsStaff('student-2', {
        schoolName: 'Cairo American College',
        parentEmail: 'parent@example.com',
        staffNotes: 'Needs extra reading practice.',
      });
      expect(updated).toMatchObject({
        name: 'Sara Ahmed',
        schoolName: 'Cairo American College',
        parentEmail: 'parent@example.com',
        staffNotes: 'Needs extra reading practice.',
        enrolledCourseCount: 1,
      });
    });

    it('clears a field on an explicit null only', async () => {
      const cleared = await repo().updateByUserIdAsStaff('student-2', { staffNotes: null });
      expect(cleared?.staffNotes).toBeNull();
      expect(cleared?.schoolName).toBe('Cairo American College');
    });

    it('returns null for a user with no profile', async () => {
      expect(await repo().updateByUserIdAsStaff('no-such-user', { name: 'X' })).toBeNull();
    });
  });

  /**
   * Migration 017 (`AUTH-4` / `PEOPLE-4`, unit 5 slice 5c). Its first run
   * against real Postgres: the table, its CHECKs and FK, the `TEXT[]` round
   * trip, and the single-use rule every mutating method enforces in SQL.
   */
  describe('assistant_invitations', () => {
    const repo = () => new PostgresAssistantInvitationRepository(db);
    const base = {
      name: 'ليلى فهمي',
      email: 'invitee@example.com',
      role: Role.Assistant as const,
      scope: 'assigned_groups' as const,
      groupIds: ['group-1', 'group-2'],
      token: 'tok-1',
      expiresAt: '2026-10-01T10:00:00.000Z',
      invitedBy: 'admin-1',
    };

    it('creates a pending invitation and round-trips every column', async () => {
      const created = await repo().create(base);
      expect(created).toMatchObject({
        name: 'ليلى فهمي',
        email: 'invitee@example.com',
        role: 'assistant',
        scope: 'assigned_groups',
        groupIds: ['group-1', 'group-2'],
        token: 'tok-1',
        expiresAt: '2026-10-01T10:00:00.000Z',
        acceptedAt: null,
        invitedBy: 'admin-1',
      });
      expect(await repo().findById(created.id)).toEqual(created);
      expect(await repo().findByToken('tok-1')).toEqual(created);
      expect((await repo().findPendingByEmail('invitee@example.com'))?.id).toBe(created.id);
    });

    it('defaults group_ids to an empty array, not NULL', async () => {
      await db.query(
        `INSERT INTO assistant_invitations (id, name, email, role, scope, token, expires_at, invited_by)
         VALUES ('inv-default', 'D', 'd@example.com', 'admin', 'all_groups', 'tok-default', now(), 'admin-1')`,
      );
      expect((await repo().findById('inv-default'))?.groupIds).toEqual([]);
      expect(await repo().remove('inv-default')).toBe(true);
    });

    it('lists pending invitations newest first', async () => {
      await db.query(
        `INSERT INTO assistant_invitations (id, name, email, role, scope, token, expires_at, invited_by, created_at)
         VALUES ('inv-old', 'Old', 'old@example.com', 'assistant', 'all_groups', 'tok-old', now(), 'admin-1', '2026-01-01T00:00:00Z')`,
      );
      const pending = await repo().findPending();
      const ids = pending.map((i) => i.id);
      expect(ids).toContain('inv-old');
      expect(ids[ids.length - 1]).toBe('inv-old');
    });

    it('reissues a fresh token and expiry, and edits details, while pending', async () => {
      const inv = (await repo().findByToken('tok-1'))!;
      const reissued = await repo().reissue(inv.id, 'tok-2', '2026-10-08T10:00:00.000Z');
      expect(reissued).toMatchObject({ token: 'tok-2', expiresAt: '2026-10-08T10:00:00.000Z' });
      expect(await repo().findByToken('tok-1')).toBeNull();

      const edited = await repo().updateDetails(inv.id, {
        role: Role.Admin,
        scope: 'all_groups',
        groupIds: [],
      });
      expect(edited).toMatchObject({ role: 'admin', scope: 'all_groups', groupIds: [] });
    });

    it('once accepted, drops out of pending and refuses reissue, edit and cancel', async () => {
      const inv = (await repo().findByToken('tok-2'))!;
      await repo().markAccepted(inv.id);

      const accepted = await repo().findById(inv.id);
      expect(accepted?.acceptedAt).not.toBeNull();
      expect((await repo().findPending()).map((i) => i.id)).not.toContain(inv.id);
      expect(await repo().findPendingByEmail('invitee@example.com')).toBeNull();

      expect(await repo().reissue(inv.id, 'tok-3', '2026-11-01T00:00:00.000Z')).toBeNull();
      expect(
        await repo().updateDetails(inv.id, { role: Role.Assistant, scope: 'all_groups', groupIds: [] }),
      ).toBeNull();
      expect(await repo().remove(inv.id)).toBe(false);
      // The spent token still resolves - the service, not the lookup, refuses it.
      expect((await repo().findByToken('tok-2'))?.acceptedAt).not.toBeNull();
    });

    it('cancels a pending invitation', async () => {
      expect(await repo().remove('inv-old')).toBe(true);
      expect(await repo().findById('inv-old')).toBeNull();
      expect(await repo().remove('inv-old')).toBe(false);
    });

    it('refuses a duplicate token', async () => {
      await repo().create({ ...base, email: 'a@example.com', token: 'tok-dup' });
      await expect(
        repo().create({ ...base, email: 'b@example.com', token: 'tok-dup' }),
      ).rejects.toThrow(/unique/i);
    });

    it('refuses a role or scope outside its CHECK', async () => {
      await expect(
        repo().create({ ...base, token: 'tok-bad-role', role: 'teacher' as unknown as Role.Admin }),
      ).rejects.toThrow(/check constraint/i);
      await expect(
        repo().create({ ...base, token: 'tok-bad-scope', scope: 'everything' as never }),
      ).rejects.toThrow(/check constraint/i);
    });

    it('refuses an unknown inviter, and keeps the inviter from being deleted', async () => {
      await expect(
        repo().create({ ...base, token: 'tok-ghost', invitedBy: 'no-such-user' }),
      ).rejects.toThrow(/foreign key/i);
      // Named, so the test proves it is this table's FK that holds the row -
      // not some other reference to admin-1 elsewhere in the fixtures.
      await expect(db.query(`DELETE FROM users WHERE id = 'admin-1'`)).rejects.toThrow(
        /assistant_invitations_invited_by_fkey/,
      );
    });

    it('has the partial pending-by-email index and the token index', async () => {
      const rows = await db.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = current_schema() AND tablename = 'assistant_invitations'`,
      );
      const byName = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
      expect(byName.assistant_invitations_email_idx).toMatch(/WHERE \(accepted_at IS NULL\)/);
      expect(byName.assistant_invitations_token_idx).toContain('token');
    });
  });
});

/**
 * Migration 013 is the project's one **one-way** migration, and it cannot be
 * tested by running it twice: once `group_courses` is dropped there is nothing
 * left to re-collapse. So the thing worth proving is not that it works on good
 * data - the suite above covers that, since every run applies it from an empty
 * schema - but that it **refuses** on bad data instead of guessing.
 *
 * Both abort paths are exercised, because both are reachable:
 *
 *   (a) a group holding two courses  - `GroupRepository.addCourse` twice;
 *   (b) a group holding zero courses - `GroupRepository.create`, which is the
 *       shape migration 006 was explicitly built to allow.
 *
 * Each runs in its own Postgres **schema** so it cannot disturb the suite
 * above, which owns `public`. Migrations are applied by hand, 001-012 only,
 * then 013 is offered the bad data and must throw. The post-conditions matter
 * as much as the throw: the runner wraps each file in one transaction and
 * writes the ledger only on success (`migration-runner.ts:89-99`), so a refusal
 * must leave `group_courses` intact and `groups.course_id` absent.
 */
describeIfDb('migration 013 refuses rather than guessing', () => {
  const migrationsDir = fileURLToPath(
    new URL('../src/database/migrations', import.meta.url),
  );

  /** 001-012, in order. 013 is applied separately so its failure is the test. */
  const upTo012 = async (client: Pool) => {
    const files = (await readdir(migrationsDir))
      .filter((n) => n.endsWith('.sql') && n < '013')
      .sort();
    for (const name of files) {
      await client.query(await readFile(join(migrationsDir, name), 'utf8'));
    }
  };

  const apply013 = async (client: Pool) =>
    client.query(
      await readFile(
        join(migrationsDir, '013_group_holds_one_course.sql'),
        'utf8',
      ),
    );

  /**
   * A pool pinned to a fresh schema. `search_path` rather than a second
   * database because the migrations name every table unqualified, so this is
   * the whole of the isolation needed.
   */
  const inFreshSchema = async (schema: string) => {
    const admin = new Pool({ connectionString });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const scoped = new Pool({
      connectionString,
      options: `-c search_path=${schema}`,
    });
    await upTo012(scoped);
    return scoped;
  };

  const seedActors = async (client: Pool) => {
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ('t', 't@example.com', 'x', 'Teacher', 'teacher')`,
    );
    await client.query(
      `INSERT INTO courses (id, slug, is_published, title, description, teacher_name)
       VALUES ('c1', 'c-one', true, 'One', 'One', 'Dr. Tahir'),
              ('c2', 'c-two', true, 'Two', 'Two', 'Dr. Tahir')`,
    );
  };

  const drop = async (client: Pool, schema: string) => {
    await client.end();
    const admin = new Pool({ connectionString });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  };

  const columnsOfGroups = async (client: Pool, schema: string) => {
    const res = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'groups'`,
      [schema],
    );
    return res.rows.map((r) => r.column_name);
  };

  const tablesIn = async (client: Pool, schema: string) => {
    const res = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schema],
    );
    return res.rows.map((r) => r.table_name);
  };

  it('aborts on a group holding two courses, naming the group', async () => {
    const schema = 'migtest_013_two_courses';
    const client = await inFreshSchema(schema);
    try {
      await seedActors(client);
      await client.query(
        `INSERT INTO groups (id, name, teacher_id) VALUES ('g1', 'Saturday 18:00', 't')`,
      );
      await client.query(
        `INSERT INTO group_courses (id, group_id, course_id, enrolled_by)
         VALUES ('gc1', 'g1', 'c1', 't'), ('gc2', 'g1', 'c2', 't')`,
      );

      await expect(apply013(client)).rejects.toThrow(
        /A group studies more than one course; collapse it by hand first: Saturday 18:00/,
      );

      // The transaction rolled back whole: the join table is untouched and the
      // column was never added. Anything less leaves the operator with a
      // half-migrated schema and no ledger row saying so.
      expect(await columnsOfGroups(client, schema)).not.toContain('course_id');
      const pairings = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM group_courses',
      );
      expect(pairings.rows[0]!.n).toBe(2);
    } finally {
      await drop(client, schema);
    }
  }, 60_000);

  it('aborts on a group holding no course at all, naming the group', async () => {
    // The second abort path, which `DATABASE_PLAN.md` §4.1 did not name.
    // Without the explicit guard this surfaces as a bare NOT NULL violation
    // that names a column and leaves the operator to find the group.
    const schema = 'migtest_013_no_course';
    const client = await inFreshSchema(schema);
    try {
      await seedActors(client);
      await client.query(
        `INSERT INTO groups (id, name, teacher_id) VALUES ('g1', 'Unassigned cohort', 't')`,
      );

      await expect(apply013(client)).rejects.toThrow(
        /A group studies no course; assign one by hand first: Unassigned cohort/,
      );

      expect(await columnsOfGroups(client, schema)).not.toContain('course_id');
      expect(await tablesIn(client, schema)).toContain('group_courses');
    } finally {
      await drop(client, schema);
    }
  }, 60_000);

  it('collapses cleanly, preserving every group, when the data is sound', async () => {
    // The happy path, asserted only after both refusals. Row counts before and
    // after: a collapse that loses or duplicates a group is the failure mode
    // that cannot be undone.
    const schema = 'migtest_013_happy';
    const client = await inFreshSchema(schema);
    try {
      await seedActors(client);
      await client.query(
        `INSERT INTO groups (id, name, teacher_id)
         VALUES ('g1', 'Saturday', 't'), ('g2', 'Tuesday', 't')`,
      );
      await client.query(
        `INSERT INTO group_courses (id, group_id, course_id, enrolled_by)
         VALUES ('gc1', 'g1', 'c1', 't'), ('gc2', 'g2', 'c2', 't')`,
      );
      const before = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM groups',
      );

      await apply013(client);

      const after = await client.query(
        'SELECT id, course_id FROM groups ORDER BY id',
      );
      expect(after.rowCount).toBe(before.rows[0]!.n);
      expect(after.rows).toEqual([
        { id: 'g1', course_id: 'c1' },
        { id: 'g2', course_id: 'c2' },
      ]);

      // course_id is NOT NULL, the join table is gone, and the index the
      // rewritten assertAssigned will run on exists.
      const nullable = await client.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'groups'
            AND column_name = 'course_id'`,
        [schema],
      );
      expect(nullable.rows[0]!.is_nullable).toBe('NO');
      expect(await tablesIn(client, schema)).not.toContain('group_courses');
      const idx = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = $1 AND tablename = 'groups'`,
        [schema],
      );
      expect(idx.rows.map((r) => r.indexname)).toEqual(
        expect.arrayContaining([
          'groups_course_id_idx',
          'groups_assistant_id_idx',
        ]),
      );
    } finally {
      await drop(client, schema);
    }
  }, 60_000);
});

/**
 * **Migration 015's backfill, exercised rather than believed.**
 *
 * `DROP TABLE course_staff_assignments` is irreversible, and the backfill is
 * the only thing that carries a course-grained grant forward. It is applied
 * here in the side schema `013` established: 001-014 by hand, a course
 * assignment seeded against two groups studying the same course, then 015.
 *
 * What is asserted is what cannot be undone if it is wrong: one row per group
 * on the course, the original `assigned_at` and `assigned_by` preserved, and an
 * assistant who held nothing still ending up with an explicit scope row.
 */
describeIfDb('migration 015 backfills the course grants it drops', () => {
  const migrationsDir = fileURLToPath(
    new URL('../src/database/migrations', import.meta.url),
  );

  const upTo014 = async (client: Pool) => {
    const files = (await readdir(migrationsDir))
      .filter((n) => n.endsWith('.sql') && n < '015')
      .sort();
    for (const name of files) {
      await client.query(await readFile(join(migrationsDir, name), 'utf8'));
    }
  };

  const apply015 = async (client: Pool) =>
    client.query(
      await readFile(join(migrationsDir, '015_assistant_group_scope.sql'), 'utf8'),
    );

  const inFreshSchema = async (schema: string) => {
    const admin = new Pool({ connectionString });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();
    const scoped = new Pool({
      connectionString,
      options: `-c search_path=${schema}`,
    });
    await upTo014(scoped);
    return scoped;
  };

  const drop = async (client: Pool, schema: string) => {
    await client.end();
    const admin = new Pool({ connectionString });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  };

  it('turns one course grant into one grant per group on that course', async () => {
    const schema = 'migtest_015_backfill';
    const client = await inFreshSchema(schema);
    try {
      await client.query(
        `INSERT INTO users (id, email, password_hash, name, role)
         VALUES ('t', 't@example.com', 'x', 'Teacher', 'teacher'),
                ('a1', 'a1@example.com', 'x', 'Held', 'assistant'),
                ('a2', 'a2@example.com', 'x', 'Holds nothing', 'assistant')`,
      );
      await client.query(
        `INSERT INTO courses (id, slug, is_published, title, description, teacher_name)
         VALUES ('c1', 'c-one', true, 'One', 'One', 'Dr. Tahir'),
                ('c2', 'c-two', true, 'Two', 'Two', 'Dr. Tahir')`,
      );
      // Two groups on c1 and one on c2. The grant is on c1, so it must fan out
      // to exactly two rows - and must not touch the c2 group.
      await client.query(
        `INSERT INTO groups (id, name, teacher_id, course_id)
         VALUES ('g1', 'Saturday', 't', 'c1'),
                ('g2', 'Tuesday', 't', 'c1'),
                ('g3', 'Elsewhere', 't', 'c2')`,
      );
      await client.query(
        `INSERT INTO course_staff_assignments (id, user_id, course_id, assigned_at, assigned_by)
         VALUES ('csa1', 'a1', 'c1', '2026-02-01T09:00:00Z', 't')`,
      );

      await apply015(client);

      const grants = await client.query<{
        id: string;
        user_id: string;
        group_id: string;
        assigned_by: string;
        assigned_at: Date;
      }>(
        'SELECT id, user_id, group_id, assigned_by, assigned_at FROM assistant_group_assignments ORDER BY group_id',
      );
      expect(grants.rows.map((r) => r.group_id)).toEqual(['g1', 'g2']);
      expect(grants.rows.map((r) => r.id)).toEqual(['csa1:g1', 'csa1:g2']);
      expect(grants.rows.every((r) => r.user_id === 'a1')).toBe(true);
      // The provenance survives the grain change: who granted it, and when.
      expect(grants.rows.every((r) => r.assigned_by === 't')).toBe(true);
      expect(
        grants.rows.every(
          (r) => r.assigned_at.toISOString() === '2026-02-01T09:00:00.000Z',
        ),
      ).toBe(true);

      // Every assistant, including the one who held nothing, and all of them
      // `assigned_groups`: a migration must never decide someone sees
      // everything (`AUTHORIZATION_MODEL.md` §3).
      const scopes = await client.query<{ user_id: string; scope: string }>(
        'SELECT user_id, scope FROM assistant_scopes ORDER BY user_id',
      );
      expect(scopes.rows).toEqual([
        { user_id: 'a1', scope: 'assigned_groups' },
        { user_id: 'a2', scope: 'assigned_groups' },
      ]);

      const gone = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = 'course_staff_assignments'`,
        [schema],
      );
      expect(gone.rows[0]!.n).toBe(0);
    } finally {
      await drop(client, schema);
    }
  }, 60_000);

  it('creates the tables and the scope rows even with nothing to carry forward', async () => {
    // The ordinary case for a fresh install: no course grants at all. The
    // backfill must be a no-op rather than an error, and every assistant must
    // still come out with an explicit row.
    const schema = 'migtest_015_empty';
    const client = await inFreshSchema(schema);
    try {
      await client.query(
        `INSERT INTO users (id, email, password_hash, name, role)
         VALUES ('a1', 'a1@example.com', 'x', 'Holds nothing', 'assistant')`,
      );

      await apply015(client);

      const scopes = await client.query<{ user_id: string; scope: string }>(
        'SELECT user_id, scope FROM assistant_scopes',
      );
      expect(scopes.rows).toEqual([
        { user_id: 'a1', scope: 'assigned_groups' },
      ]);
      const grants = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM assistant_group_assignments',
      );
      expect(grants.rows[0]!.n).toBe(0);
    } finally {
      await drop(client, schema);
    }
  }, 60_000);
});
