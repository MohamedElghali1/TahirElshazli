import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { TokenDenylistService } from './token-denylist.service.js';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository.js';
import { InMemoryStudentRepository } from '../students/repositories/in-memory-student.repository.js';
import { MailService } from '../mail/mail.service.js';
import { DatabaseService } from '../database/database.service.js';

/**
 * The registration queue's two gates (`DOM-4`, ruling R-6).
 *
 * They are tested together because they are one rule in two places, and the
 * second is the one that is easy to forget: `login` refuses to *mint* a token
 * for a non-`active` account, and `JwtStrategy.validate` refuses one already
 * minted. A gate at `login` alone leaves every token issued before a rejection
 * working until it expires - which is precisely the window in which an account
 * gets rejected.
 */
function build() {
  const users = new InMemoryUserRepository();
  const students = new InMemoryStudentRepository();
  const hasher = new BcryptPasswordHasher();
  const denylist = new TokenDenylistService();
  const db = new DatabaseService(null);
  const mail = { send: vi.fn().mockResolvedValue(undefined) } as unknown as MailService;
  const jwt = {
    signAsync: vi.fn().mockResolvedValue('mock-token'),
  } as unknown as JwtService;
  const auth = new AuthService(
    jwt,
    denylist,
    users,
    hasher,
    mail,
    db,
    students,
  );
  const strategy = new JwtStrategy(denylist, users);
  return { auth, users, hasher, denylist, strategy };
}

describe('the registration status gate', () => {
  describe('register', () => {
    it('passes status "waiting" to the repository, never leaving it to the column default', async () => {
      // The assertion is on the **argument**, not on the row read back.
      // `users.status` defaults to 'active' (migration 014) for the rows that
      // predate the queue, so a service that forgot to pass a status would
      // read back a perfectly plausible active account and the waiting queue
      // would simply always be empty - a silent authorization hole.
      const { auth, users } = build();
      const create = vi.spyOn(users, 'create');

      await auth.register('queued@example.com', 'password123', 'Queued');

      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0]).toMatchObject({
        email: 'queued@example.com',
        status: 'waiting',
      });
    });

    it('returns the queue position and no credential at all', async () => {
      const { auth } = build();
      const result = await auth.register(
        'queued@example.com',
        'password123',
        'Queued',
      );
      expect(result).toEqual({ status: 'waiting' });
      expect(Object.keys(result)).toEqual(['status']);
    });

    it('still creates the profile row, so the account is not half-made', async () => {
      const { auth, users } = build();
      await auth.register('queued@example.com', 'password123', 'Queued');
      const created = await users.findByEmail('queued@example.com');
      expect(created?.status).toBe('waiting');
    });
  });

  describe('login', () => {
    it('refuses a waiting account with the byte-identical invalid-credentials message', async () => {
      const { auth } = build();
      await auth.register('queued@example.com', 'password123', 'Queued');

      const unknownEmail = await auth
        .login('nobody@example.com', 'password123')
        .catch((e: Error) => e.message);
      const waiting = await auth
        .login('queued@example.com', 'password123')
        .catch((e: Error) => e.message);

      expect(waiting).toBe('Invalid credentials');
      // `===`, in the same test: a distinct "your account is pending" message
      // turns login into a registration oracle.
      expect(waiting).toBe(unknownEmail);
    });

    it('refuses a rejected account with the same message', async () => {
      const { auth, users } = build();
      await users.setStatus('student-1', 'rejected');
      await expect(
        auth.login('student@example.com', 'password123'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('runs exactly one hash verification on all four paths', async () => {
      // The timing equalisation `DUMMY_PASSWORD_HASH` exists for. An early
      // return on the status check - before the verify - would make a waiting
      // account measurably faster to refuse than a wrong password, which is
      // the same oracle by another route.
      const { auth, users, hasher } = build();
      await auth.register('queued@example.com', 'password123', 'Queued');
      await users.setStatus('student-2', 'rejected');
      const verify = vi.spyOn(hasher, 'verify');

      for (const [email, password] of [
        ['nobody@example.com', 'password123'], // unknown email
        ['student@example.com', 'wrongpassword'], // wrong password
        ['queued@example.com', 'password123'], // waiting
        ['student2@example.com', 'password123'], // rejected
      ]) {
        verify.mockClear();
        await auth.login(email, password).catch(() => undefined);
        expect(verify, `${email} took a different number of verifies`)
          .toHaveBeenCalledTimes(1);
      }
    });

    it('still signs an active account in', async () => {
      const { auth } = build();
      const result = await auth.login('student@example.com', 'password123');
      expect(result.accessToken).toBe('mock-token');
    });
  });

  describe('JwtStrategy.validate', () => {
    const payload = {
      sub: 'student-1',
      email: 'student@example.com',
      role: 'student',
      jti: 'jti-1',
      iatMs: Date.now(),
    };

    it('a token for a rejected account is refused on every route', async () => {
      // Every authenticated route passes through `validate`, so refusing here
      // is refusing everywhere - including for a token minted before the
      // rejection, which a gate at `login` cannot reach.
      const { strategy, users } = build();
      expect(await strategy.validate({ ...payload })).toMatchObject({
        sub: 'student-1',
      });

      await users.setStatus('student-1', 'rejected');

      await expect(strategy.validate({ ...payload })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses a waiting account, with the message a deleted account gets', async () => {
      const { strategy, users } = build();
      await users.setStatus('student-1', 'waiting');
      const refused = await strategy
        .validate({ ...payload })
        .catch((e: Error) => e.message);
      const deleted = await strategy
        .validate({ ...payload, sub: 'nobody-at-all' })
        .catch((e: Error) => e.message);
      expect(refused).toBe('Account no longer exists');
      expect(refused).toBe(deleted);
    });

    it('lets an active account through, carrying the database role', async () => {
      const { strategy } = build();
      await expect(strategy.validate({ ...payload })).resolves.toMatchObject({
        role: 'student',
        email: 'student@example.com',
      });
    });
  });
});
