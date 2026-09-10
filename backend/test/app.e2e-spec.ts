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

  describe('catalog and self-enrollment', () => {
    // A brand-new account, not one of the seeded students. This block enrolls
    // someone, and the in-memory enrollment repository is a singleton for the
    // life of the app - reusing student-1 or student-2 here would silently
    // change what the cross-course tests below are asserting against.
    let freshToken: string;

    beforeAll(async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'catalog-e2e@example.com',
          password: 'password123',
          name: 'Catalog Tester',
        })
        .expect(201);
      freshToken = registered.body.accessToken;
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

    it('shows a new student an empty dashboard but a full catalog', async () => {
      const mine = await request(app.getHttpServer())
        .get('/courses')
        .set(fresh())
        .expect(200);
      expect(mine.body).toEqual([]);

      const catalog = await request(app.getHttpServer())
        .get('/courses/catalog')
        .set(fresh())
        .expect(200);
      expect(catalog.body.every((c: { enrolled: boolean }) => !c.enrolled)).toBe(true);
    });

    it('serves a new student an empty Home screen rather than an error', async () => {
      // The aggregate takes no course id, so a student with no enrollments is
      // an ordinary answer and not a 404. Their name and mailbox still resolve
      // - the screen has an empty state to draw and needs the rest to draw it.
      const res = await request(app.getHttpServer())
        .get('/dashboard')
        .set(fresh())
        .expect(200);
      expect(res.body.entries).toEqual([]);
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
      await request(app.getHttpServer())
        .get('/courses/course-1')
        .set(fresh())
        .expect(404);
    });

    it('enrolls the caller and opens the course to them', async () => {
      await request(app.getHttpServer())
        .post('/courses/course-1/enroll')
        .set(fresh())
        .expect(200);

      await request(app.getHttpServer())
        .get('/courses/course-1')
        .set(fresh())
        .expect(200);

      const mine = await request(app.getHttpServer())
        .get('/courses')
        .set(fresh())
        .expect(200);
      expect(mine.body.map((c: { id: string }) => c.id)).toEqual(['course-1']);
    });

    it('is idempotent - a second enroll succeeds and adds nothing', async () => {
      await request(app.getHttpServer())
        .post('/courses/course-1/enroll')
        .set(fresh())
        .expect(200);

      const mine = await request(app.getHttpServer())
        .get('/courses')
        .set(fresh())
        .expect(200);
      expect(mine.body.map((c: { id: string }) => c.id)).toEqual(['course-1']);
    });

    it('404s an enrollment on a course that does not exist', async () => {
      await request(app.getHttpServer())
        .post('/courses/course-nope/enroll')
        .set(fresh())
        .expect(404);
    });

    it('refuses an unauthenticated enrollment', async () => {
      await request(app.getHttpServer())
        .post('/courses/course-2/enroll')
        .expect(401);
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
     * A freshly registered account, enrolled in nothing. Needed to tell an id
     * that exists in a course the caller does not hold from one that does not
     * exist at all - student-2 holds course-1, where every fixture lives.
     */
    const unenrolledToken = async (): Promise<string> => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `oracle-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
          password: 'oraclepass123',
          name: 'Oracle Probe',
        })
        .expect(201);
      return registered.body.accessToken as string;
    };

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

    it('gives a brand-new student with no enrollments access to nothing', async () => {
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `fresh-${Date.now()}@example.com`,
          password: 'freshpass123',
          name: 'Fresh Student',
        })
        .expect(201);
      const freshAuth = {
        Authorization: `Bearer ${registered.body.accessToken}`,
      };

      // Authenticated, but enrolled in nothing at all.
      const courses = await request(app.getHttpServer())
        .get('/courses')
        .set(freshAuth)
        .expect(200);
      expect(courses.body).toEqual([]);

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
      // real signup got a 404 from the profile and dashboard endpoints.
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `profiled-${Date.now()}@example.com`,
          password: 'freshpass123',
          name: 'Profiled Student',
        })
        .expect(201);

      const profile = await request(app.getHttpServer())
        .get('/students/me/profile')
        .set({ Authorization: `Bearer ${registered.body.accessToken}` })
        .expect(200);
      expect(profile.body.name).toBe('Profiled Student');
      expect(profile.body.enrolledCourseCount).toBe(0);
    });

    it('ends old sessions on password change but lets the user back in', async () => {
      const email = `rotating-${Date.now()}@example.com`;
      const registered = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'oldpass123', name: 'Rotating Student' })
        .expect(201);
      const oldToken = registered.body.accessToken;

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
