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
import type { GoogleSignInConfig } from './../src/common/config/env.js';
import {
  GOOGLE_SIGN_IN_CONFIG,
  MESSAGES,
} from './../src/auth/google/google-sign-in.service.js';
import {
  GOOGLE_SIGN_IN_CLIENT,
  type GoogleSignInClient,
} from './../src/auth/google/google-sign-in.client.js';
import { GOOGLE_JWKS_SOURCE } from './../src/auth/google/google-id-token.verifier.js';
import {
  GOOGLE_IDENTITY_REPOSITORY,
  type GoogleIdentityRepository,
} from './../src/auth/google/interfaces/google-identity-repository.interface.js';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './../src/auth/interfaces/user-repository.interface.js';
import { FakeGoogle, TEST_CLIENT_ID } from './support/fake-google.js';

const ALWAYS_ALLOW: RateLimitStore = {
  hit: (): RateLimitDecision => ({
    allowed: true,
    remaining: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + 60_000,
  }),
};

const CONFIG: GoogleSignInConfig = {
  clientId: TEST_CLIENT_ID,
  clientSecret: 'test-secret',
  redirectUri: 'http://localhost:3000/google/callback',
  staffDomains: ['school.org'],
};

/**
 * Google's two HTTP calls, and nothing else. The auth URL carries the state
 * and nonce back to the test the way a browser would; a code is whatever the
 * test registered. What comes back is a real RS256 token, verified by the
 * real `GoogleIdTokenVerifier` against `FakeGoogle`'s JWKS.
 */
class FakeSignInClient implements GoogleSignInClient {
  readonly codes = new Map<string, string>();
  buildAuthUrl(state: string, nonce: string): string {
    return `https://accounts.google.test/auth?${new URLSearchParams({ state, nonce })}`;
  }
  async exchangeCode(code: string): Promise<{ idToken: string }> {
    const idToken = this.codes.get(code);
    if (!idToken) throw new Error('invalid_grant');
    this.codes.delete(code); // one-time, like Google's
    return { idToken };
  }
}

/**
 * Google sign-in (`GAUTH-1`, unit 14; `SECURITY.md` §2.6; `D-49`…`D-51`).
 * Every path is proven in both directions.
 */
