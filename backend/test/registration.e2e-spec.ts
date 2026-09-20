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

/** Several logins in beforeAll exceed the real 5/min bucket once retries happen. */
const ALWAYS_ALLOW: RateLimitStore = {
  hit: (): RateLimitDecision => ({
    allowed: true,
    remaining: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + 60_000,
  }),
};

/**
 * The registration queue and the course lifecycle (`DOM-4`, `DOM-5`), through
 * the real guards.
 *
 * **Its own file, and that is not cosmetic.** These cases started inside
 * `staff.e2e-spec.ts` and pushed that file past the resource line its own
 * config comment already documents: the forked worker exited mid-run with
 * every assertion green, which reports as an unhandled error rather than a
 * failure - the worst shape a flake can take, because a tired reader sees
 * "0 failed". `fileParallelism: false` means a third file costs a boot and
 * nothing else.
 */
describe('Registration queue and course lifecycle (e2e)', () => {
  let app: INestApplication<Server>;
  /** assistant-1: assigned to course-1 only. */
  let assignedTaToken: string;
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
    adminToken = await login('teacher@example.com');
    fullAdminToken = await login('admin@example.com');
    studentToken = await login('student@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * `DOM-4` and `DOM-5`: one named refusal per new permission.
   *
   * Each is a *write* on `/admin/*`, so the class-level
   * `@Roles(...STAFF_ADMIN)` is the gate and `STAFF_ADMIN` never contains
   * `Role.Assistant`. 403 rather than 404 because these are capability
   * refusals on routes the assistant can see the existence of - the
   * 404-for-scope rule belongs to `StaffScopeService`, which these do not
   * go through.
   */
  describe('the registration queue and course lifecycle are admin-only', () => {
    it('an assistant is refused with 403 on POST /admin/students/:id/accept', async () => {
      await request(app.getHttpServer())
        .post('/admin/students/student-1/accept')
        .set(bearer(assignedTaToken))
        .send({ groupId: 'group-1' })
        .expect(403);
    });

    it('an assistant is refused with 403 on POST /admin/students/:id/reject', async () => {
      // Two independent refusals guard this one: the decorator here, and
      // `assertMay(actor, 'registration.reject')` as the first statement of
      // the service - asserted in `registration-approval.service.spec.ts`,
      // because the decorator can never be reached to prove it.
      await request(app.getHttpServer())
        .post('/admin/students/student-1/reject')
        .set(bearer(assignedTaToken))
        .send({ reason: 'no' })
        .expect(403);
    });

    it('an assistant is refused with 403 on POST /admin/courses', async () => {
      await request(app.getHttpServer())
        .post('/admin/courses')
        .set(bearer(assignedTaToken))
        .send({
          title: 'Smuggled Course',
          description: 'x',
          slug: 'smuggled-course',
          teacherName: 'Nobody',
        })
        .expect(403);
    });

    it('an assistant is refused with 403 on PATCH /admin/courses/:id', async () => {
      await request(app.getHttpServer())
        .patch('/admin/courses/course-1')
        .set(bearer(assignedTaToken))
        .send({ title: 'Renamed by a TA' })
        .expect(403);
    });

    it('a student is refused on all four as well', async () => {
      for (const send of [
        () =>
          request(app.getHttpServer())
            .post('/admin/students/student-1/accept')
            .send({ groupId: 'group-1' }),
        () =>
          request(app.getHttpServer())
            .post('/admin/students/student-1/reject')
            .send({}),
        () =>
          request(app.getHttpServer())
            .post('/admin/courses')
            .send({
              title: 'x',
              description: 'x',
              slug: 'x',
              teacherName: 'x',
            }),
        () =>
          request(app.getHttpServer())
            .patch('/admin/courses/course-1')
            .send({ title: 'x' }),
      ]) {
        await send().set(bearer(studentToken)).expect(403);
      }
    });

    it('the teacher creates a course, and it is a draft until published', async () => {
      const created = await request(app.getHttpServer())
        .post('/admin/courses')
        .set(bearer(adminToken))
        .send({
          title: 'IGCSE Physics',
          description: 'Papers 1 and 2',
          slug: 'igcse-physics-e2e',
          teacherName: 'Dr. Tahir Elshazli',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        slug: 'igcse-physics-e2e',
        isPublished: false,
        modules: [],
      });

      const updated = await request(app.getHttpServer())
        .patch(`/admin/courses/${created.body.id}`)
        .set(bearer(fullAdminToken))
        .send({ isPublished: true, title: 'IGCSE Physics (2026)' })
        .expect(200);
      expect(updated.body).toMatchObject({
        isPublished: true,
        title: 'IGCSE Physics (2026)',
        slug: 'igcse-physics-e2e',
      });
    });

    it('409s a duplicate slug and 404s an unknown course', async () => {
      await request(app.getHttpServer())
        .post('/admin/courses')
        .set(bearer(adminToken))
        .send({
          title: 'Clash',
          description: 'x',
          slug: 'as-chemistry',
          teacherName: 'x',
        })
        .expect(409);

      await request(app.getHttpServer())
        .patch('/admin/courses/course-nope')
        .set(bearer(adminToken))
        .send({ title: 'x' })
        .expect(404);
    });

    it('400s a body the DTO does not declare, and a null over a NOT NULL column', async () => {
      await request(app.getHttpServer())
        .patch('/admin/courses/course-1')
        .set(bearer(adminToken))
        .send({ title: null })
        .expect(400);

      await request(app.getHttpServer())
        .post('/admin/courses')
        .set(bearer(adminToken))
        .send({
          title: 'Bad Slug',
          description: 'x',
          slug: 'Not A Slug',
          teacherName: 'x',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/admin/students/student-1/accept')
        .set(bearer(adminToken))
        .send({})
        .expect(400);
    });
  });
});
