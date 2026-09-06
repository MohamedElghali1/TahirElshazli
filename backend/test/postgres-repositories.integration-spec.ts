import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
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
import { PostgresCourseStaffRepository } from '../src/staff/repositories/postgres-course-staff.repository.js';
import { PostgresAuditLogRepository } from '../src/audit/repositories/postgres-audit-log.repository.js';
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
  });

  describe('enrollments', () => {
    it('carries the learning mode', async () => {
      const repo = new PostgresEnrollmentRepository(db);
      expect((await repo.find('course-1', 'student-1'))?.learningMode).toBe('recorded');
      expect((await repo.find('course-2', 'student-1'))?.learningMode).toBe('live');
      expect(await repo.find('course-2', 'student-2')).toBeNull();
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
  });
  describe('course staff assignments', () => {
    const repo = () => new PostgresCourseStaffRepository(db);

    it('reads the seeded assignment and reports the unassigned course', async () => {
      const assigned = await repo().find('course-1', 'assistant-1');
      expect(assigned?.id).toBe('staff-assignment-1');
      expect(assigned?.assignedBy).toBe('teacher-1');
      expect(assigned?.assignedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // The fixture's whole point: holding one course is not holding another.
      expect(await repo().find('course-2', 'assistant-1')).toBeNull();
      expect(await repo().find('course-1', 'assistant-2')).toBeNull();
    });

    it('lists by staff and by course from the same rows', async () => {
      expect(
        (await repo().findByStaff('assistant-1')).map((a) => a.courseId),
      ).toEqual(['course-1']);
      expect(await repo().findByStaff('assistant-2')).toEqual([]);
      expect(
        (await repo().findByCourse('course-1')).map((a) => a.userId),
      ).toEqual(['assistant-1']);
    });

    it('is idempotent under the unique index rather than under a prior read', async () => {
      // The ON CONFLICT path, which the in-memory stub cannot exercise: it is
      // the database, not a preceding SELECT, that decides the second call
      // creates nothing.
      const first = await repo().create('course-2', 'assistant-2', 'teacher-1');
      expect(first.created).toBe(true);

      const second = await repo().create('course-2', 'assistant-2', 'teacher-1');
      expect(second.created).toBe(false);
      expect(second.assignment.id).toBe(first.assignment.id);

      expect(await repo().remove('course-2', 'assistant-2')).toBe(true);
      expect(await repo().remove('course-2', 'assistant-2')).toBe(false);
    });

    it('cascades an assignment away with its course but not with its grantor', async () => {
      // ON DELETE CASCADE on course_id, RESTRICT on assigned_by. The second
      // half is what stops an admin's departure from silently revoking access.
      await db.query(
        `INSERT INTO courses (id, title, description, teacher_name, sequential_lock_enabled)
         VALUES ('course-temp', 'Temp', 'Temp', 'Dr. Tahir Elshazli', false)`,
      );
      await repo().create('course-temp', 'assistant-2', 'teacher-1');
      await db.query(`DELETE FROM courses WHERE id = 'course-temp'`);
      expect(await repo().find('course-temp', 'assistant-2')).toBeNull();

      await expect(
        db.query(`DELETE FROM users WHERE id = 'teacher-1'`),
      ).rejects.toThrow();
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
        `INSERT INTO courses (id, title, description, teacher_name, sequential_lock_enabled)
         VALUES ('course-gone', 'Gone', 'Gone', 'Dr. Tahir Elshazli', false)`,
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
});