describe('Google sign-in (e2e)', () => {
  let app: INestApplication<Server>;
  let jwt: JwtService;
  let identities: GoogleIdentityRepository;
  let users: UserRepository;
  const google = new FakeGoogle();
  const client = new FakeSignInClient();
  const tokens: Record<string, string> = {};

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();

  /**
   * Starts a flow the way the web app does, then plays Google: mints the
   * `id_token` Google would return for this flow's nonce and registers a code
   * for it. `claims` overrides what Google says about the account.
   */
  const begin = async (
    as: string | null,
    claims: Record<string, unknown> = {},
    mint: (c: Record<string, unknown>) => string = (c) => google.mint(c),
  ) => {
    const req = as
      ? request(server()).post('/auth/google/link/start').set(bearer(tokens[as]))
      : request(server()).post('/auth/google/start');
    const started = await req.expect(200);
    const url = new URL(started.body.authUrl);
    const state = url.searchParams.get('state')!;
    const nonce = url.searchParams.get('nonce')!;
    const code = randomUUID();
    client.codes.set(code, mint(google.claims({ nonce, ...claims })));
    return { code, state, browserKey: started.body.browserKey as string };
  };

  const signIn = (body: { code: string; state: string; browserKey: string }) =>
    request(server()).post('/auth/google/sign-in').send(body);
  const link = (as: string, body: { code: string; state: string; browserKey: string }) =>
    request(server()).post('/auth/google/link').set(bearer(tokens[as])).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RATE_LIMIT_STORE)
      .useValue(ALWAYS_ALLOW)
      .overrideProvider(GOOGLE_SIGN_IN_CONFIG)
      .useValue(CONFIG)
      .overrideProvider(GOOGLE_SIGN_IN_CLIENT)
      .useValue(client)
      .overrideProvider(GOOGLE_JWKS_SOURCE)
      .useValue(google)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleFixture.get(JwtService);
    identities = moduleFixture.get(GOOGLE_IDENTITY_REPOSITORY);
    users = moduleFixture.get(USER_REPOSITORY);

    for (const [key, email] of Object.entries({
      student: 'student@example.com',
      student2: 'student2@example.com',
      teacher: 'teacher@example.com',
      admin: 'admin@example.com',
      assistant: 'assistant@example.com',
      assistant2: 'assistant2@example.com',
    })) {
      const res = await request(server())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);
      tokens[key] = res.body.accessToken;
    }
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
        { sub: 'teacher-1', role: 'teacher', purpose: 'google_oauth_state', nonce: randomUUID() },
        { expiresIn: 600 },
      );
      expect((await request(server()).get('/admin/students').set(bearer(state))).status).toBe(401);
    });

    it('refuses a Google link state as a bearer token', async () => {
      const { state } = await begin('student');
      expect((await request(server()).get('/dashboard').set(bearer(state))).status).toBe(401);
    });

    it('still admits an ordinary session', async () => {
      await request(server()).get('/admin/students').set(bearer(tokens.teacher)).expect(200);
    });
  });

  describe('sign-in with no link (D-49, D-50)', () => {
    it('refuses a verified email that matches an existing account, and links nothing', async () => {
      const flow = await begin(null, { sub: 'g-student-unlinked', email: 'student@example.com' });
      const res = await signIn(flow).expect(401);
      expect(res.body.message).toBe(MESSAGES.emailTaken);
      expect(await identities.findBySub('g-student-unlinked')).toBeNull();
      expect(await identities.findByUser('student-1')).toBeNull();
    });

    it('matches the email case-insensitively for the message, still without linking', async () => {
      const flow = await begin(null, { sub: 'g-upper', email: 'STUDENT@example.com' });
      expect((await signIn(flow).expect(401)).body.message).toBe(MESSAGES.emailTaken);
      expect(await identities.findBySub('g-upper')).toBeNull();
    });

    it('refuses an unknown Google account and creates no user', async () => {
      const flow = await begin(null, { sub: 'g-nobody', email: 'nobody@gmail.com' });
      expect((await signIn(flow).expect(401)).body.message).toBe(MESSAGES.noAccount);
      const login = await request(server())
        .post('/auth/login')
        .send({ email: 'nobody@gmail.com', password: 'password123' });
      expect(login.status).toBe(401);
    });

    it('never consults users.google_email (the unverified Forms address)', async () => {
      // student-2's unverified Forms address - set the way staff matching sets
      // it. Signing in as that Google account must not reach student-2.
      await users.setGoogleEmail('student-2', 'victim-google@gmail.com');
      expect((await users.findById('student-2'))!.googleEmail).toBe('victim-google@gmail.com');
      const flow = await begin(null, { sub: 'g-victim', email: 'victim-google@gmail.com' });
      expect((await signIn(flow).expect(401)).body.message).toBe(MESSAGES.noAccount);
    });
  });

  describe('linking, and signing in through a link', () => {
    it('a student links while signed in, the audit entry is written, and sign-in then works', async () => {
      const linked = await link('student', await begin('student', { sub: 'g-student-1', email: 'Student.Personal@gmail.com' })).expect(200);
      expect(linked.body).toMatchObject({ available: true, linked: true, email: 'student.personal@gmail.com' });

      const log = await request(server())
        .get('/admin/audit-log?action=account.google_linked')
        .set(bearer(tokens.teacher))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'student-1',
        actorRole: 'student',
        targetType: 'user_google_identity',
        targetId: 'student-1',
        after: { email: 'student.personal@gmail.com', hd: null },
      });
      expect(JSON.stringify(log.body.entries[0])).not.toContain('g-student-1');

      const session = await signIn(await begin(null, { sub: 'g-student-1', email: 'student.personal@gmail.com' })).expect(200);
      expect(session.body.user).toMatchObject({ id: 'student-1', role: 'student' });
      await request(server()).get('/dashboard').set(bearer(session.body.accessToken)).expect(200);
    });

    it('status reports the link to its owner only', async () => {
      const mine = await request(server()).get('/auth/google/link').set(bearer(tokens.student)).expect(200);
      expect(mine.body).toMatchObject({ available: true, linked: true, email: 'student.personal@gmail.com' });
      const theirs = await request(server()).get('/auth/google/link').set(bearer(tokens.student2)).expect(200);
      expect(theirs.body).toMatchObject({ linked: false, email: null });
    });

    it('refuses a Google account already linked to someone else, and changes neither account', async () => {
      const res = await link('student2', await begin('student2', { sub: 'g-student-1', email: 'student.personal@gmail.com' })).expect(409);
      expect(res.body.message).toBe(MESSAGES.subTaken);
      expect((await identities.findBySub('g-student-1'))!.userId).toBe('student-1');
      expect(await identities.findByUser('student-2')).toBeNull();
    });

    it('refuses a second link on an account that already has one', async () => {
      const res = await link('student', await begin('student', { sub: 'g-student-1-other' })).expect(409);
      expect(res.body.message).toBe(MESSAGES.alreadyLinked);
      expect((await identities.findByUser('student-1'))!.googleSub).toBe('g-student-1');
    });

    it('refuses a link started in one account and completed in another', async () => {
      const flow = await begin('student2', { sub: 'g-cross' });
      expect((await link('assistant', flow).expect(401)).body.message).toBe(MESSAGES.linkRejected);
      expect(await identities.findBySub('g-cross')).toBeNull();
    });

    it('refuses to link without a session, and for a role that does not hold an account', async () => {
      const flow = await begin('student2', { sub: 'g-anon' });
      await request(server()).post('/auth/google/link').send(flow).expect(401);
      await request(server()).post('/auth/google/link/start').expect(401);
      await request(server()).get('/auth/google/link').expect(401);
      await request(server()).delete('/auth/google/link').expect(401);
    });

    it('refuses sign-in for a linked account that is not active', async () => {
      await request(server())
        .post('/auth/register')
        .send({ email: 'queued@example.com', password: 'password123', name: 'Queued' })
        .expect(201);
      // A waiting account cannot sign in to link; the row is planted to prove
      // the status gate holds even if a link somehow exists.
      const queued = await request(server())
        .get('/admin/students?status=waiting')
        .set(bearer(tokens.teacher))
        .expect(200);
      const row = (queued.body as { id: string; email: string }[]).find((s) => s.email === 'queued@example.com')
        ?? (queued.body.students as { id: string; email: string }[] | undefined)?.find((s) => s.email === 'queued@example.com');
      expect(row).toBeDefined();
      await identities.create({ userId: row!.id, googleSub: 'g-queued', email: 'queued@gmail.com', hd: null });
      const res = await signIn(await begin(null, { sub: 'g-queued', email: 'queued@gmail.com' })).expect(401);
      expect(res.body.message).toBe(MESSAGES.cannotSignIn);
    });
  });

  describe('the staff domain pin (D-51)', () => {
    it('lets staff on an allowed Workspace domain link and sign in', async () => {
      await link('assistant', await begin('assistant', { sub: 'g-assistant-1', email: 'aya@school.org', hd: 'school.org' })).expect(200);
      const session = await signIn(await begin(null, { sub: 'g-assistant-1', email: 'aya@school.org', hd: 'school.org' })).expect(200);
      expect(session.body.user).toMatchObject({ id: 'assistant-1', role: 'assistant' });
      await request(server()).get('/staff/courses').set(bearer(session.body.accessToken)).expect(200);
    });

    it('refuses a staff link from a consumer account or another domain', async () => {
      for (const claims of [
        { sub: 'g-teacher-gmail', email: 'tahir@gmail.com' },
        { sub: 'g-teacher-other', email: 'tahir@other.org', hd: 'other.org' },
      ]) {
        const res = await link('teacher', await begin('teacher', claims)).expect(403);
        expect(res.body.message).toBe(MESSAGES.staffDomain);
        expect(await identities.findBySub(claims.sub)).toBeNull();
      }
      expect(await identities.findByUser('teacher-1')).toBeNull();
    });

    it('re-checks the domain at every sign-in, against the token presented now', async () => {
      // Linked on an allowed domain; the same Google account now presents
      // without `hd` (e.g. moved out of the Workspace). Refused.
      const res = await signIn(await begin(null, { sub: 'g-assistant-1', email: 'aya@school.org' })).expect(401);
      expect(res.body.message).toBe(MESSAGES.staffDomain);
    });

    it('does not pin students', async () => {
      expect((await request(server()).get('/auth/google/link').set(bearer(tokens.student2)).expect(200)).body.available).toBe(true);
    });
  });

  describe('what a completion must prove', () => {
    it('refuses a missing or wrong browser key - a flow finished in another browser (login CSRF)', async () => {
      const flow = await begin(null, { sub: 'g-student-1', email: 'student.personal@gmail.com' });
      expect((await signIn({ ...flow, browserKey: 'x'.repeat(43) }).expect(401)).body.message).toBe(MESSAGES.rejected);
      // No key at all is refused at the DTO, before the service runs.
      await request(server()).post('/auth/google/sign-in').send({ code: flow.code, state: flow.state }).expect(400);
    });

    it('refuses a state of the other purpose, a session presented as state, and a forged state', async () => {
      const linkFlow = await begin('student', { sub: 'g-student-1', email: 'student.personal@gmail.com' });
      await signIn(linkFlow).expect(401);

      const signInFlow = await begin(null, { sub: 'g-student-1', email: 'student.personal@gmail.com' });
      await signIn({ ...signInFlow, state: tokens.student }).expect(401);

      const forged = await new JwtService({ secret: 'not-the-server-secret' }).signAsync({
        purpose: 'google_sign_in',
        nonce: 'n',
        keyHash: 'k',
      });
      await signIn({ ...signInFlow, state: forged }).expect(401);
    });

    it('refuses an expired state', async () => {
      const flow = await begin(null, { sub: 'g-student-1', email: 'student.personal@gmail.com' });
      const payload = jwt.decode(flow.state) as Record<string, unknown>;
      // Everything right but the clock: same purpose, nonce and key hash.
      const expired = await jwt.signAsync(
        { purpose: payload.purpose, nonce: payload.nonce, keyHash: payload.keyHash },
        { expiresIn: -10 },
      );
      await signIn({ ...flow, state: expired }).expect(401);
    });

    it('refuses a code Google does not honour, and a code used twice', async () => {
      const flow = await begin(null, { sub: 'g-student-1', email: 'student.personal@gmail.com' });
      await signIn({ ...flow, code: 'never-issued' }).expect(401);
      await signIn(flow).expect(200);
      await signIn(flow).expect(401);
    });

    it.each([
      ['a forged signature', {}, true],
      ['the wrong audience', { aud: 'another-app' }, false],
      ['an unverified email', { email_verified: false }, false],
      ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }, false],
    ])('refuses an id_token with %s', async (_label, claims, stranger) => {
      const flow = await begin(
        null,
        { sub: 'g-student-1', email: 'student.personal@gmail.com', ...claims },
        (c) => google.mint(c, { stranger: stranger as boolean }),
      );
      expect((await signIn(flow).expect(401)).body.message).toBe(MESSAGES.rejected);
    });

    it('refuses an id_token minted for another flow (nonce)', async () => {
      const flow = await begin(null);
      client.codes.set(flow.code, google.mint(google.claims({ sub: 'g-student-1', nonce: 'someone-elses-flow' })));
      expect((await signIn(flow).expect(401)).body.message).toBe(MESSAGES.rejected);
    });
  });

  describe('unlinking', () => {
    it('removes the link, audits it, and Google sign-in stops working; the password still does', async () => {
      await request(server()).delete('/auth/google/link').set(bearer(tokens.student)).expect(204);
      const log = await request(server())
        .get('/admin/audit-log?action=account.google_unlinked')
        .set(bearer(tokens.teacher))
        .expect(200);
      expect(log.body.entries[0]).toMatchObject({
        actorId: 'student-1',
        targetId: 'student-1',
        before: { email: 'student.personal@gmail.com', hd: null },
      });
      const res = await signIn(await begin(null, { sub: 'g-student-1', email: 'student.personal@gmail.com' })).expect(401);
      expect(res.body.message).toBe(MESSAGES.noAccount);
      await request(server())
        .post('/auth/login')
        .send({ email: 'student@example.com', password: 'password123' })
        .expect(200);
    });

    it('answers 404 when there is nothing to remove', async () => {
      const res = await request(server()).delete('/auth/google/link').set(bearer(tokens.student)).expect(404);
      expect(res.body.message).toBe(MESSAGES.notLinked);
    });
  });
});

describe('Google sign-in on a server without it (e2e)', () => {
  let app: INestApplication<Server>;
  const tokens: Record<string, string> = {};
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMIT_STORE)
      .useValue(ALWAYS_ALLOW)
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    for (const [key, email] of Object.entries({ student: 'student@example.com', teacher: 'teacher@example.com' })) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 with a usable alternative on both starts', async () => {
    const start = await request(app.getHttpServer()).post('/auth/google/start').expect(503);
    expect(start.body.message).toBe(MESSAGES.notConfigured);
    await request(app.getHttpServer()).post('/auth/google/link/start').set(bearer(tokens.student)).expect(503);
  });

  it('reports unavailable to the account screen', async () => {
    const res = await request(app.getHttpServer()).get('/auth/google/link').set(bearer(tokens.teacher)).expect(200);
    expect(res.body).toEqual({ available: false, linked: false, email: null, linkedAt: null });
  });

  it('leaves password sign-in untouched', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'teacher@example.com', password: 'password123' })
      .expect(200);
  });
});
