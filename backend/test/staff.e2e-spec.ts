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
  let adminToken: string;
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
      // Resolved from role = 'assistant' at send time (CLAUDE.md 5.14):
      // assistant-1 and assistant-2.
      expect(posted.body).toMatchObject({ audience: 'all_tas', recipientCount: 2 });

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
        .send({ courseId: 'course-1', learningMode: 'live' })
        .expect(403);
    });

    it('lets a TA place and remove a student', async () => {
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
      await request(app.getHttpServer())
        .post(`/admin/groups/${groupId}/courses`)
        .set(bearer(adminToken))
        .send({ courseId: 'course-1', learningMode: 'hybrid' })
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
});
