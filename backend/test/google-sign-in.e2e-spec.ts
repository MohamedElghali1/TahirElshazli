import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
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
 * Google sign-in (`GAUTH-1`, unit 14), and the `state` tokens it shares a
 * signing secret with.
 */
describe('Google sign-in (e2e)', () => {
  let app: INestApplication<Server>;
  let jwt: JwtService;
  let teacherToken: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();

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
    jwt = moduleFixture.get(JwtService);

    const login = await request(server())
      .post('/auth/login')
      .send({ email: 'teacher@example.com', password: 'password123' })
      .expect(200);
    teacherToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('a state token is never a session (F-1)', () => {
    it('refuses the Google Forms connect state as a bearer token', async () => {
      // Exactly what `GoogleIntegrationService.beginConnect` signs: the same
      // secret as a session, `sub` = the teacher. It travels in a URL, so it
      // must not open the API.
      const state = await jwt.signAsync(
        {
          sub: 'teacher-1',
          role: 'teacher',
          purpose: 'google_oauth_state',
          nonce: randomUUID(),
        },
        { expiresIn: 600 },
      );
      const res = await request(server()).get('/admin/students').set(bearer(state));
      expect(res.status).toBe(401);
    });

    it('still admits an ordinary session', async () => {
      await request(server()).get('/admin/students').set(bearer(teacherToken)).expect(200);
    });
  });
});
