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
import { PostgresAnnouncementRepository } from '../src/announcements/repositories/postgres-announcement.repository.js';
import { PostgresGroupRepository } from '../src/groups/repositories/postgres-group.repository.js';
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
      // The mode moved to `group_courses` on 2026-09-10 (CLAUDE.md §5.2), and
      // migration 007 dropped the column. Asserting its absence on the shape is
      // what stops it being quietly re-added as a second source of truth.
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
      const before = await repo.findIdsByRole(Role.Assistant);
      expect(before).toContain('assistant-1');
      expect(before).not.toContain('student-1');

      const hire = await repo.create({
        email: 'late.assistant@example.com',
        passwordHash: 'hash',
        name: 'Late Assistant',
        role: Role.Assistant,
      });
      expect(await repo.findIdsByRole(Role.Assistant)).toContain(hire.id);
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
        `INSERT INTO courses (id, slug, title, description, teacher_name, sequential_lock_enabled)
         VALUES ('course-temp', 'course-temp', 'Temp', 'Temp', 'Dr. Tahir Elshazli', false)`,
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

  /* Groups (CLAUDE.md §5.16). The assertions worth making here are the ones an
     in-memory array cannot fail: that the DDL parses, that the two UNIQUE
     constraints really make the writes idempotent rather than the JavaScript
     `find` in front of them doing it, and that `findStudentGroupCourses` - a
     real SQL join, where the memory driver composes two filters - agrees with
     the fixture. */
  describe('groups', () => {
    const repo = () => new PostgresGroupRepository(db);

    it('reads the seeded groups, their courses and their members', async () => {
      expect((await repo().findById('group-1'))?.name).toContain('Saturday');
      // No course_id on the group itself - the shape §5.16 required.
      expect(await repo().findById('group-1')).not.toHaveProperty('courseId');

      const courses = await repo().findCourses('group-1');
      expect(courses.map((c) => c.courseId)).toEqual(['course-1']);
      expect(courses[0]!.learningMode).toBe('recorded');

      const members = await repo().findMembers('group-1');
      expect(members.map((m) => m.studentId).sort()).toEqual([
        'student-1',
        'student-2',
      ]);
    });

    it('joins membership to pairing for one student and one course', async () => {
      // student-1 is in both groups; group-1 studies course-1 and group-2
      // studies course-2, so each query must return exactly its own pairing.
      const one = await repo().findStudentGroupCourses('student-1', 'course-1');
      expect(one.map((gc) => gc.groupId)).toEqual(['group-1']);
      expect(one[0]!.learningMode).toBe('recorded');

      const two = await repo().findStudentGroupCourses('student-1', 'course-2');
      expect(two.map((gc) => gc.groupId)).toEqual(['group-2']);
      expect(two[0]!.learningMode).toBe('live');

      // student-2 is only in group-1, so course-2 is empty for them - the
      // "two groups on one course must not see each other" property, at the
      // level the query decides it rather than the service.
      expect(await repo().findStudentGroupCourses('student-2', 'course-2')).toEqual([]);
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

    it('makes addCourse idempotent and keeps the original learning mode', async () => {
      const first = await repo().addCourse({
        groupId: 'group-1',
        courseId: 'course-2',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
      });
      const second = await repo().addCourse({
        groupId: 'group-1',
        courseId: 'course-2',
        // A re-add must not silently re-mode a group somebody deliberately
        // moved to live.
        learningMode: 'recorded',
        enrolledBy: 'teacher-1',
      });
      expect(second.id).toBe(first.id);
      expect(second.learningMode).toBe('live');

      expect(await repo().removeCourse('group-1', 'course-2')).toBe(true);
      expect(await repo().removeCourse('group-1', 'course-2')).toBe(false);
    });

    it('counts members per group in one query, agreeing with the row path', async () => {
      const ids = ['group-1', 'group-2'];
      const counts = await repo().countMembersByGroups(ids);
      for (const id of ids) {
        expect(counts[id] ?? 0).toBe((await repo().findMembers(id)).length);
      }
      // A group with no members is absent rather than 0; callers default.
      const empty = await repo().create({ name: 'Empty', teacherId: 'teacher-1' });
      expect((await repo().countMembersByGroups([empty.id]))[empty.id]).toBeUndefined();
      expect(await repo().countMembersByGroups([])).toEqual({});
    });

    it('renames, and returns null for a group that is not there', async () => {
      const renamed = await repo().rename('group-2', 'Chemistry — Tuesday 21:00');
      expect(renamed?.name).toBe('Chemistry — Tuesday 21:00');
      expect(await repo().rename('group-nope', 'x')).toBeNull();
      // Put it back: the suite shares one database across describes.
      await repo().rename('group-2', 'IGCSE Chemistry — Tuesday 20:00');
    });

    it('cascades memberships and pairings when a group goes', async () => {
      const doomed = await repo().create({ name: 'Doomed', teacherId: 'teacher-1' });
      await repo().addCourse({
        groupId: doomed.id,
        courseId: 'course-1',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
      });
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
      expect(await repo().findCourses(doomed.id)).toEqual([]);
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
      const empty = await groups().create({ name: 'Empty cohort', teacherId: 'teacher-1' });
      await groups().addCourse({
        groupId: empty.id,
        courseId: 'course-1',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
      });
      expect(await repo().findByCourseForGroups('course-1', [empty.id])).toEqual([]);

      // And no group at all - the unplaced student (§7.2) - answers empty
      // without a round trip.
      expect(await repo().findByCourseForGroups('course-1', [])).toEqual([]);
    });

    it('coalesces a per-group override over the assessment window', async () => {
      const base = (await repo().findById('assess-1'))!;
      const other = await groups().create({ name: 'Override cohort', teacherId: 'teacher-1' });
      await groups().addCourse({
        groupId: other.id,
        courseId: 'course-1',
        learningMode: 'recorded',
        enrolledBy: 'teacher-1',
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
      const second = await groups().create({ name: 'Second cohort', teacherId: 'teacher-1' });
      await groups().addCourse({
        groupId: second.id,
        courseId: 'course-1',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
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
      const second = await groups().create({ name: 'Replace cohort', teacherId: 'teacher-1' });
      await groups().addCourse({
        groupId: second.id,
        courseId: 'course-1',
        learningMode: 'live',
        enrolledBy: 'teacher-1',
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
});
