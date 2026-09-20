import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { RATE_LIMIT_STORE } from './../src/common/rate-limit/rate-limit.interface.js';
import type {
  RateLimitDecision,
  RateLimitStore,
} from './../src/common/rate-limit/rate-limit.interface.js';

/** Four logins in beforeAll exceeds the real 5/min bucket once retries happen. */
const ALWAYS_ALLOW: RateLimitStore = {
  hit: (): RateLimitDecision => ({
    allowed: true,
    remaining: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + 60_000,
  }),
};

/**
 * The TA and admin surface, through the real guards (CLAUDE.md §5.11, §5.4).
 *
 * Its own file, and therefore its own app instance, because these tests assign
 * and unassign: the in-memory repositories hold that state for the life of the
 * process, and sharing an app with `app.e2e-spec.ts` would make the student
 * assertions depend on whether this file ran first.
 *
 * The unit specs override JwtAuthGuard and RolesGuard. This is the only place
 * that proves an unassigned TA is actually stopped over HTTP rather than in a
 * service call the controller might not make.
 */
describe('Staff and admin API (e2e)', () => {
  let app: INestApplication<Server>;
  /** assistant-1: assigned to course-1 only. */
  let assignedTaToken: string;
  /** assistant-2: assigned to nothing. */
  let unassignedTaToken: string;
  /** teacher-1: Dr. Tahir. Unscoped. */
  let adminToken: string;
  /** admin-1: the Full admin (AUTH-1). Unscoped, and a distinct identity. */
  let fullAdminToken: string;
  let studentToken: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMIT_STORE)
      .useValue(ALWAYS_ALLOW)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const login = async (email: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);
      return response.body.accessToken;
    };

    assignedTaToken = await login('assistant@example.com');
    unassignedTaToken = await login('assistant2@example.com');
    adminToken = await login('teacher@example.com');
    fullAdminToken = await login('admin@example.com');
    studentToken = await login('student@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication and role gates', () => {
    it.each([
      '/staff/courses',
      '/staff/overview',
      '/staff/courses/course-1/roster',
      '/staff/courses/course-1/submissions',
      '/staff/courses/course-1/recordings',
      '/staff/courses/course-1/live-sessions',
      '/staff/courses/course-1/announcements',
      '/admin/courses/course-1/staff',
      '/admin/students',
      '/admin/assistants',
      '/admin/announcements',
      '/admin/audit-log',
    ])('requires a token for %s', async (route) => {
      await request(app.getHttpServer()).get(route).expect(401);
    });

    it.each([
      '/staff/courses',
      '/staff/overview',
      '/staff/courses/course-1/roster',
      '/staff/courses/course-1/submissions',
      '/staff/courses/course-1/live-sessions',
      '/staff/courses/course-1/announcements',
      '/admin/courses/course-1/staff',
      '/admin/students',
      '/admin/announcements',
      '/admin/audit-log',
    ])('refuses a student token on %s', async (route) => {
      // A student authenticates fine; the role check is what stops them.
      await request(app.getHttpServer())
        .get(route)
        .set(bearer(studentToken))
        .expect(403);
    });

    it.each([
      '/admin/courses/course-1/staff',
      '/admin/students',
      '/admin/assistants',
      '/admin/announcements',
      '/admin/audit-log',
    ])(
      'refuses a TA token on the admin route %s',
      async (route) => {
        await request(app.getHttpServer())
          .get(route)
          .set(bearer(assignedTaToken))
          .expect(403);
      },
    );

    it('refuses a TA the admin write routes, not just the reads', async () => {
      // The reads leak; the writes grant. Both are checked because a @Roles
      // that covers only the GET is a plausible mistake.
      await request(app.getHttpServer())
        .post('/admin/courses/course-2/staff')
        .set(bearer(assignedTaToken))
        .send({ userId: 'assistant-1' })
        .expect(403);
      await request(app.getHttpServer())
        .delete('/admin/courses/course-1/staff/assistant-1')
        .set(bearer(assignedTaToken))
        .expect(403);
    });

    it('refuses a TA the recording writes, even on a course they hold', async () => {
      // assistant-1 IS assigned to course-1, so scoping alone would let this
      // through. What stops it is the role: CLAUDE.md 2.2 grants a TA
      // materials, never recordings. A 403 rather than a 404 is right here -
      // the course is theirs, the action is not.
      await request(app.getHttpServer())
        .post('/admin/courses/course-1/recordings')
        .set(bearer(assignedTaToken))
        .send({
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Should not exist',
          videoUrl: 'https://video.example.com/nope',
          durationSeconds: 600,
        })
        .expect(403);
      await request(app.getHttpServer())
        .patch('/admin/recordings/rec-1')
        .set(bearer(assignedTaToken))
        .send({ title: 'Renamed by a TA' })
        .expect(403);
      await request(app.getHttpServer())
        .delete('/admin/recordings/rec-1')
        .set(bearer(assignedTaToken))
        .expect(403);
    });
  });

  describe('the management surface is scoped over HTTP, not just in a service', () => {
    it('gives an assigned TA the roster, the queue and the library', async () => {
      const roster = await request(app.getHttpServer())
        .get('/staff/courses/course-1/roster')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(roster.body.entries.length).toBeGreaterThan(0);

      const queue = await request(app.getHttpServer())
        .get('/staff/courses/course-1/submissions')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(queue.body.items.length).toBeGreaterThan(0);

      const library = await request(app.getHttpServer())
        .get('/staff/courses/course-1/recordings')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(library.body.length).toBeGreaterThan(0);
    });

    it.each([
      '/staff/courses/course-2/roster',
      '/staff/courses/course-2/submissions',
      '/staff/courses/course-2/recordings',
      '/staff/courses/course-2/outline',
    ])('404s %s for a TA who does not hold that course', async (route) => {
      // 404 and not 403, so an unassigned TA cannot enumerate the catalog one
      // course id at a time (CLAUDE.md 5.11).
      await request(app.getHttpServer())
        .get(route)
        .set(bearer(assignedTaToken))
        .expect(404);
    });

    it('scopes the overview and leaves the admin unscoped', async () => {
      const ta = await request(app.getHttpServer())
        .get('/staff/overview')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(ta.body.scope).toBe('assigned');
      expect(ta.body.courses.map((c: { id: string }) => c.id)).toEqual(['course-1']);

      const admin = await request(app.getHttpServer())
        .get('/staff/overview')
        .set(bearer(adminToken))
        .expect(200);
      expect(admin.body.scope).toBe('platform');
      expect(admin.body.courses.length).toBeGreaterThan(1);
    });

    it('refuses a grade outside the TA scope, and does not write it', async () => {
      await request(app.getHttpServer())
        .post('/staff/submissions/sub-2/grade')
        .set(bearer(unassignedTaToken))
        .send({ score: 10 })
        .expect(404);

      const after = await request(app.getHttpServer())
        .get('/staff/courses/course-1/submissions')
        .set(bearer(adminToken))
        .expect(200);
      const target = after.body.items.find(
        (i: { submissionId: string }) => i.submissionId === 'sub-2',
      );
      expect(target.score).toBeNull();
    });

    it('rejects a score above the assessment maximum at the API boundary', async () => {
      await request(app.getHttpServer())
        .post('/staff/submissions/sub-2/grade')
        .set(bearer(assignedTaToken))
        .send({ score: 999 })
        .expect(400);
    });

    it('lets an assigned TA grade, and records it against them in the log', async () => {
      const graded = await request(app.getHttpServer())
        .post('/staff/submissions/sub-2/grade')
        .set(bearer(assignedTaToken))
        .send({ score: 16, feedback: 'Solid.' })
        .expect(200);
      expect(graded.body).toMatchObject({ score: 16, status: 'graded' });

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=submission.graded')
        .set(bearer(adminToken))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'assistant-1',
        actorRole: 'assistant',
        targetId: 'sub-2',
      });
    });

    it('lets the teacher publish a recording that students then see', async () => {
      const created = await request(app.getHttpServer())
        .post('/admin/courses/course-1/recordings')
        .set(bearer(adminToken))
        .send({
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Uploaded over HTTP',
          videoUrl: 'https://video.example.com/e2e',
          durationSeconds: 1200,
          topics: ['Atomic Structure'],
        })
        .expect(201);
      expect(created.body.id).toBeDefined();

      // The student surface reads the same table. That is the entire point of
      // the upload, so it is asserted rather than assumed.
      const studentView = await request(app.getHttpServer())
        .get('/courses/course-1/recordings')
        .set(bearer(studentToken))
        .expect(200);
      const found = studentView.body.recordings.find(
        (r: { id: string }) => r.id === created.body.id,
      );
      expect(found).toMatchObject({ title: 'Uploaded over HTTP', watchedSeconds: 0 });
    });

    it('rejects a recording whose video URL is not a URL', async () => {
      await request(app.getHttpServer())
        .post('/admin/courses/course-1/recordings')
        .set(bearer(adminToken))
        .send({
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Bad link',
          videoUrl: 'javascript:alert(1)',
          durationSeconds: 600,
        })
        .expect(400);
    });
  });

  describe('live-session scheduling is teacher-only over HTTP', () => {
    /** A week out, so it lands in the student's "upcoming" list whenever this runs. */
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let scheduledId: string;

    it('refuses a TA the scheduling writes, even on a course they hold', async () => {
      // assistant-1 IS assigned to course-1, so scoping alone would let this
      // through. What stops it is the role: CLAUDE.md 2.2's preset does not
      // grant a TA session scheduling, and 11 records CRS-11 as unresolved.
      // A 403 rather than a 404 is right - the course is theirs, the action
      // is not.
      await request(app.getHttpServer())
        .post('/admin/courses/course-1/live-sessions')
        .set(bearer(assignedTaToken))
        .send({
          title: 'Should not exist',
          zoomLink: 'https://zoom.us/j/1',
          scheduledAt: soon,
          durationMinutes: 60,
        })
        .expect(403);
      await request(app.getHttpServer())
        .patch('/admin/live-sessions/sess-1')
        .set(bearer(assignedTaToken))
        .send({ title: 'Renamed by a TA' })
        .expect(403);
      await request(app.getHttpServer())
        .delete('/admin/live-sessions/sess-1')
        .set(bearer(assignedTaToken))
        .expect(403);
    });

    it('lets the teacher schedule a session the student then sees', async () => {
      const created = await request(app.getHttpServer())
        .post('/admin/courses/course-1/live-sessions')
        .set(bearer(adminToken))
        .send({
          title: 'Scheduled over HTTP',
          zoomLink: 'https://zoom.us/j/99988877766',
          scheduledAt: soon,
          durationMinutes: 75,
        })
        .expect(201);
      scheduledId = created.body.id;
      expect(scheduledId).toBeDefined();

      // The student surface reads the same table. That is the entire point of
      // scheduling, so it is asserted rather than assumed.
      const studentView = await request(app.getHttpServer())
        .get('/courses/course-1/live-sessions')
        .set(bearer(studentToken))
        .expect(200);
      expect(
        studentView.body.upcoming.find((s: { id: string }) => s.id === scheduledId),
      ).toMatchObject({ title: 'Scheduled over HTTP', durationMinutes: 75 });
    });

    it('shows it to the assigned TA read-only, and 404s another course', async () => {
      const mine = await request(app.getHttpServer())
        .get('/staff/courses/course-1/live-sessions')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(mine.body.map((s: { id: string }) => s.id)).toContain(scheduledId);

      await request(app.getHttpServer())
        .get('/staff/courses/course-2/live-sessions')
        .set(bearer(assignedTaToken))
        .expect(404);
    });

    it.each([
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a loopback host', 'http://127.0.0.1:8080/j/1'],
      ['the cloud metadata endpoint', 'http://169.254.169.254/latest/meta-data'],
    ])('rejects %s as a Zoom link', async (_label, zoomLink) => {
      await request(app.getHttpServer())
        .post('/admin/courses/course-1/live-sessions')
        .set(bearer(adminToken))
        .send({ title: 'Bad link', zoomLink, scheduledAt: soon, durationMinutes: 60 })
        .expect(400);
    });

    it('edits and cancels, logging both against the teacher', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/live-sessions/${scheduledId}`)
        .set(bearer(adminToken))
        .send({ title: 'Moved an hour later' })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/admin/live-sessions/${scheduledId}`)
        .set(bearer(adminToken))
        .expect(200);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?targetType=live_session')
        .set(bearer(adminToken))
        .expect(200);
      const actions = log.body.entries.map((e: { action: string }) => e.action);
      expect(actions).toContain('live_session.scheduled');
      expect(actions).toContain('live_session.updated');
      expect(actions).toContain('live_session.cancelled');

      const edited = log.body.entries.find(
        (e: { action: string }) => e.action === 'live_session.updated',
      );
      expect(edited.before.title).toBe('Scheduled over HTTP');
      expect(edited.after.title).toBe('Moved an hour later');
    });

    it('404s an edit of a session that is not there', async () => {
      await request(app.getHttpServer())
        .patch('/admin/live-sessions/sess-nope')
        .set(bearer(adminToken))
        .send({ title: 'x' })
        .expect(404);
    });
  });

  describe('announcements', () => {
    const message = { title: 'Sunday session moved', body: 'It now starts at 19:00.' };

    it('lets an assigned TA post to their own course (CLAUDE.md 2.2)', async () => {
      const posted = await request(app.getHttpServer())
        .post('/staff/courses/course-1/announcements')
        .set(bearer(assignedTaToken))
        .send(message)
        .expect(201);
      expect(posted.body).toMatchObject({
        audience: 'course:course-1',
        courseId: 'course-1',
        postedBy: 'assistant-1',
        // course-1 holds student-1 and student-2.
        recipientCount: 2,
      });
    });

    it('404s a course the TA does not hold, and writes nothing', async () => {
      await request(app.getHttpServer())
        .post('/staff/courses/course-2/announcements')
        .set(bearer(assignedTaToken))
        .send(message)
        .expect(404);

      const courseTwo = await request(app.getHttpServer())
        .get('/staff/courses/course-2/announcements')
        .set(bearer(adminToken))
        .expect(200);
      expect(courseTwo.body).toEqual([]);
    });

    it('refuses a TA the platform-wide audiences entirely', async () => {
      // `all_students` and `all_tas` are reachable only through /admin, which
      // RolesGuard closes to a TA. There is no field on the /staff body that
      // could name one.
      for (const audience of ['all_students', 'all_tas']) {
        await request(app.getHttpServer())
          .post('/admin/announcements')
          .set(bearer(assignedTaToken))
          .send({ ...message, audience })
          .expect(403);
      }
    });

    it('ignores an audience a TA smuggles into the course route', async () => {
      const posted = await request(app.getHttpServer())
        .post('/staff/courses/course-1/announcements')
        .set(bearer(assignedTaToken))
        .send({ ...message, audience: 'all_students' })
        .expect(201);
      // Whitelisted away by the global pipe, and the audience comes from the
      // URL regardless.
      expect(posted.body.audience).toBe('course:course-1');
    });

    it('delivers to the enrolled students, who read it in their own feed', async () => {
      const feed = await request(app.getHttpServer())
        .get('/notifications')
        .set(bearer(studentToken))
        .expect(200);
      const announcements = feed.body.notifications.filter(
        (n: { type: string }) => n.type === 'announcement',
      );
      expect(announcements.length).toBeGreaterThan(0);
      expect(announcements[0]).toMatchObject({
        title: 'Sunday session moved',
        message: 'It now starts at 19:00.',
        link: '/learn/course-1',
        read: false,
      });
    });

    it('lets the teacher address every assistant, who can now read it', async () => {
      const posted = await request(app.getHttpServer())
        .post('/admin/announcements')
        .set(bearer(adminToken))
        .send({ audience: 'all_tas', title: 'Marking deadline', body: 'Friday, please.' })
        .expect(201);
      // Resolved from the role at send time (CLAUDE.md 5.14): assistant-1,
      // assistant-2 - and admin-1. Was 2 before `Role.Admin` existed. `all_tas`
      // is the staff broadcast channel and there is no other route to staff, so
      // it includes the Full admin (unit-1 ruling 3, D-a): a missed recipient is
      // silent where a redundant one is merely redundant.
      expect(posted.body).toMatchObject({ audience: 'all_tas', recipientCount: 3 });

      // The reason /notifications is no longer student-only: an announcement
      // addressed to the assistants must land somewhere they can open.
      const taFeed = await request(app.getHttpServer())
        .get('/notifications')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(taFeed.body.notifications).toHaveLength(1);
      expect(taFeed.body.notifications[0]).toMatchObject({
        title: 'Marking deadline',
        // No page shows a platform-wide announcement, so null beats a link
        // that 404s.
        link: null,
      });
    });

    it('never lets one recipient touch another’s copy', async () => {
      const taFeed = await request(app.getHttpServer())
        .get('/notifications')
        .set(bearer(assignedTaToken))
        .expect(200);
      const mine = taFeed.body.notifications[0].id;

      // Widening the role gate did not widen what anyone may read: every
      // handler is scoped by the caller's own id.
      await request(app.getHttpServer())
        .post(`/notifications/${mine}/read`)
        .set(bearer(studentToken))
        .expect(404);
    });

    it('rejects a malformed audience rather than guessing', async () => {
      for (const audience of ['course:', 'everyone', 'course:bad id']) {
        await request(app.getHttpServer())
          .post('/admin/announcements')
          .set(bearer(adminToken))
          .send({ ...message, audience })
          .expect(400);
      }
    });

    it('rejects an empty title or body at the API boundary', async () => {
      await request(app.getHttpServer())
        .post('/staff/courses/course-1/announcements')
        .set(bearer(adminToken))
        .send({ title: '', body: 'x' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/staff/courses/course-1/announcements')
        .set(bearer(adminToken))
        .send({ title: 'x', body: 'y'.repeat(2001) })
        .expect(400);

      // The admin DTO extends the course one, so the title and body rules must
      // still apply there - inherited validation metadata is easy to assume
      // and easy to lose.
      await request(app.getHttpServer())
        .post('/admin/announcements')
        .set(bearer(adminToken))
        .send({ audience: 'all_tas', title: '', body: 'x' })
        .expect(400);
    });

    it('records who posted what, and to how many (CLAUDE.md 5.4)', async () => {
      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=announcement.posted&actorId=assistant-1')
        .set(bearer(adminToken))
        .expect(200);
      expect(log.body.entries.length).toBeGreaterThan(0);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'assistant-1',
        actorRole: 'assistant',
        targetType: 'announcement',
        courseId: 'course-1',
      });
      expect(log.body.entries[0].after).toMatchObject({
        audience: 'course:course-1',
        recipientCount: 2,
      });
    });

    it('shows the admin every audience and the TA only their own course', async () => {
      const all = await request(app.getHttpServer())
        .get('/admin/announcements')
        .set(bearer(adminToken))
        .expect(200);
      expect(all.body.map((a: { audience: string }) => a.audience)).toContain(
        'all_tas',
      );

      const scoped = await request(app.getHttpServer())
        .get('/staff/courses/course-1/announcements')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(
        scoped.body.every((a: { courseId: string }) => a.courseId === 'course-1'),
      ).toBe(true);
      expect(scoped.body.length).toBeLessThan(all.body.length);
    });
  });

  describe('GET /staff/courses is scoped for a TA and not for an admin', () => {
    it('gives an assigned TA only their own courses', async () => {
      const response = await request(app.getHttpServer())
        .get('/staff/courses')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(response.body.map((course: { id: string }) => course.id)).toEqual([
        'course-1',
      ]);
    });

    it('gives an unassigned TA nothing at all', async () => {
      const response = await request(app.getHttpServer())
        .get('/staff/courses')
        .set(bearer(unassignedTaToken))
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('gives an admin every course through the same route', async () => {
      const response = await request(app.getHttpServer())
        .get('/staff/courses')
        .set(bearer(adminToken))
        .expect(200);
      const ids = response.body.map((course: { id: string }) => course.id);
      expect(ids).toContain('course-1');
      // The course the assigned TA above could not see.
      expect(ids).toContain('course-2');
    });
  });

  describe('assignment is admin-only, audited, and immediately effective', () => {
    it('rejects a malformed userId at the API boundary', async () => {
      await request(app.getHttpServer())
        .post('/admin/courses/course-2/staff')
        .set(bearer(adminToken))
        .send({ userId: 'not a valid id!' })
        .expect(400);
    });

    it('refuses to assign an account that is not an assistant', async () => {
      await request(app.getHttpServer())
        .post('/admin/courses/course-2/staff')
        .set(bearer(adminToken))
        .send({ userId: 'student-1' })
        .expect(400);
    });

    it('assigns, widens the TA scope, and writes an audit entry', async () => {
      const before = await request(app.getHttpServer())
        .get('/staff/courses')
        .set(bearer(unassignedTaToken))
        .expect(200);
      expect(before.body).toEqual([]);

      await request(app.getHttpServer())
        .post('/admin/courses/course-2/staff')
        .set(bearer(adminToken))
        .send({ userId: 'assistant-2' })
        .expect(201);

      // Exactly the course they were granted, and no other.
      const after = await request(app.getHttpServer())
        .get('/staff/courses')
        .set(bearer(unassignedTaToken))
        .expect(200);
      expect(after.body.map((course: { id: string }) => course.id)).toEqual([
        'course-2',
      ]);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=course_staff.assigned')
        .set(bearer(adminToken))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'teacher-1',
        actorRole: 'teacher',
        action: 'course_staff.assigned',
        courseId: 'course-2',
      });
    });

    it('refuses a duplicate assignment', async () => {
      await request(app.getHttpServer())
        .post('/admin/courses/course-2/staff')
        .set(bearer(adminToken))
        .send({ userId: 'assistant-2' })
        .expect(409);
    });

    it('unassigns, narrows the scope again, and logs the removal', async () => {
      await request(app.getHttpServer())
        .delete('/admin/courses/course-2/staff/assistant-2')
        .set(bearer(adminToken))
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/staff/courses')
        .set(bearer(unassignedTaToken))
        .expect(200);
      expect(after.body).toEqual([]);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=course_staff.unassigned')
        .set(bearer(adminToken))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'teacher-1',
        action: 'course_staff.unassigned',
        courseId: 'course-2',
      });
      expect(log.body.entries[0].before).toMatchObject({
        userId: 'assistant-2',
      });
    });

    it('404s an unassignment that was never there', async () => {
      await request(app.getHttpServer())
        .delete('/admin/courses/course-2/staff/assistant-2')
        .set(bearer(adminToken))
        .expect(404);
    });
  });

  describe('the audit log answers "which assistant did what"', () => {
    it('filters by actor', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/audit-log?actorId=teacher-1')
        .set(bearer(adminToken))
        .expect(200);
      expect(response.body.entries.length).toBeGreaterThan(0);
      for (const entry of response.body.entries) {
        expect(entry.actorId).toBe('teacher-1');
      }
    });

    it('returns nothing for an actor who has done nothing', async () => {
      // assistant-2, not assistant-1: assistant-1 grades earlier in this file,
      // so they are no longer an actor with an empty history. assistant-2 is
      // only ever the *target* of an assignment - the actor on those entries
      // is the admin who made them - which is exactly the distinction this
      // test needs to keep proving.
      const response = await request(app.getHttpServer())
        .get('/admin/audit-log?actorId=assistant-2')
        .set(bearer(adminToken))
        .expect(200);
      expect(response.body.entries).toEqual([]);
    });

    it('shows what an assistant actually did (CLAUDE.md §5.4)', async () => {
      // The requirement in one request: "which assistant did what".
      const response = await request(app.getHttpServer())
        .get('/admin/audit-log?actorId=assistant-1')
        .set(bearer(adminToken))
        .expect(200);
      expect(response.body.entries.length).toBeGreaterThan(0);
      expect(
        response.body.entries.every(
          (e: { actorId: string; actorRole: string }) =>
            e.actorId === 'assistant-1' && e.actorRole === 'assistant',
        ),
      ).toBe(true);
      expect(
        response.body.entries.some(
          (e: { action: string }) => e.action === 'submission.graded',
        ),
      ).toBe(true);
    });

    it('rejects an unknown action filter rather than ignoring it', async () => {
      // A silently ignored filter returns more than the caller asked for,
      // which on an audit screen reads as history that did not happen.
      await request(app.getHttpServer())
        .get('/admin/audit-log?action=nonsense')
        .set(bearer(adminToken))
        .expect(400);
    });
  });

  describe('groups: placement is a TA power, group CRUD is not (§2.2, §5.16)', () => {
    let groupId: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: 'E2E — Wednesday 17:00' })
        .expect(201);
      groupId = created.body.id;
    });

    it('refuses group creation to a TA over HTTP', async () => {
      // The class-level @Roles(Role.Teacher) on AdminGroupsController, proved
      // through the wire rather than by reading the decorator.
      await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(assignedTaToken))
        .send({ name: 'TA should not be able to create this' })
        .expect(403);
    });

    it('refuses attaching a course to a group to a TA', async () => {
      await request(app.getHttpServer())
        .post(`/admin/groups/${groupId}/courses`)
        .set(bearer(assignedTaToken))
        .send({ courseId: 'course-1' })
        .expect(403);
    });

    it('lets a TA place a student, and no longer lets them remove one', async () => {
      // **Narrowed by AUTH-3.** The removal was a 204 for an assistant when
      // this test was written; `AUTHORIZATION_MODEL.md` §3 withholds it, so it
      // is now a 403 and the teacher does the removal. The placement half is
      // unchanged, and that is the point of keeping both in one test: "add
      // stays, remove moves" is two assertions, and the pair is the requirement.
      await request(app.getHttpServer())
        .post(`/staff/groups/${groupId}/members`)
        .set(bearer(assignedTaToken))
        .send({ studentId: 'student-2' })
        .expect(201);

      const members = await request(app.getHttpServer())
        .get(`/staff/groups/${groupId}/members`)
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(
        members.body.map((m: { studentId: string }) => m.studentId),
      ).toContain('student-2');

      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-2`)
        .set(bearer(assignedTaToken))
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-2`)
        .set(bearer(adminToken))
        .expect(204);
    });

    it('refuses the whole group surface to a student token', async () => {
      await request(app.getHttpServer())
        .get(`/staff/groups/${groupId}`)
        .set(bearer(studentToken))
        .expect(403);
      await request(app.getHttpServer())
        .post(`/staff/groups/${groupId}/members`)
        .set(bearer(studentToken))
        .send({ studentId: 'student-1' })
        .expect(403);
    });

    it('scopes the course tab and 404s a course the TA does not hold', async () => {
      await request(app.getHttpServer())
        .get('/staff/courses/course-1/groups')
        .set(bearer(assignedTaToken))
        .expect(200);
      // assistant-2 holds nothing; a 404 rather than a 403 so an unassigned TA
      // cannot enumerate the catalog one id at a time (§5.11).
      await request(app.getHttpServer())
        .get('/staff/courses/course-1/groups')
        .set(bearer(unassignedTaToken))
        .expect(404);
    });

    it('validates the body at the API boundary', async () => {
      await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: '' })
        .expect(400);
      // `whitelist: true` strips an undeclared field rather than rejecting it,
      // so the rejected case has to be a DECLARED field with a bad value.
      await request(app.getHttpServer())
        .post(`/admin/groups/${groupId}/courses`)
        .set(bearer(adminToken))
        .send({ courseId: 'course 1; drop table' })
        .expect(400);
    });

    it('records the placement in the audit log with the TA as actor', async () => {
      await request(app.getHttpServer())
        .post(`/staff/groups/${groupId}/members`)
        .set(bearer(assignedTaToken))
        .send({ studentId: 'student-1' })
        .expect(201);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=group.student_assigned')
        .set(bearer(adminToken))
        .expect(200);
      expect(
        log.body.entries.some(
          (e: { actorId: string; actorRole: string }) =>
            e.actorId === 'assistant-1' && e.actorRole === 'assistant',
        ),
      ).toBe(true);
    });
  });

  describe('authoring: a TA may create both assignments and quizzes (§5.18)', () => {
    const task = {
      title: 'E2E kinetics set',
      description: 'Rates and orders',
      instructions: 'Upload a single PDF.',
      type: 'assignment',
      topics: ['Kinetics'],
      availableFrom: '2026-09-01T00:00:00.000Z',
      availableTo: '2026-12-01T23:59:59.000Z',
      dueAt: '2026-09-20T23:59:59.000Z',
      maxScore: 30,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 10485760,
      targets: [{ groupId: 'group-1' }],
    };

    it('lets an assigned TA create one over HTTP', async () => {
      const created = await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(assignedTaToken))
        .send(task)
        .expect(201);
      expect(created.body.targets.map((t: { groupId: string }) => t.groupId)).toEqual([
        'group-1',
      ]);

      // It appears for the student, which is what §5.18 actually asks for.
      const studentList = await request(app.getHttpServer())
        .get('/courses/course-1/assessments')
        .set(bearer(studentToken))
        .expect(200);
      expect(studentList.body.map((a: { id: string }) => a.id)).toContain(
        created.body.id,
      );

      await request(app.getHttpServer())
        .delete(`/staff/assessments/${created.body.id}`)
        .set(bearer(assignedTaToken))
        .expect(204);
    });

    it('404s a course the TA does not hold', async () => {
      await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(unassignedTaToken))
        .send(task)
        .expect(404);
    });

    it('refuses the whole authoring surface to a student token', async () => {
      await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(studentToken))
        .send(task)
        .expect(403);
    });

    it('validates the body at the API boundary', async () => {
      // No targets - a task set for nobody is invisible to everyone, and the
      // teacher should learn that on the form rather than on the due date.
      await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, targets: [] })
        .expect(400);

      // An inverted window would make the task permanently locked (§5.10).
      await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, availableFrom: task.availableTo, availableTo: task.availableFrom })
        .expect(400);

      await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, type: 'essay' })
        .expect(400);
    });

    it('refuses to delete a task that has submissions', async () => {
      // assess-3 carries a graded submission.
      await request(app.getHttpServer())
        .delete('/staff/assessments/assess-3')
        .set(bearer(adminToken))
        .expect(400);
    });

    it('records the authoring in the audit log with the TA as actor', async () => {
      const created = await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(assignedTaToken))
        .send({ ...task, title: 'E2E audited task' })
        .expect(201);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=assessment.created')
        .set(bearer(adminToken))
        .expect(200);
      expect(
        log.body.entries.some(
          (e: { actorId: string; actorRole: string; targetId: string }) =>
            e.targetId === created.body.id &&
            e.actorId === 'assistant-1' &&
            e.actorRole === 'assistant',
        ),
      ).toBe(true);

      await request(app.getHttpServer())
        .delete(`/staff/assessments/${created.body.id}`)
        .set(bearer(adminToken))
        .expect(204);
    });
  });

  /**
   * `AUTH-1`: the Full admin is the teacher's permission under a distinct
   * identity. Both halves are asserted here - the reach, and the attribution -
   * because they fail independently and in opposite directions.
   *
   * Reach: `staff-scope.service.ts`'s `isAdmin` is the single line that decides
   * whether an admin can do anything at all. Missed, they pass `RolesGuard`,
   * find no `course_staff_assignments` row and 404 on every course.
   *
   * Attribution: twelve `actorRole` ternaries used to collapse the role to a
   * binary. Nothing errors when they are wrong - migration 011 widens the CHECK,
   * so the database accepts the lie - and the audit log has no UPDATE and no
   * DELETE, so an entry written wrong is wrong permanently.
   */
  describe('AUTH-1: the full admin is the teacher, under her own identity', () => {
    /**
     * Every `/admin/*` route, with a request shape whose status is **stable
     * under repetition**, so "the teacher and the admin get the same status" is
     * a real assertion rather than an artefact of which token went first.
     *
     * Mutating routes therefore address a nonexistent resource (404) or an
     * unconfigured driver (503) where doing so does not weaken the point: what
     * is being proved is that the **role gate** is passed identically, and a 403
     * would appear in place of the 404 or 503 if it were not.
     *
     * 24 routes. The 25th on these six controllers is
     * `GET /admin/integrations/google/callback`, which is `@Public()` - Google's
     * browser redirect carries no Authorization header - so it has no role
     * parity to prove.
     */
    const ADMIN_ROUTES: {
      method: 'get' | 'post' | 'patch' | 'delete';
      path: string;
      body?: Record<string, unknown>;
    }[] = [
      // admin-announcements (2)
      { method: 'get', path: '/admin/announcements' },
      {
        method: 'post',
        path: '/admin/announcements',
        // A nonexistent course: 404 for both, and repeatable.
        body: {
          title: 'Parity probe',
          message: 'Parity probe.',
          audience: 'course',
          courseId: 'course-does-not-exist',
        },
      },
      // admin-audit (1)
      { method: 'get', path: '/admin/audit-log' },
      // admin-groups (6)
      { method: 'get', path: '/admin/groups' },
      { method: 'get', path: '/admin/groups/group-does-not-exist' },
      { method: 'post', path: '/admin/groups', body: { name: 'Parity probe' } },
      {
        method: 'patch',
        path: '/admin/groups/group-does-not-exist',
        body: { name: 'Parity probe' },
      },
      {
        method: 'post',
        path: '/admin/groups/group-does-not-exist/courses',
        body: { courseId: 'course-1' },
      },
      {
        method: 'delete',
        path: '/admin/groups/group-does-not-exist/courses/course-1',
      },
      // admin-google-integration (4 role-gated; callback is @Public)
      { method: 'get', path: '/admin/integrations/google' },
      { method: 'post', path: '/admin/integrations/google/connect' },
      { method: 'delete', path: '/admin/integrations/google' },
      {
        method: 'post',
        path: '/admin/integrations/google/inspect',
        body: { formUrl: 'https://docs.google.com/forms/d/e/x/viewform' },
      },
      // admin-manage (8)
      { method: 'get', path: '/admin/students' },
      { method: 'get', path: '/admin/assistants' },
      {
        method: 'post',
        path: '/admin/courses/course-does-not-exist/recordings',
        body: {
          moduleId: 'mod-1',
          lessonId: 'lesson-1',
          title: 'Parity probe',
          videoUrl: 'https://video.example.com/parity',
          durationSeconds: 60,
        },
      },
      {
        method: 'patch',
        path: '/admin/recordings/rec-does-not-exist',
        body: { title: 'Parity probe' },
      },
      { method: 'delete', path: '/admin/recordings/rec-does-not-exist' },
      {
        method: 'post',
        path: '/admin/courses/course-does-not-exist/live-sessions',
        body: {
          title: 'Parity probe',
          startsAt: '2027-01-01T10:00:00.000Z',
          durationMinutes: 60,
          joinUrl: 'https://meet.example.com/parity',
        },
      },
      {
        method: 'patch',
        path: '/admin/live-sessions/session-does-not-exist',
        body: { title: 'Parity probe' },
      },
      { method: 'delete', path: '/admin/live-sessions/session-does-not-exist' },
      // admin-staff (3)
      { method: 'get', path: '/admin/courses/course-1/staff' },
      {
        method: 'post',
        path: '/admin/courses/course-does-not-exist/staff',
        body: { userId: 'assistant-2' },
      },
      {
        method: 'delete',
        path: '/admin/courses/course-does-not-exist/staff/assistant-2',
      },
    ];

    it('covers all 24 role-gated admin routes', () => {
      // Asserted, because a parity table that quietly covers 12 of 24 routes
      // proves parity on 12 routes while reading as though it proved it on all.
      expect(ADMIN_ROUTES).toHaveLength(24);
    });

    it.each(ADMIN_ROUTES)(
      'admin gets the same status as the teacher on $method $path',
      async ({ method, path, body }) => {
        const send = (token: string) => {
          const req = request(app.getHttpServer())[method](path).set(
            bearer(token),
          );
          return body ? req.send(body) : req;
        };
        const asTeacher = await send(adminToken);
        const asAdmin = await send(fullAdminToken);

        expect(asAdmin.status).toBe(asTeacher.status);
        // The failure this is really looking for: a decorator site that was
        // missed, which shows up as a 403 for the admin alone.
        expect(asAdmin.status).not.toBe(403);
        expect(asAdmin.status).not.toBe(401);
      },
    );

    it('lets the admin read the three admin lists an assistant cannot', async () => {
      // Both directions in one test. The refusal half duplicates the existing
      // TA table above deliberately: that table is what guards the boundary and
      // must never be edited, and this states the positive case beside it.
      for (const route of [
        '/admin/students',
        '/admin/assistants',
        '/admin/audit-log',
      ]) {
        await request(app.getHttpServer())
          .get(route)
          .set(bearer(fullAdminToken))
          .expect(200);
        await request(app.getHttpServer())
          .get(route)
          .set(bearer(assignedTaToken))
          .expect(403);
      }
    });

    it('leaves the admin unscoped on /staff, like the teacher and unlike a TA', async () => {
      const overview = await request(app.getHttpServer())
        .get('/staff/overview')
        .set(bearer(fullAdminToken))
        .expect(200);
      expect(overview.body.scope).toBe('platform');
      expect(overview.body.courses.length).toBeGreaterThan(1);

      // The other half of `isAdmin`: a course the admin holds no assignment row
      // for still resolves, where an unassigned TA gets a 404.
      await request(app.getHttpServer())
        .get('/staff/courses/course-2/roster')
        .set(bearer(fullAdminToken))
        .expect(200);
      await request(app.getHttpServer())
        .get('/staff/courses/course-2/roster')
        .set(bearer(unassignedTaToken))
        .expect(404);
    });

    it('lists the admin in the staff directory, with her role', async () => {
      const staff = await request(app.getHttpServer())
        .get('/admin/assistants')
        .set(bearer(fullAdminToken))
        .expect(200);
      const row = staff.body.find((a: { id: string }) => a.id === 'admin-1');
      expect(row).toMatchObject({ id: 'admin-1', role: 'admin' });
      // Still the assistants too - this widened the list, it did not replace it.
      expect(staff.body.map((a: { id: string }) => a.id)).toContain(
        'assistant-1',
      );
      // And nothing leaks that should not be in a directory row.
      expect(row.passwordHash).toBeUndefined();
    });

    it('records the admin as admin in the audit log, not as a teacher or an assistant', async () => {
      // R-3, over the wire. This is the assertion that proves `Role.Admin` does
      // the job it exists for. Before `actorRoleOf` replaced the twelve
      // ternaries, `grading.service.ts` carried
      // `role === Teacher ? Teacher : Assistant`, so this returned 'assistant'
      // and the admin's marking landed inside the assistant activity trail.
      await request(app.getHttpServer())
        .post('/staff/submissions/sub-2/grade')
        .set(bearer(fullAdminToken))
        .send({ score: 13, feedback: 'Marked by the full admin.' })
        .expect(200);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=submission.graded')
        .set(bearer(fullAdminToken))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'admin-1',
        actorRole: 'admin',
        targetId: 'sub-2',
      });
    });

    it('records the admin as admin on a group write too, not only on grading', async () => {
      // The twelve ternaries split into two families that failed in opposite
      // directions, and `groups.service.ts` was in the other one. A second
      // family is checked so the fix is not one site deep.
      const created = await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(fullAdminToken))
        .send({ name: 'E2E - created by the full admin' })
        .expect(201);

      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=group.created')
        .set(bearer(fullAdminToken))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'admin-1',
        actorRole: 'admin',
        targetId: created.body.id,
      });
    });

    it('records the teacher as teacher still, so the fix did not flatten the other way', async () => {
      await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: 'E2E - created by the teacher' })
        .expect(201);
      const log = await request(app.getHttpServer())
        .get('/admin/audit-log?action=group.created')
        .set(bearer(adminToken))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'teacher-1',
        actorRole: 'teacher',
      });
    });
  });

  /**
   * `AUTH-3`. The four withheld verbs, of which exactly one has a route today.
   * `AUTHORIZATION_MODEL.md` §3: **add stays, remove moves to teacher/admin.**
   * That is two assertions, not one, and the second is the easier to lose.
   */
  describe('AUTH-3: an assistant may place a student, and may not remove one', () => {
    let groupId: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: 'E2E - AUTH-3 withheld verbs' })
        .expect(201);
      groupId = created.body.id;
    });

    const membersOf = async (token: string): Promise<string[]> => {
      const res = await request(app.getHttpServer())
        .get(`/staff/groups/${groupId}/members`)
        .set(bearer(token))
        .expect(200);
      return res.body.map((m: { studentId: string }) => m.studentId);
    };

    it('still lets an assistant add a member (the grant that survives)', async () => {
      await request(app.getHttpServer())
        .post(`/staff/groups/${groupId}/members`)
        .set(bearer(assignedTaToken))
        .send({ studentId: 'student-1' })
        .expect(201);
      expect(await membersOf(assignedTaToken)).toContain('student-1');
    });

    it('refuses an assistant the removal with a 403, and does not remove', async () => {
      // 403 and not 404: this is a **capability** refusal, not a scope one. The
      // assistant is looking at the roster - they can see the group and the
      // student - so a 404 would make the UI lie about a row it is rendering.
      // `AUTHORIZATION_MODEL.md` §2 reserves the 404 posture for scope.
      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-1`)
        .set(bearer(assignedTaToken))
        .expect(403);

      // A refusal that refuses and then writes anyway is not a refusal.
      expect(await membersOf(assignedTaToken)).toContain('student-1');
    });

    it('refuses without naming the capability, the resource or any SQL', async () => {
      const refused = await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-1`)
        .set(bearer(assignedTaToken))
        .expect(403);

      // Over HTTP the refusal comes from `RolesGuard` and reads
      // `'Forbidden resource'`: the method-level `@Roles(...STAFF_ADMIN)` fires
      // before the handler, so `GroupsService`'s `assertMay` is never reached on
      // this path. That is the intended order - the decorator is the cheap outer
      // gate - and it is why the service check needs its own unit test
      // (`groups.controller.spec.ts`) rather than being inferred from this one.
      expect(refused.body.message).toBe('Forbidden resource');

      // Either way, the body leaks nothing: not which of the four withheld
      // verbs was tripped, not the group, not the student, no SQL, no stack.
      const body = JSON.stringify(refused.body);
      expect(body).not.toMatch(/group\.member\.remove/);
      expect(body).not.toMatch(/select |from |where |stack/i);
      expect(body).not.toContain(groupId);
      expect(body).not.toContain('student-1');
    });

    it('lets the teacher remove the member', async () => {
      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-1`)
        .set(bearer(adminToken))
        .expect(204);
      expect(await membersOf(adminToken)).not.toContain('student-1');
    });

    it('lets the full admin remove a member too', async () => {
      await request(app.getHttpServer())
        .post(`/staff/groups/${groupId}/members`)
        .set(bearer(adminToken))
        .send({ studentId: 'student-2' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-2`)
        .set(bearer(fullAdminToken))
        .expect(204);
      expect(await membersOf(fullAdminToken)).not.toContain('student-2');
    });

    it('refuses the removal to an assistant even for a member who is not there', async () => {
      // The capability check runs **before** the group and the membership are
      // read, so a refused assistant learns nothing about what exists. A 404
      // here would be an existence oracle for group membership.
      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-1`)
        .set(bearer(assignedTaToken))
        .expect(403);
      // The teacher, on the same call, gets the honest 404.
      await request(app.getHttpServer())
        .delete(`/staff/groups/${groupId}/members/student-1`)
        .set(bearer(adminToken))
        .expect(404);
    });
  });
});
