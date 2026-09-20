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

const ALWAYS_ALLOW: RateLimitStore = {
  hit: (): RateLimitDecision => ({
    allowed: true,
    remaining: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + 60_000,
  }),
};

/**
 * Boots the real AppModule with the real global guards. Unit specs stub those
 * out, so this file is the only proof that `@Public()` actually reaches through
 * `JwtAuthGuard` and `RolesGuard` - and, just as importantly, that marking this
 * one controller public did not open anything else.
 */
describe('Public catalog (e2e)', () => {
  let app: INestApplication<Server>;
  let server: Server;

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
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /public/courses', () => {
    it('answers with no Authorization header at all', async () => {
      const res = await request(server).get('/public/courses').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('returns the catalog shape the marketing site renders', async () => {
      const res = await request(server).get('/public/courses').expect(200);

      expect(res.body[0]).toMatchObject({
        id: expect.any(String),
        slug: expect.any(String),
        title: expect.any(String),
        teacherName: expect.any(String),
        moduleCount: expect.any(Number),
        lessonCount: expect.any(Number),
        totalDurationSeconds: expect.any(Number),
      });
    });

    it('never exposes the publish flag or the sequential-lock setting', async () => {
      const res = await request(server).get('/public/courses').expect(200);

      for (const course of res.body) {
        expect(course).not.toHaveProperty('isPublished');
        expect(course).not.toHaveProperty('sequentialLockEnabled');
      }
    });
  });

  describe('GET /public/courses/:slug', () => {
    it('returns the full outline anonymously', async () => {
      const res = await request(server)
        .get('/public/courses/as-chemistry')
        .expect(200);

      expect(res.body.slug).toBe('as-chemistry');
      expect(res.body.modules.length).toBeGreaterThan(0);
      expect(res.body.modules[0].lessons[0]).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        durationSeconds: expect.any(Number),
      });
    });

    /**
     * The outline names lessons; it must not carry what plays them. A video id
     * leaking here would put course content one Bunny call from anonymous
     * (CLAUDE.md §8: video only through signed URLs).
     */
    it('carries lesson titles but no playable content', async () => {
      const res = await request(server)
        .get('/public/courses/as-chemistry')
        .expect(200);

      const lesson = res.body.modules[0].lessons[0];
      expect(Object.keys(lesson).sort()).toEqual([
        'durationSeconds',
        'id',
        'order',
        'title',
      ]);
    });

    it('404s an unknown slug', async () => {
      await request(server).get('/public/courses/no-such-course').expect(404);
    });
  });

  /**
   * The regression this whole file exists to catch: `@Public()` on one
   * controller must not have loosened the student surface next door.
   */
  describe('the rest of the API stays closed', () => {
    it('still refuses /courses without a token', async () => {
      await request(server).get('/courses').expect(401);
    });

    it('still refuses /courses/catalog without a token', async () => {
      await request(server).get('/courses/catalog').expect(401);
    });

    it('still refuses /admin/audit-log without a token', async () => {
      await request(server).get('/admin/audit-log').expect(401);
    });
  });
});
