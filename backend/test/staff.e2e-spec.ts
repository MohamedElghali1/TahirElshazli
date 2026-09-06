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
      '/admin/courses/course-1/staff',
      '/admin/audit-log',
    ])('requires a token for %s', async (route) => {
      await request(app.getHttpServer()).get(route).expect(401);
    });

    it.each([
      '/staff/courses',
      '/admin/courses/course-1/staff',
      '/admin/audit-log',
    ])('refuses a student token on %s', async (route) => {
      // A student authenticates fine; the role check is what stops them.
      await request(app.getHttpServer())
        .get(route)
        .set(bearer(studentToken))
        .expect(403);
    });

    it.each(['/admin/courses/course-1/staff', '/admin/audit-log'])(
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
      const response = await request(app.getHttpServer())
        .get('/admin/audit-log?actorId=assistant-1')
        .set(bearer(adminToken))
        .expect(200);
      expect(response.body.entries).toEqual([]);
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
});
