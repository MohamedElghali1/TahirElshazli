import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { WORK_REPOSITORY, type WorkRepository } from './../src/assessments/interfaces/work-repository.interface.js';
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from './../src/assessments/interfaces/assessment-repository.interface.js';
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
      // that covers only the GET is a plausible mistake. The two probes were
      // `/admin/courses/:id/staff` until `AUTH-2` retired it; course create and
      // edit are the same shape of admin-only write.
      await request(app.getHttpServer())
        .post('/admin/courses')
        .set(bearer(assignedTaToken))
        .send({
          title: 'TA should not be able to create this',
          description: 'x',
          slug: 'ta-cannot-create',
          teacherName: 'Dr. Tahir Elshazli',
        })
        .expect(403);
      await request(app.getHttpServer())
        .patch('/admin/courses/course-1')
        .set(bearer(assignedTaToken))
        .send({ title: 'TA should not be able to rename this' })
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

  /**
   * **`AUTH-2` retired `/admin/courses/:courseId/staff`** - the three routes
   * that assigned an assistant to a *course*. Scope is held at the group grain
   * now (`assistant_scopes` + `assistant_group_assignments`), and the route
   * that edits it is unit 5's `PATCH /admin/assistants/{userId}`.
   *
   * Asserted as 404 rather than merely deleted from this file, because a route
   * that quietly still answers is exactly what a deleted test cannot notice.
   */
  describe('the retired course-staff routes answer 404', () => {
    it.each([
      ['get', '/admin/courses/course-1/staff'],
      ['post', '/admin/courses/course-1/staff'],
      ['delete', '/admin/courses/course-1/staff/assistant-1'],
    ] as const)('%s %s', async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .set(bearer(adminToken))
        .expect(404);
    });

    it('still filters the audit log by the retained course_staff actions', async () => {
      // The table is gone; its history is not. `AUDIT_ACTION_VALUES` is built
      // from the `AuditAction` union, so removing the member "for tidiness"
      // would make every historical row of that action unfilterable with a 400.
      await request(app.getHttpServer())
        .get('/admin/audit-log?action=course_staff.assigned')
        .set(bearer(adminToken))
        .expect(200);
      await request(app.getHttpServer())
        .get('/admin/audit-log?action=course_staff.unassigned')
        .set(bearer(adminToken))
        .expect(200);
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
        .send({ name: 'E2E — Wednesday 17:00', courseId: 'course-1' })
        .expect(201);
      groupId = created.body.id;
    });

    it('refuses group creation to a TA over HTTP', async () => {
      // The class-level @Roles(Role.Teacher) on AdminGroupsController, proved
      // through the wire rather than by reading the decorator.
      await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(assignedTaToken))
        .send({ name: 'TA should not be able to create this', courseId: 'course-1' })
        .expect(403);
    });

    it('refuses editing a group to a TA', async () => {
      // The two `/groups/:id/courses` routes are retired: a group's course is
      // a field on the group now, so changing it is the PATCH.
      await request(app.getHttpServer())
        .patch(`/admin/groups/${groupId}`)
        .set(bearer(assignedTaToken))
        .send({ courseId: 'course-2' })
        .expect(403);
    });

    it('no longer exposes the retired group-course routes', async () => {
      await request(app.getHttpServer())
        .post(`/admin/groups/${groupId}/courses`)
        .set(bearer(adminToken))
        .send({ courseId: 'course-1' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/admin/groups/${groupId}/courses/course-1`)
        .set(bearer(adminToken))
        .expect(404);
    });

    it('lets a TA place a student, and no longer lets them remove one', async () => {
      // **Narrowed by AUTH-3.** The removal was a 204 for an assistant when
      // this test was written; `AUTHORIZATION_MODEL.md` §3 withholds it, so it
      // is now a 403 and the teacher does the removal. The placement half is
      // unchanged, and that is the point of keeping both in one test: "add
      // stays, remove moves" is two assertions, and the pair is the requirement.
      // **group-1, not the group created above** (`D-10`): assistant-1 holds
      // group-1 and nothing else, so a group an admin just created is a 404 to
      // them - asserted in its own describe below.
      await request(app.getHttpServer())
        .post('/staff/groups/group-1/members')
        .set(bearer(assignedTaToken))
        .send({ studentId: 'student-2' })
        .expect(201);

      const members = await request(app.getHttpServer())
        .get('/staff/groups/group-1/members')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(
        members.body.map((m: { studentId: string }) => m.studentId),
      ).toContain('student-2');

      await request(app.getHttpServer())
        .delete('/staff/groups/group-1/members/student-2')
        .set(bearer(assignedTaToken))
        .expect(403);

      await request(app.getHttpServer())
        .delete('/staff/groups/group-1/members/student-2')
        .set(bearer(adminToken))
        .expect(204);
    });

    it('refuses with 409 when a populated group is pointed at another course', async () => {
      // `DOM-2`. The group created in `beforeAll` gains a member below, so do
      // the move on a group of its own. An empty group moves freely; one with
      // students does not, because `Enrollment` is the access gate and every
      // member would be left enrolled on the old course while being targeted
      // by work set for the new one.
      const empty = await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: 'E2E — empty, movable', courseId: 'course-1' })
        .expect(201);
      // `API_SPEC.yaml`'s `Group` requires `memberCount` and every group
      // response is that shape, the two writes included (F2A-4).
      expect(empty.body.memberCount).toBe(0);
      const moved = await request(app.getHttpServer())
        .patch(`/admin/groups/${empty.body.id}`)
        .set(bearer(adminToken))
        .send({ courseId: 'course-2' })
        .expect(200);
      expect(moved.body.memberCount).toBe(0);

      await request(app.getHttpServer())
        .post(`/staff/groups/${empty.body.id}/members`)
        .set(bearer(adminToken))
        .send({ studentId: 'student-1' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/admin/groups/${empty.body.id}`)
        .set(bearer(adminToken))
        .send({ courseId: 'course-1' })
        .expect(409);
    });

    it('naming an assistant on a group grants them nothing', async () => {
      // **The binding rule.** `groups.assistant_id` is a DISPLAY field; what an
      // assistant may reach is decided by `StaffScopeService` and, from
      // `AUTH-2`, by `assistant_group_assignments`. assistant-2 holds no
      // course. Naming them on a group that studies course-1 must leave them
      // exactly as unable to read course-1 as they were - and with the same
      // 404, not a 403, so they cannot tell the difference from a miss.
      const named = await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({
          name: 'E2E — display-only assistant',
          courseId: 'course-1',
          assistantId: 'assistant-2',
        })
        .expect(201);
      expect(named.body.assistantId).toBe('assistant-2');

      await request(app.getHttpServer())
        .get('/staff/courses/course-1/groups')
        .set(bearer(unassignedTaToken))
        .expect(404);
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
      // A group must name a course: `courseId` is required on create.
      await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: 'No course' })
        .expect(400);
      // `whitelist: true` strips an undeclared field rather than rejecting it,
      // so the rejected case has to be a DECLARED field with a bad value.
      await request(app.getHttpServer())
        .patch(`/admin/groups/${groupId}`)
        .set(bearer(adminToken))
        .send({ courseId: 'course 1; drop table' })
        .expect(400);
      // An explicit `null` on a NOT NULL column is refused rather than let
      // through to the drivers, which disagreed about it: Postgres COALESCEd it
      // to a 200 no-op and the memory driver wrote `name = null` (F2A-2).
      // `@IsOptionalNotNull` is what makes `undefined` and `null` different
      // here; `@IsOptional()` skips its validators for both.
      await request(app.getHttpServer())
        .patch(`/admin/groups/${groupId}`)
        .set(bearer(adminToken))
        .send({ name: null })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/admin/groups/${groupId}`)
        .set(bearer(adminToken))
        .send({ courseId: null })
        .expect(400);
      // ...while a nullable column still takes one: `null` clears the room.
      await request(app.getHttpServer())
        .patch(`/admin/groups/${groupId}`)
        .set(bearer(adminToken))
        .send({ room: null })
        .expect(200);
    });

    it('records the placement in the audit log with the TA as actor', async () => {
      await request(app.getHttpServer())
        .post('/staff/groups/group-1/members')
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
      // assess-3 carries a graded submission. `TASK-F3`: 409, a state
      // conflict, the same status `D-36` gives a task with synced results.
      const res = await request(app.getHttpServer())
        .delete('/staff/assessments/assess-3')
        .set(bearer(adminToken))
        .expect(409);
      expect(res.body.message).toBe(
        'This assessment has submissions and cannot be deleted. ' +
          'Close its availability window or re-target it instead.',
      );
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
   * **`D-10` over the wire.** An assistant whose scope is `assigned_groups`
   * reaches only the groups `assistant_group_assignments` grants them; everyone
   * else reaches any. The refusal is a **404 with a message byte-identical to a
   * genuine miss**, on the reads *and* the write
   * (`AUTHORIZATION_MODEL.md:105,207`).
   *
   * Both directions in every case, per `CLAUDE.md` §10: a boundary proved only
   * by its happy path is not proved.
   */
  describe('D-10: the group surface is scoped to the groups an assistant holds', () => {
    /** The group `assistant-1` holds in the fixture, and one they do not. */
    const HELD = 'group-1';
    const NOT_HELD = 'group-2';

    const messageOf = async (
      method: 'get' | 'post',
      path: string,
      token: string,
      body?: object,
    ): Promise<string> => {
      const req = request(app.getHttpServer())[method](path).set(bearer(token));
      const res = await (body ? req.send(body) : req).expect(404);
      return res.body.message as string;
    };

    it('lets the holding assistant read the group, its roster and its report', async () => {
      await request(app.getHttpServer())
        .get(`/staff/groups/${HELD}`)
        .set(bearer(assignedTaToken))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/staff/groups/${HELD}/members`)
        .set(bearer(assignedTaToken))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/staff/groups/${HELD}/report`)
        .set(bearer(assignedTaToken))
        .expect(200);
    });

    it.each([
      ['the group', `/staff/groups/${NOT_HELD}`, `/staff/groups/group-nope`],
      [
        'the roster',
        `/staff/groups/${NOT_HELD}/members`,
        `/staff/groups/group-nope/members`,
      ],
      [
        'the report',
        `/staff/groups/${NOT_HELD}/report`,
        `/staff/groups/group-nope/report`,
      ],
    ])(
      '404s %s of a group the assistant does not hold, identically to a genuine miss',
      async (_what, outOfScope, missing) => {
        const denied = await messageOf('get', outOfScope, assignedTaToken);
        const gone = await messageOf('get', missing, assignedTaToken);
        expect(denied).toBe(gone);
        // And it leaks nothing else: no SQL, no stack, no confirmation.
        expect(denied).not.toMatch(/select |from |where |stack/i);
      },
    );

    it('404s the placement write too, not only the reads', async () => {
      const denied = await messageOf(
        'post',
        `/staff/groups/${NOT_HELD}/members`,
        assignedTaToken,
        { studentId: 'student-2' },
      );
      const gone = await messageOf(
        'post',
        '/staff/groups/group-nope/members',
        assignedTaToken,
        { studentId: 'student-2' },
      );
      expect(denied).toBe(gone);

      // A refusal that refuses and then writes anyway is not a refusal.
      const members = await request(app.getHttpServer())
        .get(`/staff/groups/${NOT_HELD}/members`)
        .set(bearer(adminToken))
        .expect(200);
      expect(
        members.body.map((m: { studentId: string }) => m.studentId),
      ).not.toContain('student-2');
    });

    it('404s an assistant who holds no group at all, on a group that exists', async () => {
      await request(app.getHttpServer())
        .get(`/staff/groups/${HELD}`)
        .set(bearer(unassignedTaToken))
        .expect(404);
    });

    it.each([
      ['the teacher', () => adminToken],
      ['the full admin', () => fullAdminToken],
    ])('lets %s read every group', async (_label, token) => {
      await request(app.getHttpServer())
        .get(`/staff/groups/${NOT_HELD}`)
        .set(bearer(token()))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/staff/groups/${NOT_HELD}/members`)
        .set(bearer(token()))
        .expect(200);
    });

    it('does not let naming an assistant on a group grant them it (ruling R-1)', async () => {
      // `groups.assistant_id` is the DISPLAY field. Naming assistant-2 on a
      // group must leave them exactly as unable to read it - with the same 404,
      // not a 403, so they cannot tell it apart from a miss.
      const named = await request(app.getHttpServer())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({
          name: 'E2E - D-10 display-only assistant',
          courseId: 'course-1',
          assistantId: 'assistant-2',
        })
        .expect(201);
      expect(named.body.assistantId).toBe('assistant-2');

      await request(app.getHttpServer())
        .get(`/staff/groups/${named.body.id}`)
        .set(bearer(unassignedTaToken))
        .expect(404);
    });
  });

  /**
   * `AUTH-1`: the Full admin is the teacher's permission under a distinct
   * identity. Both halves are asserted here - the reach, and the attribution -
   * because they fail independently and in opposite directions.
   *
   * Reach: `staff-scope.service.ts`'s `isAdmin` is the single line that decides
   * whether an admin can do anything at all. Missed, they pass `RolesGuard`,
   * find no `assistant_scopes` row and 404 on every course.
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
     * The one route on these six controllers that is absent is
     * `GET /admin/integrations/google/callback`, which is `@Public()` -
     * Google's browser redirect carries no Authorization header - so it has no
     * role parity to prove.
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
      // admin-groups (5) - two retired by `DOM-1`: a group's course is a
      // field on the group now, so POST/DELETE /groups/:id/courses are gone.
      { method: 'get', path: '/admin/groups' },
      { method: 'get', path: '/admin/groups/group-does-not-exist' },
      {
        method: 'post',
        path: '/admin/groups',
        body: { name: 'Parity probe', courseId: 'course-1' },
      },
      {
        method: 'patch',
        path: '/admin/groups/group-does-not-exist',
        body: { name: 'Parity probe' },
      },
      // `GROUP-3`. A nonexistent group is a stable 404 for both - no state
      // ever changes on either path.
      {
        method: 'post',
        path: '/admin/groups/group-does-not-exist/members/bulk',
        body: { studentIds: ['student-1'] },
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
      // admin-manage (11)
      { method: 'get', path: '/admin/students' },
      { method: 'get', path: '/admin/assistants' },
      // The invitation flow (`AUTH-4`, `PEOPLE-4`). The invite probe reuses an
      // already-registered email - stable 409 for both, same no-mutation
      // shape as the student/course create probes below. The edit/remove/
      // resend probes name a nonexistent id - stable 404/409, no state change.
      {
        method: 'post',
        path: '/admin/assistants',
        body: {
          name: 'Parity probe',
          email: 'assistant@example.com',
          role: 'assistant',
          scope: 'all_groups',
        },
      },
      {
        method: 'patch',
        path: '/admin/assistants/assistant-does-not-exist',
        body: { name: 'Parity probe', email: 'x@example.com', role: 'assistant', scope: 'all_groups' },
      },
      { method: 'delete', path: '/admin/assistants/assistant-does-not-exist' },
      { method: 'post', path: '/admin/assistants/assistant-does-not-exist/resend' },
      // The registration queue (`DOM-4`). Both probes name an *active*
      // student, so both roles get the same 409 and neither call changes any
      // state - a parity probe that mutated would make the second role's
      // answer depend on the first.
      {
        method: 'post',
        path: '/admin/students/student-1/accept',
        body: { groupId: 'group-1' },
      },
      {
        method: 'post',
        path: '/admin/students/student-1/reject',
        body: { reason: 'Parity probe' },
      },
      // The staff detail/edit/create surface (`PEOPLE-2`, `PEOPLE-3`). The
      // detail and edit probes name a nonexistent id (stable 404); the create
      // probe reuses an already-registered email (stable 409) - same
      // no-mutation shape as the course-create probe above.
      { method: 'get', path: '/admin/students/student-does-not-exist' },
      {
        method: 'patch',
        path: '/admin/students/student-does-not-exist',
        body: { staffNotes: 'Parity probe' },
      },
      {
        method: 'post',
        path: '/admin/students',
        body: { name: 'Parity probe', email: 'student@example.com' },
      },
      // Course lifecycle (`DOM-5`). A slug that is already taken, so both get
      // 409 and nothing is created twice.
      {
        method: 'post',
        path: '/admin/courses',
        body: {
          title: 'Parity probe',
          description: 'Parity probe',
          slug: 'as-chemistry',
          teacherName: 'Dr. Tahir Elshazli',
        },
      },
      {
        method: 'patch',
        path: '/admin/courses/course-does-not-exist',
        body: { title: 'Parity probe' },
      },
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
    ];

    it('covers all 31 role-gated admin routes', () => {
      // Asserted, because a parity table that quietly covers 12 of 31 routes
      // proves parity on 12 routes while reading as though it proved it on all.
      // 24 before `DOM-1` retired the two group-course routes; 22 after; 26
      // once `DOM-4` added accept/reject and `DOM-5` added course create/edit;
      // 23 once `AUTH-2` retired the three course-staff routes; 26 again once
      // `PEOPLE-2`/`PEOPLE-3` added student detail/edit/create; 30 once
      // `PEOPLE-4`/`AUTH-4` added invite/edit/remove/resend; 31 once `GROUP-3`
      // added bulk move.
      expect(ADMIN_ROUTES).toHaveLength(31);
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
        .send({ name: 'E2E - created by the full admin', courseId: 'course-1' })
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
        .send({ name: 'E2E - created by the teacher', courseId: 'course-1' })
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
    /**
     * **group-1**, the group `assistant-1` holds. It used to be a group created
     * here; `D-10` scoped the group surface, and an assistant reaches only what
     * `assistant_group_assignments` grants them - which, until unit 5's
     * `PATCH /admin/assistants/{userId}`, only the seed fixture can grant.
     * Proving "add stays, remove moves" needs a group the assistant can reach
     * at all, or the 403 under test would be indistinguishable from a 404.
     */
    const groupId = 'group-1';

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

  /**
   * The draft library over the wire (`TASK-2`). Course reach through a held
   * group is the grain; a draft on an unreachable course and a missing draft
   * answer byte-identical 404s.
   *
   * There is no parent account in the fixtures, so the role gate is proven
   * with a student token - the same `RolesGuard` refuses every non-staff role.
   */
  describe('task drafts', () => {
    const draft = {
      courseId: 'course-1',
      type: 'homework',
      title: 'E2E draft',
      instructions: 'Read the passage.',
      attachments: [{ url: '/uploads/passage.pdf', name: 'Passage', audience: 'students' }],
    };
    const server = () => app.getHttpServer();

    it.each([
      ['get', '/staff/task-drafts'],
      ['post', '/staff/task-drafts'],
      ['patch', '/staff/task-drafts/any'],
      ['delete', '/staff/task-drafts/any'],
    ] as const)('refuses a student token on %s %s', async (method, path) => {
      await request(server())[method](path).set(bearer(studentToken)).send(draft).expect(403);
    });

    it('lets an assigned assistant create, list, edit and delete on course-1', async () => {
      const created = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(assignedTaToken))
        .send(draft)
        .expect(201);
      expect(created.body).toMatchObject({
        courseId: 'course-1',
        title: 'E2E draft',
        usedCount: 0,
        createdBy: 'assistant-1',
        attachments: [{ url: '/uploads/passage.pdf', name: 'Passage', mimeType: null, sizeBytes: null, audience: 'students' }],
      });

      const listed = await request(server())
        .get('/staff/task-drafts?courseId=course-1')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(listed.body.map((d: { id: string }) => d.id)).toContain(created.body.id);

      const edited = await request(server())
        .patch(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(assignedTaToken))
        .send({ title: 'E2E draft, edited' })
        .expect(200);
      expect(edited.body.title).toBe('E2E draft, edited');

      await request(server())
        .delete(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(assignedTaToken))
        .expect(204);
    });

    it('404s a course-2 draft for assistant-1 with a body byte-identical to a nonexistent draft', async () => {
      const elsewhere = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(adminToken))
        .send({ ...draft, courseId: 'course-2' })
        .expect(201);

      for (const method of ['patch', 'delete'] as const) {
        const denied = await request(server())
          [method](`/staff/task-drafts/${elsewhere.body.id}`)
          .set(bearer(assignedTaToken))
          .send({ title: 'x' })
          .expect(404);
        const gone = await request(server())
          [method]('/staff/task-drafts/draft-nope')
          .set(bearer(assignedTaToken))
          .send({ title: 'x' })
          .expect(404);
        expect(JSON.stringify(denied.body) === JSON.stringify(gone.body)).toBe(true);
        expect(denied.body.message).toBe('Task draft not found');
      }

      // Creating on an unreachable course is the course's own identical 404.
      const deniedCourse = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(assignedTaToken))
        .send({ ...draft, courseId: 'course-2' })
        .expect(404);
      const goneCourse = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(assignedTaToken))
        .send({ ...draft, courseId: 'course-nope' })
        .expect(404);
      expect(JSON.stringify(deniedCourse.body) === JSON.stringify(goneCourse.body)).toBe(true);

      // An unreachable courseId filter narrows to [] rather than 404ing.
      const filtered = await request(server())
        .get('/staff/task-drafts?courseId=course-2')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(filtered.body).toEqual([]);

      await request(server())
        .delete(`/staff/task-drafts/${elsewhere.body.id}`)
        .set(bearer(adminToken))
        .expect(204);
    });

    it('gives an assistant who holds nothing an empty library', async () => {
      const created = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(adminToken))
        .send(draft)
        .expect(201);
      const listed = await request(server())
        .get('/staff/task-drafts')
        .set(bearer(unassignedTaToken))
        .expect(200);
      expect(listed.body).toEqual([]);
      await request(server())
        .delete(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(adminToken))
        .expect(204);
    });

    it.each([
      ['the teacher', () => adminToken],
      ['the full admin', () => fullAdminToken],
    ])('lets %s manage drafts on any course', async (_label, token) => {
      const created = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(token()))
        .send({ ...draft, courseId: 'course-2' })
        .expect(201);
      await request(server())
        .patch(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(token()))
        .send({ type: 'quiz' })
        .expect(200);
      await request(server())
        .delete(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(token()))
        .expect(204);
    });

    it('validates the body: blank title, javascript: URL, null field, too many attachments', async () => {
      const post = (body: object) =>
        request(server()).post('/staff/task-drafts').set(bearer(adminToken)).send(body);
      await post({ ...draft, title: '   ' }).expect(400);
      await post({ ...draft, attachments: [{ url: 'javascript:alert(1)', name: 'x', audience: 'students' }] }).expect(400);
      await post({ ...draft, attachments: [{ url: 'data:text/html,hi', name: 'x', audience: 'students' }] }).expect(400);
      await post({ ...draft, instructions: null }).expect(400);
      await post({
        ...draft,
        attachments: Array.from({ length: 11 }, (_, i) => ({ url: `/uploads/f${i}.pdf`, name: `f${i}`, audience: 'students' })),
      }).expect(400);
    });

    it('writes the three audit actions, and the log filter accepts them', async () => {
      const created = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(assignedTaToken))
        .send(draft)
        .expect(201);
      await request(server())
        .patch(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(assignedTaToken))
        .send({ title: 'Audited' })
        .expect(200);
      await request(server())
        .delete(`/staff/task-drafts/${created.body.id}`)
        .set(bearer(assignedTaToken))
        .expect(204);

      for (const action of ['task_draft.created', 'task_draft.updated', 'task_draft.deleted']) {
        const log = await request(server())
          .get(`/admin/audit-log?action=${action}`)
          .set(bearer(adminToken))
          .expect(200);
        expect(
          log.body.entries.some(
            (e: { targetId: string; actorId: string }) =>
              e.targetId === created.body.id && e.actorId === 'assistant-1',
          ),
        ).toBe(true);
      }
      await request(server())
        .get('/admin/audit-log?targetType=task_draft')
        .set(bearer(adminToken))
        .expect(200);
    });
  });

  describe('authoring from a draft, attachments and allowResubmission (TASK-3..5)', () => {
    const server = () => app.getHttpServer();
    const task = {
      title: 'E2E 6c task',
      type: 'homework',
      availableFrom: '2026-01-01T00:00:00.000Z',
      availableTo: '2099-01-01T00:00:00.000Z',
      dueAt: '2098-01-01T00:00:00.000Z',
      maxScore: 10,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 1048576,
      targets: [{ groupId: 'group-1' }],
    };
    const created: string[] = [];
    afterAll(async () => {
      for (const id of created) {
        await request(server()).delete(`/staff/assessments/${id}`).set(bearer(adminToken));
      }
    });

    it('authors from a draft: 201, and the draft usedCount is +1 on a follow-up GET', async () => {
      const draft = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(assignedTaToken))
        .send({ courseId: 'course-1', type: 'homework', title: 'E2E library item' })
        .expect(201);
      const res = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(assignedTaToken))
        .send({ ...task, draftId: draft.body.id })
        .expect(201);
      created.push(res.body.id);
      expect(res.body.draftId).toBe(draft.body.id);

      const library = await request(server())
        .get('/staff/task-drafts?courseId=course-1')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(library.body.find((d: { id: string }) => d.id === draft.body.id)?.usedCount).toBe(1);
    });

    it('404s a foreign draft with a body identical to a missing one', async () => {
      const foreign = await request(server())
        .post('/staff/task-drafts')
        .set(bearer(adminToken))
        .send({ courseId: 'course-2', type: 'homework', title: 'E2E course-2 draft' })
        .expect(201);
      const denied = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, draftId: foreign.body.id })
        .expect(404);
      const gone = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, draftId: 'draft-nope' })
        .expect(404);
      expect(JSON.stringify(denied.body) === JSON.stringify(gone.body)).toBe(true);
      expect(denied.body.message).toBe('Task draft not found');
    });

    it('threads attachments and allowResubmission through create, and both through PATCH', async () => {
      const attachments = [{ url: 'https://example.com/passage.pdf', name: 'Passage', audience: 'students' }];
      const res = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, attachments, allowResubmission: false })
        .expect(201);
      created.push(res.body.id);
      expect(res.body.attachments).toEqual([{ ...attachments[0], mimeType: null, sizeBytes: null }]);
      expect(res.body.allowResubmission).toBe(false);

      const patched = await request(server())
        .patch(`/staff/assessments/${res.body.id}`)
        .set(bearer(adminToken))
        .send({ attachments: [], allowResubmission: true })
        .expect(200);
      expect(patched.body.attachments).toEqual([]);
      expect(patched.body.allowResubmission).toBe(true);

      await request(server())
        .patch(`/staff/assessments/${res.body.id}`)
        .set(bearer(adminToken))
        .send({ allowResubmission: null })
        .expect(400);
      await request(server())
        .patch(`/staff/assessments/${res.body.id}`)
        .set(bearer(adminToken))
        .send({ attachments: [{ url: 'javascript:alert(1)', name: 'x', audience: 'students' }] })
        .expect(400);
    });

    it('a student gets 409 on a second submission to a one-shot task', async () => {
      // Its own cohort: earlier describes move student-1 in and out of group-1,
      // and this test must not depend on which of them ran last.
      const cohort = await request(server())
        .post('/admin/groups')
        .set(bearer(adminToken))
        .send({ name: 'E2E - one-shot cohort', courseId: 'course-1' })
        .expect(201);
      await request(server())
        .post(`/staff/groups/${cohort.body.id}/members`)
        .set(bearer(adminToken))
        .send({ studentId: 'student-1' })
        .expect(201);
      const res = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...task, targets: [{ groupId: cohort.body.id }], allowResubmission: false })
        .expect(201);
      created.push(res.body.id);
      await request(server())
        .post(`/assessments/${res.body.id}/submissions`)
        .set(bearer(studentToken))
        .send({ answerText: 'first' })
        .expect(201);
      await request(server())
        .post(`/assessments/${res.body.id}/submissions`)
        .set(bearer(studentToken))
        .send({ answerText: 'second' })
        .expect(409);
      const detail = await request(server())
        .get(`/assessments/${res.body.id}`)
        .set(bearer(studentToken))
        .expect(200);
      expect(detail.body.canSubmit).toBe(false);
    });
  });

  describe('existence oracle on /staff/assessments/:id', () => {
    const server = () => app.getHttpServer();
    let elsewhere: string;
    beforeAll(async () => {
      const res = await request(server())
        .post('/staff/courses/course-2/assessments')
        .set(bearer(adminToken))
        .send({
          title: 'E2E course-2 task',
          type: 'homework',
          availableFrom: '2026-01-01T00:00:00.000Z',
          availableTo: '2099-01-01T00:00:00.000Z',
          dueAt: '2098-01-01T00:00:00.000Z',
          maxScore: 10,
          allowedFileTypes: ['application/pdf'],
          maxFileSizeBytes: 1048576,
          targets: [{ groupId: 'group-2' }],
        })
        .expect(201);
      elsewhere = res.body.id;
    });
    afterAll(async () => {
      await request(server()).delete(`/staff/assessments/${elsewhere}`).set(bearer(adminToken));
    });

    it.each([
      ['PATCH', 'patch', '', { title: 'x' }],
      ['DELETE', 'delete', '', undefined],
      ['POST targets', 'post', '/targets', { targets: [{ groupId: 'group-1' }] }],
    ] as const)('%s: a course-2 task for assistant-1 === a nonexistent id', async (_l, method, suffix, body) => {
      const call = (id: string) => {
        const req = request(server())[method](`/staff/assessments/${id}${suffix}`).set(bearer(assignedTaToken));
        return (body ? req.send(body) : req).expect(404);
      };
      const denied = await call(elsewhere);
      const gone = await call('nope');
      expect(JSON.stringify(denied.body) === JSON.stringify(gone.body)).toBe(true);
      expect(denied.body.message).toBe('Assessment not found');
    });
  });

  describe('GET /staff/tasks is group-grain', () => {
    const server = () => app.getHttpServer();
    let group3: string;
    let shared: string;
    let onlyGroup3: string;

    beforeAll(async () => {
      group3 = (
        await request(server())
          .post('/admin/groups')
          .set(bearer(adminToken))
          .send({ name: 'E2E - tasks group 3', courseId: 'course-1' })
          .expect(201)
      ).body.id;
      const base = {
        type: 'homework',
        availableFrom: '2026-01-01T00:00:00.000Z',
        availableTo: '2099-01-01T00:00:00.000Z',
        dueAt: '2098-01-01T00:00:00.000Z',
        maxScore: 10,
        allowedFileTypes: ['application/pdf'],
        maxFileSizeBytes: 1048576,
      };
      shared = (
        await request(server())
          .post('/staff/courses/course-1/assessments')
          .set(bearer(adminToken))
          .send({ ...base, title: 'E2E shared task', targets: [{ groupId: 'group-1' }, { groupId: group3 }] })
          .expect(201)
      ).body.id;
      onlyGroup3 = (
        await request(server())
          .post('/staff/courses/course-1/assessments')
          .set(bearer(adminToken))
          .send({ ...base, title: 'E2E group-3 task', targets: [{ groupId: group3 }] })
          .expect(201)
      ).body.id;
    });
    afterAll(async () => {
      for (const id of [shared, onlyGroup3]) {
        await request(server()).delete(`/staff/assessments/${id}`).set(bearer(adminToken));
      }
    });

    it('refuses a student token', async () => {
      await request(server()).get('/staff/tasks').set(bearer(studentToken)).expect(403);
    });

    it('requires a token', async () => {
      await request(server()).get('/staff/tasks').expect(401);
    });

    it('gives an assistant who holds nothing []', async () => {
      const res = await request(server()).get('/staff/tasks').set(bearer(unassignedTaToken)).expect(200);
      expect(res.body).toEqual([]);
    });

    it('shows assistant-1 only tasks with a group-1 target, with the targets narrowed', async () => {
      const res = await request(server()).get('/staff/tasks').set(bearer(assignedTaToken)).expect(200);
      const ids = res.body.map((t: { id: string }) => t.id);
      expect(ids).toContain(shared);
      expect(ids).not.toContain(onlyGroup3);
      const row = res.body.find((t: { id: string }) => t.id === shared);
      expect(row.targets.map((t: { groupId: string }) => t.groupId)).toEqual(['group-1']);
      expect(JSON.stringify(res.body)).not.toContain(group3);
      for (const task of res.body) {
        expect(task.targets.every((t: { groupId: string }) => t.groupId === 'group-1')).toBe(true);
      }
    });

    it('answers an unheld groupId and an unknown one identically', async () => {
      const unheld = await request(server())
        .get(`/staff/tasks?groupId=${group3}`)
        .set(bearer(assignedTaToken))
        .expect(200);
      const unknown = await request(server())
        .get('/staff/tasks?groupId=group-nope')
        .set(bearer(assignedTaToken))
        .expect(200);
      expect(unheld.body).toEqual([]);
      expect(JSON.stringify(unheld.body) === JSON.stringify(unknown.body)).toBe(true);
    });

    it.each([
      ['the teacher', () => adminToken],
      ['the full admin', () => fullAdminToken],
    ])('shows %s every task and every target', async (_label, token) => {
      const res = await request(server()).get('/staff/tasks').set(bearer(token())).expect(200);
      const ids = res.body.map((t: { id: string }) => t.id);
      expect(ids).toEqual(expect.arrayContaining([shared, onlyGroup3]));
      const row = res.body.find((t: { id: string }) => t.id === shared);
      expect(row.targets.map((t: { groupId: string }) => t.groupId).sort()).toEqual(['group-1', group3].sort());
      expect(row.targets.every((t: { groupName: string }) => t.groupName.length > 0)).toBe(true);
    });

    it('filters by courseId and search, and validates the query', async () => {
      const course2 = await request(server())
        .get('/staff/tasks?courseId=course-2')
        .set(bearer(adminToken))
        .expect(200);
      expect(course2.body.every((t: { courseId: string }) => t.courseId === 'course-2')).toBe(true);
      const found = await request(server())
        .get('/staff/tasks?search=E2E%20group-3')
        .set(bearer(adminToken))
        .expect(200);
      expect(found.body.map((t: { id: string }) => t.id)).toEqual([onlyGroup3]);
      await request(server())
        .get(`/staff/tasks?search=${'x'.repeat(121)}`)
        .set(bearer(adminToken))
        .expect(400);
    });
  });

  describe('visibility (D-28): published | hidden, scheduled derived', () => {
    const server = () => app.getHttpServer();
    let cohort: string;
    const base = {
      title: 'E2E visibility task',
      type: 'homework',
      availableFrom: '2026-01-01T00:00:00.000Z',
      availableTo: '2099-01-01T00:00:00.000Z',
      dueAt: '2098-01-01T00:00:00.000Z',
      maxScore: 10,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 1048576,
    };
    beforeAll(async () => {
      cohort = (
        await request(server())
          .post('/admin/groups')
          .set(bearer(adminToken))
          .send({ name: 'E2E - visibility cohort', courseId: 'course-1' })
          .expect(201)
      ).body.id;
      await request(server())
        .post(`/staff/groups/${cohort}/members`)
        .set(bearer(adminToken))
        .send({ studentId: 'student-1' })
        .expect(201);
    });

    it('hides a task from the student list, and 404s detail and submit identically to a miss', async () => {
      // The teacher: this cohort is not one assistant-1 holds (`D-33`).
      const task = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...base, targets: [{ groupId: cohort }] })
        .expect(201);
      await request(server())
        .patch(`/staff/assessments/${task.body.id}`)
        .set(bearer(adminToken))
        .send({ visibility: 'hidden' })
        .expect(200);

      const list = await request(server())
        .get('/courses/course-1/assessments')
        .set(bearer(studentToken))
        .expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).not.toContain(task.body.id);

      const hidden = await request(server()).get(`/assessments/${task.body.id}`).set(bearer(studentToken)).expect(404);
      const missing = await request(server()).get('/assessments/nope').set(bearer(studentToken)).expect(404);
      expect(JSON.stringify(hidden.body) === JSON.stringify(missing.body)).toBe(true);

      const hiddenSubmit = await request(server())
        .post(`/assessments/${task.body.id}/submissions`)
        .set(bearer(studentToken))
        .send({ answerText: 'x' })
        .expect(404);
      const missingSubmit = await request(server())
        .post('/assessments/nope/submissions')
        .set(bearer(studentToken))
        .send({ answerText: 'x' })
        .expect(404);
      expect(JSON.stringify(hiddenSubmit.body) === JSON.stringify(missingSubmit.body)).toBe(true);

      // The staff list still shows it, labelled.
      const staff = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      const row = staff.body.find((t: { id: string }) => t.id === task.body.id);
      expect(row.visibility).toBe('hidden');
      expect(row.visibilityState).toBe('hidden');

      await request(server()).delete(`/staff/assessments/${task.body.id}`).set(bearer(adminToken)).expect(204);
    });

    it('refuses to hide a task with a submission: 409', async () => {
      await request(server())
        .patch('/staff/assessments/assess-3')
        .set(bearer(adminToken))
        .send({ visibility: 'hidden' })
        .expect(409);
    });

    it('refuses scheduled, and any other value, at the boundary: 400', async () => {
      for (const visibility of ['scheduled', 'draft', null]) {
        await request(server())
          .post('/staff/courses/course-1/assessments')
          .set(bearer(adminToken))
          .send({ ...base, targets: [{ groupId: cohort }], visibility })
          .expect(400);
      }
      await request(server())
        .patch('/staff/assessments/assess-1')
        .set(bearer(adminToken))
        .send({ visibility: 'scheduled' })
        .expect(400);
    });

    it('labels a published task with a future window scheduled on the staff list', async () => {
      const task = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({
          ...base,
          availableFrom: '2098-01-01T00:00:00.000Z',
          dueAt: '2098-06-01T00:00:00.000Z',
          targets: [{ groupId: cohort }],
        })
        .expect(201);
      expect(task.body.visibility).toBe('published');
      const staff = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      expect(staff.body.find((t: { id: string }) => t.id === task.body.id).visibilityState).toBe('scheduled');
      await request(server()).delete(`/staff/assessments/${task.body.id}`).set(bearer(adminToken)).expect(204);
    });
  });

  describe('the marker (D-32): teacher and admin choose; an assistant cannot', () => {
    const server = () => app.getHttpServer();
    let task: string;
    beforeAll(async () => {
      task = (
        await request(server())
          .post('/staff/courses/course-1/assessments')
          .set(bearer(adminToken))
          .send({
            title: 'E2E marker task',
            type: 'homework',
            availableFrom: '2026-01-01T00:00:00.000Z',
            availableTo: '2099-01-01T00:00:00.000Z',
            dueAt: '2098-01-01T00:00:00.000Z',
            maxScore: 10,
            allowedFileTypes: ['application/pdf'],
            maxFileSizeBytes: 1048576,
            targets: [{ groupId: 'group-1' }],
          })
          .expect(201)
      ).body.id;
    });
    afterAll(async () => {
      await request(server()).delete(`/staff/assessments/${task}`).set(bearer(adminToken));
    });

    it('403s an assistant sending a non-null markerId - the task is on their screen', async () => {
      await request(server())
        .patch(`/staff/assessments/${task}`)
        .set(bearer(assignedTaToken))
        .send({ markerId: 'assistant-1' })
        .expect(403);
    });

    it('400s the teacher naming an assistant who does not reach the audience, or a student', async () => {
      for (const markerId of ['assistant-2', 'student-1', 'nobody']) {
        await request(server())
          .patch(`/staff/assessments/${task}`)
          .set(bearer(adminToken))
          .send({ markerId })
          .expect(400);
      }
    });

    it('lets the teacher name assistant-1, shows the name, and lets the full admin clear it', async () => {
      const named = await request(server())
        .patch(`/staff/assessments/${task}`)
        .set(bearer(adminToken))
        .send({ markerId: 'assistant-1' })
        .expect(200);
      expect(named.body.markerId).toBe('assistant-1');
      const list = await request(server()).get('/staff/tasks').set(bearer(assignedTaToken)).expect(200);
      const row = list.body.find((t: { id: string }) => t.id === task);
      expect(row.markerName).toBe('Nour Hassan');
      expect(row.markerDrift).toBe(false);

      // An assistant may not clear a marker someone else chose, either.
      await request(server())
        .patch(`/staff/assessments/${task}`)
        .set(bearer(assignedTaToken))
        .send({ markerId: null })
        .expect(403);

      const cleared = await request(server())
        .patch(`/staff/assessments/${task}`)
        .set(bearer(fullAdminToken))
        .send({ markerId: null })
        .expect(200);
      expect(cleared.body.markerId).toBeNull();
    });

    it('403s an assistant naming a marker on create', async () => {
      await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(assignedTaToken))
        .send({
          title: 'E2E marker create',
          type: 'homework',
          availableFrom: '2026-01-01T00:00:00.000Z',
          availableTo: '2099-01-01T00:00:00.000Z',
          dueAt: '2098-01-01T00:00:00.000Z',
          maxScore: 10,
          allowedFileTypes: ['application/pdf'],
          maxFileSizeBytes: 1048576,
          targets: [{ groupId: 'group-1' }],
          markerId: 'teacher-1',
        })
        .expect(403);
    });
  });

  describe('D-33: the targeting write and the picker are held-group only', () => {
    const server = () => app.getHttpServer();
    let group3: string;
    const base = {
      title: 'E2E D-33 task',
      type: 'homework',
      availableFrom: '2026-01-01T00:00:00.000Z',
      availableTo: '2099-01-01T00:00:00.000Z',
      dueAt: '2098-01-01T00:00:00.000Z',
      maxScore: 10,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 1048576,
    };
    const created: string[] = [];
    beforeAll(async () => {
      group3 = (
        await request(server())
          .post('/admin/groups')
          .set(bearer(adminToken))
          .send({ name: 'E2E - D-33 unheld cohort', courseId: 'course-1' })
          .expect(201)
      ).body.id;
    });
    afterAll(async () => {
      for (const id of created) {
        await request(server()).delete(`/staff/assessments/${id}`).set(bearer(adminToken));
      }
    });

    it('404s assistant-1 targeting group-3, with the same message as a group not on the course', async () => {
      const unheld = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(assignedTaToken))
        .send({ ...base, targets: [{ groupId: group3 }] })
        .expect(404);
      expect(unheld.body.message).toBe(`Group ${group3} is not enrolled in this course`);
      const offCourse = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(assignedTaToken))
        .send({ ...base, targets: [{ groupId: 'group-2' }] })
        .expect(404);
      expect(
        JSON.stringify(unheld.body).replace(group3, '<id>') ===
          JSON.stringify(offCourse.body).replace('group-2', '<id>'),
      ).toBe(true);
    });

    it('403s assistant-1 re-targeting a task shared with group-3, and the audience survives', async () => {
      const shared = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...base, targets: [{ groupId: 'group-1' }, { groupId: group3 }] })
        .expect(201);
      created.push(shared.body.id);
      await request(server())
        .post(`/staff/assessments/${shared.body.id}/targets`)
        .set(bearer(assignedTaToken))
        .send({ targets: [{ groupId: 'group-1' }] })
        .expect(403);
      const tasks = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      const row = tasks.body.find((t: { id: string }) => t.id === shared.body.id);
      expect(row.targets.map((t: { groupId: string }) => t.groupId).sort()).toEqual(['group-1', group3].sort());
    });

    it('leaves the teacher and the full admin free to target any group', async () => {
      for (const token of [adminToken, fullAdminToken]) {
        const res = await request(server())
          .post('/staff/courses/course-1/assessments')
          .set(bearer(token))
          .send({ ...base, targets: [{ groupId: group3 }] })
          .expect(201);
        created.push(res.body.id);
      }
    });

    it('narrows GET /staff/courses/:id/groups to held groups for assistant-1', async () => {
      const ta = await request(server()).get('/staff/courses/course-1/groups').set(bearer(assignedTaToken)).expect(200);
      expect(ta.body.map((g: { id: string }) => g.id)).toEqual(['group-1']);
      const teacher = await request(server()).get('/staff/courses/course-1/groups').set(bearer(adminToken)).expect(200);
      expect(teacher.body.map((g: { id: string }) => g.id)).toEqual(expect.arrayContaining(['group-1', group3]));
    });
  });

  describe('attachment audience (D-29) and audio uploads', () => {
    const server = () => app.getHttpServer();
    it('returns only students attachments to the student, and refuses an attachment with no audience', async () => {
      const cohort = (
        await request(server())
          .post('/admin/groups')
          .set(bearer(adminToken))
          .send({ name: 'E2E - audience cohort', courseId: 'course-1' })
          .expect(201)
      ).body.id;
      await request(server())
        .post(`/staff/groups/${cohort}/members`)
        .set(bearer(adminToken))
        .send({ studentId: 'student-1' })
        .expect(201);
      const base = {
        title: 'E2E audience task',
        type: 'homework',
        availableFrom: '2026-01-01T00:00:00.000Z',
        availableTo: '2099-01-01T00:00:00.000Z',
        dueAt: '2098-01-01T00:00:00.000Z',
        maxScore: 10,
        allowedFileTypes: ['application/pdf'],
        maxFileSizeBytes: 1048576,
        targets: [{ groupId: cohort }],
      };
      await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...base, attachments: [{ url: '/uploads/a.pdf', name: 'No audience' }] })
        .expect(400);
      await request(server())
        .post('/staff/task-drafts')
        .set(bearer(adminToken))
        .send({ courseId: 'course-1', type: 'homework', title: 'x', attachments: [{ url: '/uploads/a.pdf', name: 'A', audience: 'everyone' }] })
        .expect(400);

      const task = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({
          ...base,
          attachments: [
            { url: 'https://example.com/passage.pdf', name: 'Passage', audience: 'students' },
            { url: 'https://example.com/scheme.pdf', name: 'Mark scheme', audience: 'staff' },
          ],
        })
        .expect(201);
      const detail = await request(server()).get(`/assessments/${task.body.id}`).set(bearer(studentToken)).expect(200);
      expect(detail.body.attachments).toEqual([
        { url: 'https://example.com/passage.pdf', name: 'Passage', mimeType: null, sizeBytes: null },
      ]);
      expect(JSON.stringify(detail.body)).not.toContain('scheme.pdf');
      await request(server()).delete(`/staff/assessments/${task.body.id}`).set(bearer(adminToken)).expect(204);
    });

    it('advertises the two audio types in the staff upload config', async () => {
      const config = await request(server()).get('/staff/uploads/config').set(bearer(assignedTaToken)).expect(200);
      expect(config.body.allowedMimeTypes).toEqual(expect.arrayContaining(['audio/mpeg', 'audio/mp4']));
      expect(config.body.allowedMimeTypes).not.toContain('image/svg+xml');
    });
  });

  describe('submission modes (D-31)', () => {
    const server = () => app.getHttpServer();
    const base = {
      title: 'E2E modes task',
      type: 'homework',
      availableFrom: '2026-01-01T00:00:00.000Z',
      availableTo: '2099-01-01T00:00:00.000Z',
      dueAt: '2098-01-01T00:00:00.000Z',
      maxScore: 10,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 1048576,
      targets: [{ groupId: 'group-1' }],
    };

    it('threads submissionModes through create and PATCH', async () => {
      const task = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...base, submissionModes: ['pdf_upload', 'photo_upload'] })
        .expect(201);
      expect(task.body.submissionModes).toEqual(['pdf_upload', 'photo_upload']);
      const patched = await request(server())
        .patch(`/staff/assessments/${task.body.id}`)
        .set(bearer(adminToken))
        .send({ submissionModes: [] })
        .expect(200);
      expect(patched.body.submissionModes).toEqual([]);
      await request(server()).delete(`/staff/assessments/${task.body.id}`).set(bearer(adminToken)).expect(204);
    });

    it.each([
      ['an unknown mode', ['fax']],
      ['a repeated mode', ['pdf_upload', 'pdf_upload']],
      ['null', null],
      ['a string', 'pdf_upload'],
    ])('refuses %s with 400', async (_label, submissionModes) => {
      await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({ ...base, submissionModes })
        .expect(400);
    });
  });

  describe('the staff task status (D-30)', () => {
    const server = () => app.getHttpServer();

    it('keeps a task open until every group is past its own due date (D-35)', async () => {
      const task = await request(server())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({
          title: 'E2E mixed due',
          type: 'homework',
          availableFrom: '2026-01-01T00:00:00.000Z',
          availableTo: '2099-01-01T00:00:00.000Z',
          dueAt: '2026-02-01T00:00:00.000Z',
          maxScore: 10,
          allowedFileTypes: ['application/pdf'],
          maxFileSizeBytes: 1048576,
          // group-1 inherits the past due date; the override is in the future.
          targets: [{ groupId: 'group-1', dueAt: '2098-01-01T00:00:00.000Z' }],
        })
        .expect(201);
      let res = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      expect(res.body.find((t: { id: string }) => t.id === task.body.id).status).toBe('open');

      // Move the override into the past too: every group is now past due and
      // nothing was submitted.
      await request(server())
        .post(`/staff/assessments/${task.body.id}/targets`)
        .set(bearer(adminToken))
        .send({ targets: [{ groupId: 'group-1', dueAt: '2026-03-01T00:00:00.000Z' }] })
        .expect(201);
      res = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      expect(res.body.find((t: { id: string }) => t.id === task.body.id).status).toBe('closed');
      await request(server()).delete(`/staff/assessments/${task.body.id}`).set(bearer(adminToken)).expect(204);
    });
    it('derives status on GET /staff/tasks and filters by it; never null', async () => {
      const all = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      const statusOf = (id: string) => all.body.find((t: { id: string }) => t.id === id)?.status;
      expect(statusOf('assess-3')).toBe('marked');
      expect(statusOf('assess-2')).toBe('closed');
      expect(all.body.every((t: { status: string | null }) => typeof t.status === 'string')).toBe(true);
      for (const status of ['open', 'marking', 'marked', 'closed']) {
        const res = await request(server()).get(`/staff/tasks?status=${status}`).set(bearer(adminToken)).expect(200);
        expect(res.body.every((t: { status: string }) => t.status === status)).toBe(true);
      }
      // `D-34`: past due, nothing submitted.
      const closed = await request(server()).get('/staff/tasks?status=closed').set(bearer(adminToken)).expect(200);
      expect(closed.body.map((t: { id: string }) => t.id)).toContain('assess-2');
      // No per-row counts ride along (D-30).
      expect(Object.keys(all.body[0])).not.toEqual(expect.arrayContaining(['submittedCount']));
    });

    it('refuses a status that is not one of the three, and never takes one on a write', async () => {
      await request(server()).get('/staff/tasks?status=archived').set(bearer(adminToken)).expect(400);
      // A client status on PATCH is stripped, not honoured: the response still
      // carries no stored status field at all.
      const patched = await request(server())
        .patch('/staff/assessments/assess-1')
        .set(bearer(adminToken))
        .send({ status: 'marked' })
        .expect(200);
      expect(patched.body.status).toBeUndefined();
    });
  });

  /**
   * Review round 1 (`docs/phases/unit-6/REVIEW.md`): `F-1`, `F-2`, `F-3`
   * (`D-36`), deviation 3 (`D-37`).
   */
  describe('review round 1', () => {
    const server = () => app.getHttpServer();
    const base = {
      type: 'homework',
      availableFrom: '2026-01-01T00:00:00.000Z',
      availableTo: '2099-01-01T00:00:00.000Z',
      dueAt: '2098-01-01T00:00:00.000Z',
      maxScore: 10,
      allowedFileTypes: ['application/pdf'],
      maxFileSizeBytes: 1048576,
    };
    const create = async (token: string, body: object) =>
      (
        await request(server())
          .post('/staff/courses/course-1/assessments')
          .set(bearer(token))
          .send({ ...base, ...body })
          .expect(201)
      ).body as { id: string };
    const newGroup = async (name: string) =>
      (
        await request(server())
          .post('/admin/groups')
          .set(bearer(adminToken))
          .send({ name, courseId: 'course-1' })
          .expect(201)
      ).body.id as string;
    /** No route creates an external result without Google; seed the mirror directly. */
    const syncResult = (assessmentId: string) =>
      app.get<WorkRepository>(WORK_REPOSITORY).replaceResults(assessmentId, 'google_form', [
        {
          assessmentId,
          provider: 'google_form',
          externalId: `e2e-${assessmentId}`,
          studentId: 'student-1',
          respondentId: 'student@example.com',
          score: null,
          maxScore: null,
          submittedAt: '2026-09-20T10:00:00.000Z',
          raw: {},
        },
      ]);

    it('F-1: a drifted task saves a title-only edit that re-sends the unchanged marker; the marker is kept', async () => {
      const group3 = await newGroup('E2E - F-1 cohort');
      const task = await create(adminToken, { title: 'E2E F-1', targets: [{ groupId: 'group-1' }], markerId: 'assistant-1' });
      await request(server())
        .post(`/staff/assessments/${task.id}/targets`)
        .set(bearer(adminToken))
        .send({ targets: [{ groupId: 'group-1' }, { groupId: group3 }] })
        .expect(201);
      const saved = await request(server())
        .patch(`/staff/assessments/${task.id}`)
        .set(bearer(adminToken))
        .send({ title: 'E2E F-1, typo fixed', markerId: 'assistant-1' })
        .expect(200);
      expect(saved.body.markerId).toBe('assistant-1');
      const list = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      expect(list.body.find((t: { id: string }) => t.id === task.id).markerDrift).toBe(true);
    });

    it('F-2: a retained group keeps its window override when another group is added', async () => {
      const group3 = await newGroup('E2E - F-2 cohort');
      const task = await create(adminToken, {
        title: 'E2E F-2',
        targets: [{ groupId: 'group-1', dueAt: '2098-06-01T00:00:00.000Z' }],
      });
      // What the edit form now sends: the retained group WITH its override, the
      // added group bare.
      const list = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      const retained = list.body
        .find((t: { id: string }) => t.id === task.id)
        .targets.map((t: { groupId: string; availableFrom: string | null; availableTo: string | null; dueAt: string | null }) => ({
          groupId: t.groupId,
          ...(t.availableFrom ? { availableFrom: t.availableFrom } : {}),
          ...(t.availableTo ? { availableTo: t.availableTo } : {}),
          ...(t.dueAt ? { dueAt: t.dueAt } : {}),
        }));
      const res = await request(server())
        .post(`/staff/assessments/${task.id}/targets`)
        .set(bearer(adminToken))
        .send({ targets: [...retained, { groupId: group3 }] })
        .expect(201);
      const group1 = res.body.targets.find((t: { groupId: string }) => t.groupId === 'group-1');
      expect(group1.dueAt).toBe('2098-06-01T00:00:00.000Z');
      expect(res.body.targets.find((t: { groupId: string }) => t.groupId === group3).dueAt).toBeNull();
    });

    it('F-3 / D-36: hide and delete are refused (409) once a result has synced, and allowed before', async () => {
      const answered = await create(adminToken, { title: 'E2E answered form', targets: [{ groupId: 'group-1' }] });
      await syncResult(answered.id);
      const hide = await request(server())
        .patch(`/staff/assessments/${answered.id}`)
        .set(bearer(adminToken))
        .send({ visibility: 'hidden' })
        .expect(409);
      expect(hide.body.message).toMatch(/already answered/);
      const del = await request(server()).delete(`/staff/assessments/${answered.id}`).set(bearer(adminToken)).expect(409);
      expect(del.body.message).toMatch(/cannot be deleted/);

      const quiet = await create(adminToken, { title: 'E2E unanswered form', targets: [{ groupId: 'group-1' }] });
      await request(server())
        .patch(`/staff/assessments/${quiet.id}`)
        .set(bearer(adminToken))
        .send({ visibility: 'hidden' })
        .expect(200);
      await request(server()).delete(`/staff/assessments/${quiet.id}`).set(bearer(adminToken)).expect(204);
    });

    it('D-37: scheduled follows the earliest group opening, counting a per-group override', async () => {
      const group3 = await newGroup('E2E - D-37 cohort');
      const task = await create(adminToken, {
        title: 'E2E D-37',
        availableFrom: '2098-01-01T00:00:00.000Z',
        dueAt: '2098-06-01T00:00:00.000Z',
        targets: [{ groupId: 'group-1' }, { groupId: group3, availableFrom: '2026-01-01T00:00:00.000Z' }],
      });
      let list = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      expect(list.body.find((t: { id: string }) => t.id === task.id).visibilityState).toBe('published');

      // Move group-3's opening into the future too: every group now opens later.
      await request(server())
        .post(`/staff/assessments/${task.id}/targets`)
        .set(bearer(adminToken))
        .send({ targets: [{ groupId: 'group-1' }, { groupId: group3, availableFrom: '2098-02-01T00:00:00.000Z' }] })
        .expect(201);
      list = await request(server()).get('/staff/tasks').set(bearer(adminToken)).expect(200);
      expect(list.body.find((t: { id: string }) => t.id === task.id).visibilityState).toBe('scheduled');
    });
  });

  describe('R1-1 (re-check 1): an assistant re-sending the current marker', () => {
    it('is a no-op 200; a different marker is still 403', async () => {
      const task = await request(app.getHttpServer())
        .post('/staff/courses/course-1/assessments')
        .set(bearer(adminToken))
        .send({
          title: 'E2E R1-1',
          type: 'homework',
          availableFrom: '2026-01-01T00:00:00.000Z',
          availableTo: '2099-01-01T00:00:00.000Z',
          dueAt: '2098-01-01T00:00:00.000Z',
          maxScore: 10,
          allowedFileTypes: ['application/pdf'],
          maxFileSizeBytes: 1048576,
          targets: [{ groupId: 'group-1' }],
          markerId: 'assistant-1',
        })
        .expect(201);
      const same = await request(app.getHttpServer())
        .patch(`/staff/assessments/${task.body.id}`)
        .set(bearer(assignedTaToken))
        .send({ title: 'E2E R1-1 edited', markerId: 'assistant-1' })
        .expect(200);
      expect(same.body.markerId).toBe('assistant-1');
      await request(app.getHttpServer())
        .patch(`/staff/assessments/${task.body.id}`)
        .set(bearer(assignedTaToken))
        .send({ markerId: 'teacher-1' })
        .expect(403);
      await request(app.getHttpServer()).delete(`/staff/assessments/${task.body.id}`).set(bearer(adminToken)).expect(204);
    });
  });

  /**
   * Unit 7 fixtures: group-3 on course-1 holding student-2 (who also sits in
   * group-1), a task set for group-1 with student-1's submission, and a task
   * set for group-3 ONLY with student-2's. assistant-1 holds group-1: the
   * group-3 paper is out of their reach even though its student sits in a
   * group they hold, because the task was never set for that group.
   */
  const unit7 = {
    group3: '',
    g1Task: '',
    g3Task: '',
    mine: '',
    theirs: '',
    student2Token: '',
  };
  const unit7Task = {
    type: 'homework',
    availableFrom: '2026-01-01T00:00:00.000Z',
    availableTo: '2099-01-01T00:00:00.000Z',
    dueAt: '2098-01-01T00:00:00.000Z',
    maxScore: 20,
    allowedFileTypes: ['application/pdf'],
    maxFileSizeBytes: 1048576,
  };
  async function unit7Setup(label: string) {
    const server = app.getHttpServer();
    const group3 = (
      await request(server).post('/admin/groups').set(bearer(adminToken))
        .send({ name: `E2E unit 7 group 3 (${label})`, courseId: 'course-1' }).expect(201)
    ).body.id as string;
    await request(server).post(`/staff/groups/${group3}/members`).set(bearer(adminToken))
      .send({ studentId: 'student-2' }).expect(201);
    // Earlier describes in this file remove both students from group-1 (AUTH-3,
    // D-10); placing them back is idempotent, and makes the fixture explicit.
    for (const studentId of ['student-1', 'student-2']) {
      await request(server).post('/staff/groups/group-1/members').set(bearer(adminToken))
        .send({ studentId }).expect(201);
    }
    const g1Task = (
      await request(server).post('/staff/courses/course-1/assessments').set(bearer(adminToken))
        .send({ ...unit7Task, title: `E2E unit 7 group-1 task (${label})`, targets: [{ groupId: 'group-1' }] }).expect(201)
    ).body.id as string;
    const g3Task = (
      await request(server).post('/staff/courses/course-1/assessments').set(bearer(adminToken))
        .send({ ...unit7Task, title: `E2E unit 7 group-3 task (${label})`, targets: [{ groupId: group3 }] }).expect(201)
    ).body.id as string;
    const student2Token = (
      await request(server).post('/auth/login').send({ email: 'student2@example.com', password: 'password123' }).expect(200)
    ).body.accessToken as string;
    const mine = (
      await request(server).post(`/assessments/${g1Task}/submissions`).set(bearer(studentToken))
        .send({ answerText: 'student-1 work' }).expect(201)
    ).body.id as string;
    const theirs = (
      await request(server).post(`/assessments/${g3Task}/submissions`).set(bearer(student2Token))
        .send({ answerText: 'student-2 work' }).expect(201)
    ).body.id as string;
    Object.assign(unit7, { group3, g1Task, g3Task, mine, theirs, student2Token });
  }

  describe('unit 7: return, and saved is not returned (MARK-2)', () => {
    const server = () => app.getHttpServer();
    beforeAll(() => unit7Setup('return'));

    it('refuses to return unmarked work with 409', async () => {
      const res = await request(server()).post(`/staff/submissions/${unit7.mine}/return`).set(bearer(adminToken)).expect(409);
      expect(res.body.message).toBe('Enter a mark before returning this work.');
    });

    it('404s an out-of-scope paper with a body equal to a missing one, for both scoped assistants', async () => {
      const gone = await request(server()).post('/staff/submissions/nope/return').set(bearer(assignedTaToken)).expect(404);
      const unheld = await request(server()).post(`/staff/submissions/${unit7.theirs}/return`).set(bearer(assignedTaToken)).expect(404);
      const nothing = await request(server()).post(`/staff/submissions/${unit7.mine}/return`).set(bearer(unassignedTaToken)).expect(404);
      expect(gone.body.message).toBe('Submission not found');
      expect(JSON.stringify(unheld.body) === JSON.stringify(gone.body)).toBe(true);
      expect(JSON.stringify(nothing.body) === JSON.stringify(gone.body)).toBe(true);
    });

    it('refuses a student token', async () => {
      await request(server()).post(`/staff/submissions/${unit7.mine}/return`).set(bearer(studentToken)).expect(403);
    });

    it('proves the whole path: a saved mark is invisible to the student until returned, then visible and audited', async () => {
      await request(server()).post(`/staff/submissions/${unit7.mine}/grade`).set(bearer(assignedTaToken))
        .send({ score: 18, feedback: 'Well argued' }).expect(200);

      const before = await request(server()).get(`/assessments/${unit7.g1Task}`).set(bearer(studentToken)).expect(200);
      expect(before.body.status).toBe('submitted');
      expect(before.body.score).toBeNull();
      expect(before.body.submission).toMatchObject({ score: null, feedback: null, returnedAt: null });
      const listBefore = await request(server()).get('/courses/course-1/assessments').set(bearer(studentToken)).expect(200);
      expect(listBefore.body.find((a: { id: string }) => a.id === unit7.g1Task)).toMatchObject({ status: 'submitted', score: null });

      const returned = await request(server()).post(`/staff/submissions/${unit7.mine}/return`).set(bearer(assignedTaToken)).expect(200);
      expect(returned.body.returnedAt).not.toBeNull();
      expect(returned.body).toMatchObject({ score: 18, status: 'graded' });

      const after = await request(server()).get(`/assessments/${unit7.g1Task}`).set(bearer(studentToken)).expect(200);
      expect(after.body.status).toBe('corrected');
      expect(after.body.submission).toMatchObject({ score: 18, feedback: 'Well argued', returnedAt: returned.body.returnedAt });
      const listAfter = await request(server()).get('/courses/course-1/assessments').set(bearer(studentToken)).expect(200);
      expect(listAfter.body.find((a: { id: string }) => a.id === unit7.g1Task)).toMatchObject({ status: 'corrected', score: 18 });

      // A second return is a no-op: same time, and no second entry.
      const again = await request(server()).post(`/staff/submissions/${unit7.mine}/return`).set(bearer(adminToken)).expect(200);
      expect(again.body.returnedAt).toBe(returned.body.returnedAt);

      const log = await request(server()).get(`/admin/audit-log?action=submission.returned&targetId=${unit7.mine}`)
        .set(bearer(adminToken)).expect(200);
      expect(log.body.entries).toHaveLength(1);
      expect(log.body.entries[0]).toMatchObject({ actorId: 'assistant-1', actorRole: 'assistant', targetType: 'assessment_submission' });
    });

    it('lets the full admin return any paper', async () => {
      await request(server()).post(`/staff/submissions/${unit7.theirs}/grade`).set(bearer(fullAdminToken)).send({ score: 9 }).expect(200);
      const res = await request(server()).post(`/staff/submissions/${unit7.theirs}/return`).set(bearer(fullAdminToken)).expect(200);
      expect(res.body.returnedAt).not.toBeNull();
    });
  });

  describe('unit 7: the per-task queue (MARK-3)', () => {
    const server = () => app.getHttpServer();
    let shared = '';
    beforeAll(async () => {
      await unit7Setup('queue');
      shared = (
        await request(server()).post('/staff/courses/course-1/assessments').set(bearer(adminToken))
          .send({ ...unit7Task, title: 'E2E unit 7 shared task', targets: [{ groupId: 'group-1' }, { groupId: unit7.group3 }] }).expect(201)
      ).body.id;
    });

    it.each([
      ['the teacher', () => adminToken],
      ['the full admin', () => fullAdminToken],
    ])('shows %s every targeted student, non-submitters included', async (_l, token) => {
      const res = await request(server()).get(`/staff/assessments/${shared}/submissions`).set(bearer(token())).expect(200);
      const ids = res.body.rows.map((r: { studentId: string }) => r.studentId).sort();
      expect(ids).toEqual(['student-1', 'student-2']);
      expect(res.body.rows.every((r: { status: string }) => r.status === 'not_submitted')).toBe(true);
      expect(res.body.groups.map((g: { groupId: string }) => g.groupId).sort()).toEqual(['group-1', unit7.group3].sort());
      // Name, never email.
      expect(JSON.stringify(res.body)).not.toContain('@example.com');
    });

    it('narrows assistant-1 to group-1: no group-3 id or name anywhere', async () => {
      const res = await request(server()).get(`/staff/assessments/${shared}/submissions`).set(bearer(assignedTaToken)).expect(200);
      expect(res.body.groups.map((g: { groupId: string }) => g.groupId)).toEqual(['group-1']);
      expect(res.body.rows.every((r: { groupId: string }) => r.groupId === 'group-1')).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(unit7.group3);
    });

    it('404s a group-3-only task for assistant-1 and any task for assistant-2, equal to a missing id', async () => {
      const gone = await request(server()).get('/staff/assessments/nope/submissions').set(bearer(assignedTaToken)).expect(404);
      const unheld = await request(server()).get(`/staff/assessments/${unit7.g3Task}/submissions`).set(bearer(assignedTaToken)).expect(404);
      const nothing = await request(server()).get(`/staff/assessments/${shared}/submissions`).set(bearer(unassignedTaToken)).expect(404);
      expect(gone.body.message).toBe('Assessment not found');
      expect(JSON.stringify(unheld.body) === JSON.stringify(gone.body)).toBe(true);
      expect(JSON.stringify(nothing.body) === JSON.stringify(gone.body)).toBe(true);
    });

    it('refuses a student token, and requires a token', async () => {
      await request(server()).get(`/staff/assessments/${shared}/submissions`).set(bearer(studentToken)).expect(403);
      await request(server()).get(`/staff/assessments/${shared}/submissions`).expect(401);
    });

    it('answers 409 for a link task', async () => {
      const link = (
        await request(server()).post('/staff/courses/course-1/assessments').set(bearer(adminToken))
          .send({ ...unit7Task, title: 'E2E unit 7 link', workType: 'link', externalUrl: 'https://example.com/work', targets: [{ groupId: 'group-1' }] }).expect(201)
      ).body.id;
      const res = await request(server()).get(`/staff/assessments/${link}/submissions`).set(bearer(adminToken)).expect(409);
      expect(res.body.message).toMatch(/not handed in here/);
    });
  });

  describe('unit 7: annotations (MARK-1, D-42)', () => {
    const server = () => app.getHttpServer();
    const PHOTO = '/uploads/bbbbbbbb-0000-4000-8000-000000000001.png';
    const tick = { fileUrl: PHOTO, page: 1, kind: 'tick', xPercent: 12.5, yPercent: 40 };
    let paper = '';
    let unheldPaper = '';
    beforeAll(async () => {
      await unit7Setup('annotations');
      // The student upload route is slice 7i; here the paper's file is placed
      // through the repository so these cases test the annotation routes alone.
      const repo = app.get<AssessmentRepository>(ASSESSMENT_REPOSITORY);
      const file = [{ url: PHOTO, mimeType: 'image/png', sizeBytes: 10 }];
      await repo.updateSubmission(unit7.mine, 'student-1', null, undefined, file);
      await repo.updateSubmission(unit7.theirs, 'student-2', null, undefined, file);
      paper = unit7.mine;
      unheldPaper = unit7.theirs;
    });

    it('lets assistant-1 draw on a group-1 paper and the teacher see it with the author name', async () => {
      const created = await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(assignedTaToken)).send(tick).expect(201);
      expect(created.body).toMatchObject({ kind: 'tick', xPercent: 12.5, createdBy: 'assistant-1', createdByName: 'Nour Hassan' });
      const list = await request(server()).get(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).toContain(created.body.id);
    });

    it('persists a stroke and moves and erases one\'s own mark', async () => {
      const stroke = await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken))
        .send({ ...tick, kind: 'highlight', path: [[10, 10], [20, 12], [30, 14]] }).expect(201);
      expect(stroke.body.path).toEqual([[10, 10], [20, 12], [30, 14]]);
      const moved = await request(server()).patch(`/staff/submissions/${paper}/annotations/${stroke.body.id}`).set(bearer(adminToken))
        .send({ yPercent: 50, kind: 'tick' }).expect(200);
      // `kind` is stripped by the whitelist, never applied.
      expect(moved.body).toMatchObject({ kind: 'highlight', yPercent: 50 });
      await request(server()).delete(`/staff/submissions/${paper}/annotations/${stroke.body.id}`).set(bearer(adminToken)).expect(204);
      const log = await request(server()).get(`/admin/audit-log?action=submission.annotated&targetId=${paper}`).set(bearer(adminToken)).expect(200);
      expect(log.body.entries.length).toBeGreaterThanOrEqual(3);
    });

    it('refuses to let assistant-1 erase the teacher\'s mark (403), and the mark survives', async () => {
      const teachers = await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).send(tick).expect(201);
      const res = await request(server()).delete(`/staff/submissions/${paper}/annotations/${teachers.body.id}`).set(bearer(assignedTaToken)).expect(403);
      expect(res.body.message).toBe('You can only change or erase your own marks.');
      await request(server()).patch(`/staff/submissions/${paper}/annotations/${teachers.body.id}`).set(bearer(assignedTaToken)).send({ xPercent: 1 }).expect(403);
      const list = await request(server()).get(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).toContain(teachers.body.id);
    });

    it('404s a mark id from another paper exactly like a missing one', async () => {
      const elsewhere = await request(server()).post(`/staff/submissions/${unheldPaper}/annotations`).set(bearer(adminToken)).send(tick).expect(201);
      const gone = await request(server()).delete(`/staff/submissions/${paper}/annotations/nope`).set(bearer(adminToken)).expect(404);
      const wrong = await request(server()).delete(`/staff/submissions/${paper}/annotations/${elsewhere.body.id}`).set(bearer(adminToken)).expect(404);
      expect(gone.body.message).toBe('Annotation not found');
      expect(JSON.stringify(wrong.body) === JSON.stringify(gone.body)).toBe(true);
    });

    it.each([
      ['GET', 'get', '', undefined],
      ['POST', 'post', '', tick],
      ['PATCH', 'patch', '/some-id', { xPercent: 1 }],
      ['DELETE', 'delete', '/some-id', undefined],
    ] as const)('%s: an out-of-scope paper is a 404 equal to a missing submission, for both scoped assistants', async (_l, method, suffix, body) => {
      const call = (id: string, token: string) => {
        const req = request(server())[method](`/staff/submissions/${id}/annotations${suffix}`).set(bearer(token));
        return (body ? req.send(body) : req).expect(404);
      };
      const gone = await call('nope', assignedTaToken);
      expect(gone.body.message).toBe('Submission not found');
      expect(JSON.stringify((await call(unheldPaper, assignedTaToken)).body) === JSON.stringify(gone.body)).toBe(true);
      expect(JSON.stringify((await call(paper, unassignedTaToken)).body) === JSON.stringify(gone.body)).toBe(true);
    });

    it('refuses a student token on every annotation route', async () => {
      await request(server()).get(`/staff/submissions/${paper}/annotations`).set(bearer(studentToken)).expect(403);
      await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(studentToken)).send(tick).expect(403);
      await request(server()).delete(`/staff/submissions/${paper}/annotations/x`).set(bearer(studentToken)).expect(403);
    });

    it('validates the body: an eraser kind, a bad point, a file not on the paper', async () => {
      await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).send({ ...tick, kind: 'eraser' }).expect(400);
      await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).send({ ...tick, kind: 'pen', path: [[1, 1], [1, 200]] }).expect(400);
      const res = await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).send({ ...tick, fileUrl: '/uploads/elsewhere.png' }).expect(400);
      expect(res.body.message).toBe('That file is not part of this submission.');
    });

    it('D-42 (b): allows marking up a returned paper', async () => {
      await request(server()).post(`/staff/submissions/${paper}/grade`).set(bearer(adminToken)).send({ score: 12 }).expect(200);
      await request(server()).post(`/staff/submissions/${paper}/return`).set(bearer(adminToken)).expect(200);
      await request(server()).post(`/staff/submissions/${paper}/annotations`).set(bearer(adminToken)).send(tick).expect(201);
    });
  });

  describe('unit 7: the student reads the marks on a returned paper (MARK-5)', () => {
    const server = () => app.getHttpServer();
    const PHOTO = '/uploads/cccccccc-0000-4000-8000-000000000001.png';
    let shared = '';
    let s1Sub = '';
    beforeAll(async () => {
      await unit7Setup('student marks');
      shared = (
        await request(server()).post('/staff/courses/course-1/assessments').set(bearer(adminToken))
          .send({ ...unit7Task, title: 'E2E unit 7 student marks', targets: [{ groupId: 'group-1' }] }).expect(201)
      ).body.id;
      s1Sub = (
        await request(server()).post(`/assessments/${shared}/submissions`).set(bearer(studentToken)).send({ answerText: 'mine' }).expect(201)
      ).body.id;
      await request(server()).post(`/assessments/${shared}/submissions`).set(bearer(unit7.student2Token)).send({ answerText: 'theirs' }).expect(201);
      await app.get<AssessmentRepository>(ASSESSMENT_REPOSITORY).updateSubmission(
        s1Sub, 'student-1', null, undefined, [{ url: PHOTO, mimeType: 'image/png', sizeBytes: 1 }],
      );
      await request(server()).post(`/staff/submissions/${s1Sub}/annotations`).set(bearer(assignedTaToken))
        .send({ fileUrl: PHOTO, page: 1, kind: 'comment', xPercent: 5, yPercent: 5, text: 'Show working' }).expect(201);
      await request(server()).post(`/staff/submissions/${s1Sub}/grade`).set(bearer(assignedTaToken)).send({ score: 11 }).expect(200);
    });

    it('shows no marks before return, then the marks without their author', async () => {
      const before = await request(server()).get(`/assessments/${shared}`).set(bearer(studentToken)).expect(200);
      expect(before.body.submission.annotations).toEqual([]);
      await request(server()).post(`/staff/submissions/${s1Sub}/return`).set(bearer(assignedTaToken)).expect(200);
      const after = await request(server()).get(`/assessments/${shared}`).set(bearer(studentToken)).expect(200);
      expect(after.body.submission.annotations).toHaveLength(1);
      expect(after.body.submission.annotations[0]).toMatchObject({ kind: 'comment', text: 'Show working' });
      const wire = JSON.stringify(after.body.submission.annotations);
      expect(wire).not.toContain('assistant-1');
      expect(wire).not.toContain('Nour Hassan');
    });

    it('gives student-2 on the same task only their own (unmarked) paper', async () => {
      // There is no route by which a student names a submission id: the
      // detail resolves "mine" from the token.
      const res = await request(server()).get(`/assessments/${shared}`).set(bearer(unit7.student2Token)).expect(200);
      expect(res.body.submission.id).not.toBe(s1Sub);
      expect(res.body.submission.annotations).toEqual([]);
      expect(res.body.submission.score).toBeNull();
    });
  });
});
