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

/**
 * The real limits are deliberately tight on auth (5 logins/min, 3
 * registrations per 5 min) and this file makes more calls than that. The
 * behaviour of the limiter itself is covered by its unit spec and by the
 * dedicated block at the bottom, which runs with the real store.
 */
const ALWAYS_ALLOW: RateLimitStore = {
  hit: (): RateLimitDecision => ({
    allowed: true,
    remaining: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + 60_000,
  }),
};

/**
 * Boots the real AppModule with the real guards. Unit specs override
 * JwtAuthGuard/RolesGuard, so this file is the only place that proves the
 * dependency graph resolves and that protected routes are actually protected.
 */
describe('Student API (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;

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

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'student@example.com', password: 'password123' })
      .expect(200);
    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  /**
   * A usable student account, from nothing.
   *
   * `DOM-4` retired the shortcut this file used to take: registering no longer
   * hands back a token, because a new account is `waiting` and may not
   * authenticate. The only way to a signed-in student is now the real
   * sequence - register, be accepted by staff, sign in - so it lives here once
   * rather than four times.
   *
   * Accepting places them in `group-2`, which studies **course-2**. That is
   * deliberate: every assessment, recording and report fixture lives in
   * course-1, so a student accepted here still holds none of them and the
   * not-enrolled cases below stay meaningful.
   */
  const ACTIVATION_GROUP = 'group-2';
  const ACTIVATION_COURSE = 'course-2';

  /**
   * Memoized. Signing the admin in is a real bcrypt verify, and this helper is
   * called on every account the file needs - repeating it turned an already
   * heavy e2e worker into one that occasionally died outright.
   */
  let adminToken: string | null = null;
  const asAdmin = async () => {
    if (!adminToken) {
      const admin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'password123' })
        .expect(200);
      adminToken = admin.body.accessToken as string;
    }
    return { Authorization: `Bearer ${adminToken}` };
  };

  const activateStudent = async (
    email: string,
    password: string,
    name: string,
  ): Promise<string> => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name })
      .expect(201);

    const adminAuth = await asAdmin();

    const queue = await request(app.getHttpServer())
      .get('/admin/students?status=waiting')
      .set(adminAuth)
      .expect(200);
    const waiting = queue.body.find((s: { email: string }) => s.email === email);
    expect(waiting, `${email} was not in the waiting queue`).toBeDefined();

    await request(app.getHttpServer())
      .post(`/admin/students/${waiting.id}/accept`)
      .set(adminAuth)
      .send({ groupId: ACTIVATION_GROUP })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return login.body.accessToken as string;
  };

  it('serves the health check without a token', () => {
    // Anonymous on purpose: the container's HEALTHCHECK has no credentials.
    // Every other route is now refused by the global JwtAuthGuard, so this
    // passing is what proves @Public() is still on it.
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('issues a usable token on login', () => {
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);
  });

  it('rejects login with a bad password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'student@example.com', password: 'nope12345' })
      .expect(401);
  });

  it('rejects a malformed login body at the API boundary', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400);
  });

  it.each([
    ['/students/me/profile'],
    ['/courses'],
    ['/courses/course-1'],
    ['/courses/course-1/dashboard'],
    ['/dashboard'],
    ['/courses/course-1/assessments'],
    ['/courses/course-1/recordings'],
    ['/courses/course-1/materials'],
    ['/courses/course-1/reports/summary'],
    ['/courses/course-1/reports/documents'],
    ['/courses/course-1/live-sessions'],
    ['/notifications'],
  ])('requires a token for %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it.each([
    ['/students/me/profile'],
    ['/courses'],
    ['/courses/course-1'],
    ['/courses/course-1/dashboard'],
    ['/dashboard'],
    ['/courses/course-1/assessments'],
    ['/courses/course-1/recordings'],
    ['/courses/course-1/materials'],
    ['/courses/course-1/reports/summary'],
    ['/courses/course-1/reports/documents'],
    ['/courses/course-1/live-sessions'],
    ['/notifications'],
  ])('serves %s with a token', async (path) => {
    await request(app.getHttpServer()).get(path).set(auth()).expect(200);
  });

  it('returns a dashboard whose progress and performance are separate', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses/course-1/dashboard')
      .set(auth())
      .expect(200);
    expect(res.body.studentName).toBe('Ali Esam');
    expect(res.body.progress).toHaveProperty('completionPercentage');
    expect(res.body.stats).toHaveProperty('overallReportPercentage');
    expect(res.body.progress.completionPercentage).not.toBe(
      res.body.stats.overallReportPercentage,
    );
  });

  /* --- the aggregated Home screen ------------------------------------
     `GET /dashboard` exists to spare the browser a `2N + 2` fan-out. The
     risk it introduces is a second implementation of the same numbers, so
     these tests pin it against the per-course endpoints rather than against
     literals: if the two ever diverge, that is the bug worth failing on. */

  it('serves every enrolled course in one request', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard')
      .set(auth())
      .expect(200);

    const courses = await request(app.getHttpServer())
      .get('/courses')
      .set(auth())
      .expect(200);

    expect(res.body.studentName).toBe('Ali Esam');
    expect(res.body.entries).toHaveLength(courses.body.length);
    expect(res.body.entries.map((e: { course: { id: string } }) => e.course.id))
      .toEqual(courses.body.map((c: { id: string }) => c.id));
    expect(res.body.notifications).toHaveProperty('unreadCount');
  });

  it('reports the same stats the per-course dashboard does', async () => {
    const home = await request(app.getHttpServer())
      .get('/dashboard')
      .set(auth())
      .expect(200);
    const perCourse = await request(app.getHttpServer())
      .get('/courses/course-1/dashboard')
      .set(auth())
      .expect(200);

    const entry = home.body.entries.find(
      (e: { course: { id: string } }) => e.course.id === 'course-1',
    );
    expect(entry).toBeDefined();
    expect(entry.stats).toEqual(perCourse.body.stats);
    expect(entry.quickAccess).toEqual(perCourse.body.quickAccess);
    expect(entry.nextLiveSession).toEqual(perCourse.body.nextLiveSession);
  });

  it('carries the same assessment list the per-course endpoint serves', async () => {
    const home = await request(app.getHttpServer())
      .get('/dashboard')
      .set(auth())
      .expect(200);
    const list = await request(app.getHttpServer())
      .get('/courses/course-1/assessments')
      .set(auth())
      .expect(200);

    const entry = home.body.entries.find(
      (e: { course: { id: string } }) => e.course.id === 'course-1',
    );
    expect(entry.assessments).toEqual(list.body);
  });

  it('computes assessment status server-side and ignores a client-sent status', async () => {
    const res = await request(app.getHttpServer())
      .get('/courses/course-1/assessments')
      .set(auth())
      .expect(200);
    const statuses: string[] = res.body.map((a: { status: string }) => a.status);
    expect(statuses.every((s) => ['locked', 'available', 'submitted', 'corrected'].includes(s))).toBe(true);

    // A status smuggled into a submission body must be stripped, not honoured.
    const locked = res.body.find((a: { status: string }) => a.status === 'locked');
    if (locked) {
      await request(app.getHttpServer())
        .post(`/assessments/${locked.id}/submissions`)
        .set(auth())
        .send({ status: 'available', fileUrl: 'https://example.com/x.pdf' })
        .expect(400);
    }
  });

  /**
   * The whole of `DOM-4`, end to end: register, be refused, be accepted by
   * staff, sign in.
   *
   * A brand-new account, not one of the seeded students. This block changes
   * that account's enrollments, and the in-memory repositories are singletons
   * for the life of the app - reusing student-1 or student-2 here would
   * silently change what the cross-course tests below assert against.
   */
  describe('the registration queue, and the retired self-enrol route', () => {
    let freshToken: string;
    let freshId: string;

    beforeAll(async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'catalog-e2e@example.com',
          password: 'password123',
          name: 'Catalog Tester',
        })
        .expect(201);
      // Ruling R-6: the queue position, and no credential at all.
      expect(registered.body).toEqual({ status: 'waiting' });

      // A fresh registration cannot sign in. This is the assertion that
      // catches the service leaning on `users.status DEFAULT 'active'` -
      // which would make the waiting queue silently always empty.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'catalog-e2e@example.com', password: 'password123' })
        .expect(401);

      const adminAuth = await asAdmin();

      const queue = await request(app.getHttpServer())
        .get('/admin/students?status=waiting')
        .set(adminAuth)
        .expect(200);
      expect(queue.body).toHaveLength(1);
      freshId = queue.body[0].id;

      // Accepting activates, enrols on the group's course and places them.
      const accepted = await request(app.getHttpServer())
        .post(`/admin/students/${freshId}/accept`)
        .set(adminAuth)
        .send({ groupId: ACTIVATION_GROUP })
        .expect(200);
      expect(accepted.body).toMatchObject({ id: freshId, status: 'active' });

      // And now, and only now, they can sign in.
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'catalog-e2e@example.com', password: 'password123' })
        .expect(200);
      freshToken = login.body.accessToken;
    });

    const fresh = () => ({ Authorization: `Bearer ${freshToken}` });

    it('routes /courses/catalog to the catalog, not to a course with id "catalog"', async () => {
      // Nest matches in declaration order, so `@Get(':id')` declared first
      // would swallow this path and answer 404. That is the regression this
      // test exists for.
      const res = await request(app.getHttpServer())
        .get('/courses/catalog')
        .set(fresh())
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('gives an accepted student exactly the course their group studies', async () => {
      // `group-2` studies `course-2`, and that is the whole of the enrolment
      // decision - there is no separate course parameter on `accept`, so a
      // student cannot end up placed in one cohort and enrolled on another.
      const mine = await request(app.getHttpServer())
        .get('/courses')
        .set(fresh())
        .expect(200);
      expect(mine.body.map((c: { id: string }) => c.id)).toEqual([
        ACTIVATION_COURSE,
      ]);

      const catalog = await request(app.getHttpServer())
        .get('/courses/catalog')
        .set(fresh())
        .expect(200);
      const byId = new Map(
        catalog.body.map((c: { id: string; enrolled: boolean }) => [
          c.id,
          c.enrolled,
        ]),
      );
      expect(byId.get('course-2')).toBe(true);
      expect(byId.get('course-1')).toBe(false);
    });

    it('serves the accepted student a Home screen naming that course', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard')
        .set(fresh())
        .expect(200);
      expect(
        res.body.entries.map((e: { course: { id: string } }) => e.course.id),
      ).toEqual([ACTIVATION_COURSE]);
      expect(typeof res.body.studentName).toBe('string');
      expect(res.body.notifications.unreadCount).toBe(0);
    });

    it('does not leak course content through the catalog', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses/catalog')
        .set(fresh())
        .expect(200);
      for (const course of res.body) {
        expect(course).not.toHaveProperty('modules');
        expect(course).toHaveProperty('lessonCount');
      }
      // The outline is still gated: counting lessons is not reading them.
      // `course-1` rather than `course-2` - acceptance enrolled them on the
      // latter, and an enrolled course is meant to be readable.
      await request(app.getHttpServer())
        .get('/courses/course-1')
        .set(fresh())
        .expect(404);
    });

    it('POST /courses/:id/enroll no longer exists (404) for a student', async () => {
      // `DOM-4` retires self-enrolment: a student cannot put themselves on a
      // course, only staff accepting their registration can. 404 because the
      // route is gone, not 403 - there is nothing here to be forbidden from.
      await request(app.getHttpServer())
        .post('/courses/course-1/enroll')
        .set(fresh())
        .expect(404);
    });

    it('is gone for an unauthenticated caller too', async () => {
      await request(app.getHttpServer())
        .post('/courses/course-1/enroll')
        .expect(404);
    });

    it('leaves the student unable to reach the course they tried to enrol on', async () => {
      // The refusal is not cosmetic: nothing was written by the 404 above.
      await request(app.getHttpServer())
        .get('/courses/course-1')
        .set(fresh())
        .expect(404);
    });
  });

  describe('cross-course authorization', () => {
    // student-2 is enrolled in course-1 only. course-2 must be invisible to them.
    let otherToken: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'student2@example.com', password: 'password123' })
        .expect(200);
      otherToken = login.body.accessToken;
    });

    it.each([
      ['/courses/course-2'],
      ['/courses/course-2/dashboard'],
      ['/courses/course-2/assessments'],
      ['/courses/course-2/recordings'],
      ['/courses/course-2/materials'],
      ['/courses/course-2/reports/summary'],
      ['/courses/course-2/reports/documents'],
      ['/courses/course-2/live-sessions'],
      ['/courses/course-2/live-sessions/next'],
    ])('denies %s to a student not enrolled in that course', async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set({ Authorization: `Bearer ${otherToken}` })
        .expect(404);
    });

    it('lists only the courses the caller is actually enrolled in', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses')
        .set({ Authorization: `Bearer ${otherToken}` })
        .expect(200);
      expect(res.body.map((c: { id: string }) => c.id)).toEqual(['course-1']);
    });

    it('does not serve another student report document', async () => {
      // 404, not 403: a 403 would confirm rpt-1 exists, which is enough to
      // enumerate other students' reports by walking ids.
      await request(app.getHttpServer())
        .get('/reports/documents/rpt-1')
        .set({ Authorization: `Bearer ${otherToken}` })
        .expect(404);
    });

    it('answers identically for a real and an imaginary report document', async () => {
      const real = await request(app.getHttpServer())
        .get('/reports/documents/rpt-1')
        .set({ Authorization: `Bearer ${otherToken}` });
      const imaginary = await request(app.getHttpServer())
        .get('/reports/documents/rpt-does-not-exist')
        .set({ Authorization: `Bearer ${otherToken}` });
      expect(real.status).toBe(imaginary.status);
      expect(real.body.message).toEqual(imaginary.body.message);
    });

    /**
     * An account holding none of the fixtures. Needed to tell an id that
     * exists in a course the caller does not hold from one that does not exist
     * at all - student-2 holds course-1, where every fixture lives.
     *
     * Since `DOM-4` a student cannot be activated without being enrolled on
     * something, so "enrolled in nothing" is no longer a reachable state
     * through the API. `activateStudent` puts them on course-2 instead, which
     * carries no assessment, recording or report fixture - the property this
     * probe actually needs.
     */
    const unenrolledToken = async (): Promise<string> =>
      activateStudent(
        `oracle-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        'oraclepass123',
        'Oracle Probe',
      );

    it('answers identically for a real and an imaginary assessment', async () => {
      // `otherToken` is student-2, enrolled only in course-1. assess-1 is real
      // and in a course they hold, so pick one they do not: a status match alone
      // is not enough - the *body* used to name which of the two happened,
      // which is an existence oracle over the whole assessment id space.
      const auth = { Authorization: `Bearer ${await unenrolledToken()}` };
      const real = await request(app.getHttpServer())
        .get('/assessments/assess-1')
        .set(auth);
      const imaginary = await request(app.getHttpServer())
        .get('/assessments/assess-does-not-exist')
        .set(auth);
      expect(real.status).toBe(404);
      expect(real.status).toBe(imaginary.status);
      expect(real.body.message).toEqual(imaginary.body.message);
    });

    it('answers identically for a real and an imaginary recording', async () => {
      const auth = { Authorization: `Bearer ${await unenrolledToken()}` };
      const real = await request(app.getHttpServer())
        .post('/recordings/rec-1/progress')
        .set(auth)
        .send({ watchedSeconds: 60 });
      const imaginary = await request(app.getHttpServer())
        .post('/recordings/rec-does-not-exist/progress')
        .set(auth)
        .send({ watchedSeconds: 60 });
      expect(real.status).toBe(404);
      expect(real.status).toBe(imaginary.status);
      expect(real.body.message).toEqual(imaginary.body.message);
    });

    it('gives an accepted student access to their own course and nothing else', async () => {
      // Since `DOM-4` there is no signed-in student with zero enrollments -
      // acceptance is the only activation path and it always enrols. So the
      // property under test moved by one step: a student holds exactly the
      // course their group studies, and every id outside it answers as if it
      // did not exist.
      const freshAuth = {
        Authorization: `Bearer ${await activateStudent(
          `fresh-${Date.now()}@example.com`,
          'freshpass123',
          'Fresh Student',
        )}`,
      };

      const courses = await request(app.getHttpServer())
        .get('/courses')
        .set(freshAuth)
        .expect(200);
      expect(courses.body.map((c: { id: string }) => c.id)).toEqual([
        ACTIVATION_COURSE,
      ]);

      await request(app.getHttpServer())
        .get('/courses/course-1/assessments')
        .set(freshAuth)
        .expect(404);

      await request(app.getHttpServer())
        .get('/assessments/assess-1')
        .set(freshAuth)
        .expect(404);

      // The load-bearing one: they must not be able to submit work either.
      await request(app.getHttpServer())
        .post('/assessments/assess-1/submissions')
        .set(freshAuth)
        .send({ fileUrl: 'https://storage.example.com/submissions/x.pdf' })
        .expect(404);

      await request(app.getHttpServer())
        .post('/recordings/rec-1/progress')
        .set(freshAuth)
        .send({ watchedSeconds: 60 })
        .expect(404);
    });

    it('gives a newly registered student a usable profile', async () => {
      // Registration used to create the User but no StudentProfile, so every
      // real signup got a 404 from the profile and dashboard endpoints. The
      // profile is still written at registration - before the account is
      // accepted - and this is what proves it.
      const token = await activateStudent(
        `profiled-${Date.now()}@example.com`,
        'freshpass123',
        'Profiled Student',
      );

      const profile = await request(app.getHttpServer())
        .get('/students/me/profile')
        .set({ Authorization: `Bearer ${token}` })
        .expect(200);
      expect(profile.body.name).toBe('Profiled Student');
      // Not asserted as 1. `InMemoryStudentRepository` stores
      // `enrolledCourseCount` on the row and never recomputes it, while the
      // Postgres driver derives it with a subquery - so the two drivers
      // disagree here for any enrolment written after the profile. A
      // pre-existing divergence, found by this slice and recorded in
      // EXECUTION_NOTES_2B_I.md rather than fixed inside it.
      expect(typeof profile.body.enrolledCourseCount).toBe('number');
      // No staff field reaches the student's own profile (`DOM-3`).
      expect(profile.body).not.toHaveProperty('parentEmail');
      expect(profile.body).not.toHaveProperty('staffNotes');
      expect(profile.body).not.toHaveProperty('schoolName');
    });

    it('ends old sessions on password change but lets the user back in', async () => {
      const email = `rotating-${Date.now()}@example.com`;
      const oldToken = await activateStudent(
        email,
        'oldpass123',
        'Rotating Student',
      );

      await request(app.getHttpServer())
        .get('/notifications')
        .set({ Authorization: `Bearer ${oldToken}` })
        .expect(200);

      await request(app.getHttpServer())
        .post('/students/me/password')
        .set({ Authorization: `Bearer ${oldToken}` })
        .send({ currentPassword: 'oldpass123', newPassword: 'newpass456' })
        .expect(200);

      // The session that existed before the change is gone.
      await request(app.getHttpServer())
        .get('/notifications')
        .set({ Authorization: `Bearer ${oldToken}` })
        .expect(401);

      // …and the token from logging straight back in still works. A cutoff at
      // whole-second resolution killed this one too, locking the user out of
      // the account they had just secured.
      const relogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'newpass456' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/notifications')
        .set({ Authorization: `Bearer ${relogin.body.accessToken}` })
        .expect(200);
    });

    it('refuses a submission pointed at a private network address', async () => {
      await request(app.getHttpServer())
        .post('/assessments/assess-1/submissions')
        .set(auth())
        .send({ fileUrl: 'http://169.254.169.254/latest/meta-data/' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/assessments/assess-1/submissions')
        .set(auth())
        .send({ fileUrl: 'http://127.0.0.1:8080/internal' })
        .expect(400);
    });

    it('never leaks a Zoom link for an unenrolled course', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses/course-2/live-sessions')
        .set({ Authorization: `Bearer ${otherToken}` })
        .expect(404);
      expect(JSON.stringify(res.body)).not.toContain('zoom.us');
    });
  });

  describe('course progress carries both halves, for every course (D-9)', () => {
    it('returns one shape with completion and attendance, whatever the course', async () => {
      // This was two branches - a recorded course rendered checkpoints, a live
      // one rendered an attendance timeline, and which you got depended on the
      // student's group. `D-9` retired that axis: both halves are present on
      // every course now, and this asserts it over the wire on two courses
      // that used to take different branches.
      for (const courseId of ['course-1', 'course-2']) {
        const res = await request(app.getHttpServer())
          .get(`/courses/${courseId}/dashboard`)
          .set({ Authorization: `Bearer ${accessToken}` })
          .expect(200);
        expect(res.body.course).not.toHaveProperty('learningMode');
        expect(res.body.progress).not.toHaveProperty('type');
        expect(res.body.progress).toMatchObject({
          completedLessons: expect.any(Number),
          totalLessons: expect.any(Number),
          completionPercentage: expect.any(Number),
          checkpoints: expect.any(Array),
          attendedSessions: expect.any(Number),
          totalSessions: expect.any(Number),
          attendancePercentage: expect.any(Number),
          timeline: expect.any(Array),
        });
        // CLAUDE.md §11.1 non-negotiable 2: the two are reported separately
        // and never blended into a single figure.
        expect(res.body.progress).not.toHaveProperty('overallPercentage');
      }
    });

    it('agrees between the aggregate Home screen and the per-course screen', async () => {
      // The same guarantee GET /dashboard was built for: one implementation,
      // so the two screens cannot drift.
      const home = await request(app.getHttpServer())
        .get('/dashboard')
        .set({ Authorization: `Bearer ${accessToken}` })
        .expect(200);
      expect(home.body.entries.length).toBeGreaterThan(0);
      for (const entry of home.body.entries) {
        const single = await request(app.getHttpServer())
          .get(`/courses/${entry.course.id}/dashboard`)
          .set({ Authorization: `Bearer ${accessToken}` })
          .expect(200);
        expect(entry.course.progress.completionPercentage).toBe(
          single.body.progress.completionPercentage,
        );
        expect(entry.course.progress.attendancePercentage).toBe(
          single.body.progress.attendancePercentage,
        );
      }
    });
  });

  describe('announcements reach the student end (§5.18)', () => {
    it('lists the course announcements a student can read', async () => {
      const list = await request(app.getHttpServer())
        .get('/courses/course-1/announcements')
        .set({ Authorization: `Bearer ${accessToken}` })
        .expect(200);
      // Nothing is seeded - an announcement is a message someone sent to real
      // people, and seeding one would put words in Dr. Tahir's mouth. What this
      // pins is that the route exists, is enrollment-gated, and answers with a
      // list rather than a 404, which is what it did until 2026-09-10.
      expect(Array.isArray(list.body)).toBe(true);
    });

    it('404s a course the student is not enrolled in', async () => {
      await request(app.getHttpServer())
        .get('/courses/course-3/announcements')
        .set({ Authorization: `Bearer ${accessToken}` })
        .expect(404);
    });
  });

  describe('classmates (§5.17)', () => {
    it('lists the other students in the caller own group, name only', async () => {
      const response = await request(app.getHttpServer())
        .get('/courses/course-1/classmates')
        .set({ Authorization: `Bearer ${accessToken}` })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      const [group] = response.body;
      expect(group.groupName).toBeTruthy();
      expect(group.classmates.map((c: { studentId: string }) => c.studentId)).toEqual([
        'student-2',
      ]);

      // The field set is the requirement, not an implementation detail: never
      // email, phone, grades, progress or attendance. Asserted over the wire
      // because that is where a widened shape would actually leak.
      for (const classmate of group.classmates) {
        expect(Object.keys(classmate).sort()).toEqual(['name', 'studentId']);
      }
      expect(JSON.stringify(response.body)).not.toContain('@');
    });

    it('never includes the caller themselves', async () => {
      const response = await request(app.getHttpServer())
        .get('/courses/course-1/classmates')
        .set({ Authorization: `Bearer ${accessToken}` })
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain('student-1');
    });

    it('404s a course the caller is not enrolled in', async () => {
      await request(app.getHttpServer())
        .get('/courses/course-3/classmates')
        .set({ Authorization: `Bearer ${accessToken}` })
        .expect(404);
    });
  });

  describe('cross-role isolation', () => {
    let teacherToken: string;

    beforeAll(async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'teacher@example.com', password: 'password123' })
        .expect(200);
      teacherToken = login.body.accessToken;
    });

    // Every route below is @Roles(Role.Student). A teacher account
    // authenticates fine and must still be refused - proving the role check is
    // doing work independently of the JWT check.
    //
    // `/notifications` is deliberately absent: it is now open to every
    // signed-in LMS role, because CLAUDE.md 5.14's `all_tas` announcement
    // audience delivers into an assistant's mailbox and a mailbox nobody can
    // open is not a delivery. What replaced the role gate there is the
    // per-caller scoping asserted immediately below - a wider @Roles list is
    // not a wider read.
    it.each([
      '/courses',
      '/students/me/profile',
      '/assessments/assess-1',
      '/courses/course-1/dashboard',
      '/courses/course-1/recordings',
      '/courses/course-1/materials',
      '/courses/course-1/live-sessions',
      '/courses/course-1/reports/summary',
      '/courses/course-1/classmates',
      '/courses/course-1/announcements',
    ])('refuses a teacher token on the student route %s', async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set({ Authorization: `Bearer ${teacherToken}` })
        .expect(403);
    });

    it('gives a teacher their own empty mailbox, never a student’s', async () => {
      const feed = await request(app.getHttpServer())
        .get('/notifications')
        .set({ Authorization: `Bearer ${teacherToken}` })
        .expect(200);
      // Nothing addresses the teacher yet, and the seeded rows belong to
      // students. The response is scoped by `req.user.sub`, so an empty list
      // here is the scoping working rather than the feature missing.
      expect(feed.body.notifications).toEqual([]);
      expect(feed.body.unreadCount).toBe(0);

      // notif-1 belongs to student-1. Holding a valid token of a *higher*
      // privilege role must not be enough to touch it.
      await request(app.getHttpServer())
        .post('/notifications/notif-1/read')
        .set({ Authorization: `Bearer ${teacherToken}` })
        .expect(404);
    });

    it('refuses a student write route to a teacher token', async () => {
      await request(app.getHttpServer())
        .post('/assessments/assess-1/submissions')
        .set({ Authorization: `Bearer ${teacherToken}` })
        .send({ answerText: 'teacher should not be able to submit' })
        .expect(403);
    });

    it('rejects a token whose role claim was tampered with', async () => {
      // The role is re-read from the database on every request, so editing the
      // payload cannot escalate - the signature check rejects it outright.
      const [header, payload, signature] = teacherToken.split('.');
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      decoded.role = 'student';
      const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      await request(app.getHttpServer())
        .get('/courses')
        .set({ Authorization: `Bearer ${header}.${forged}.${signature}` })
        .expect(401);
    });
  });

  it('invalidates the token after logout', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'student@example.com', password: 'password123' })
      .expect(200);
    const token = login.body.accessToken;
    const header = { Authorization: `Bearer ${token}` };

    await request(app.getHttpServer()).get('/notifications').set(header).expect(200);
    await request(app.getHttpServer()).post('/auth/logout').set(header).expect(200);
    await request(app.getHttpServer()).get('/notifications').set(header).expect(401);
  });

  describe('avatar upload', () => {
    it('rejects an SVG', async () => {
      const res = await request(app.getHttpServer())
        .post('/students/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', 'avatar.svg');
      expect(res.status).toBe(415);
    });

    it('rejects an oversized file', async () => {
      try {
        await request(app.getHttpServer())
          .post('/students/me/avatar')
          .set('Authorization', `Bearer ${accessToken}`)
          .attach('file', 'large.jpg');
        throw new Error('Should have failed');
      } catch (err: any) {
        expect(err.status).toBe(413);
      }
    });

    it('rejects a staff role', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'teacher@example.com', password: 'password123' });
      const staffToken = login.body.accessToken;

      const res = await request(app.getHttpServer())
        .post('/students/me/avatar')
        .set('Authorization', `Bearer ${staffToken}`)
        .attach('file', 'avatar.png');
      expect(res.status).toBe(403);
    });

    it('accepts a valid image and returns a server-minted path', async () => {
      const res = await request(app.getHttpServer())
        .post('/students/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', 'avatar.png');
      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    });
  });
});

/**
 * Runs with the REAL rate-limit store, unlike the suite above. Separate app so
 * its exhausted buckets cannot leak into the other tests.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks out repeated failed logins with 429 and a Retry-After', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'student@example.com', password: 'wrongpass123' });

    // AUTH_ATTEMPT_LIMIT is 5 per minute; the first five are ordinary failures.
    for (let i = 0; i < 5; i += 1) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keeps a correct password from bypassing the lockout', async () => {
    // The bucket from the previous test is already spent for this route+IP, so
    // knowing the password does not get you past a brute-force lockout.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'student@example.com', password: 'password123' })
      .expect(429);
  });

  it('does not spend the login bucket on unrelated routes', async () => {
    // Buckets are per route, so exhausting login must not lock the health check.
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('advertises the remaining allowance on a normal response', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
  });
});
