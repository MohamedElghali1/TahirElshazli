import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenDenylistService } from './token-denylist.service.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
import { InMemoryStudentRepository } from '../students/repositories/in-memory-student.repository.js';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';
import { USER_REPOSITORY } from './interfaces/user-repository.interface.js';
import { PASSWORD_HASHER } from './interfaces/password-hasher.interface.js';
import { PASSWORD_RESET_NOTIFIER } from './interfaces/password-reset-notifier.interface.js';
import type { PasswordResetNotifier } from './interfaces/password-reset-notifier.interface.js';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/** Captures reset tokens so the spec can use them without the API leaking them. */
class CapturingResetNotifier implements PasswordResetNotifier {
  readonly sent: { email: string; token: string; expiresAt: string }[] = [];

  async sendResetToken(
    email: string,
    token: string,
    expiresAt: string,
  ): Promise<void> {
    this.sent.push({ email, token, expiresAt });
  }
}

describe('AuthController', () => {
  let controller: AuthController;
  let denylist: TokenDenylistService;
  let notifier: CapturingResetNotifier;

  beforeEach(async () => {
    notifier = new CapturingResetNotifier();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        TokenDenylistService,
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: STUDENT_REPOSITORY, useClass: InMemoryStudentRepository },
        { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
        { provide: PASSWORD_RESET_NOTIFIER, useValue: notifier },
        {
          provide: JwtService,
          useValue: { signAsync: vi.fn().mockResolvedValue('mock-token') },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    denylist = module.get<TokenDenylistService>(TokenDenylistService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return an access token and the user on valid login', async () => {
    const result = await controller.login({
      email: 'student@example.com',
      password: 'password123',
    });
    expect(result.accessToken).toBe('mock-token');
    expect(result.user).toMatchObject({ id: 'student-1', role: 'student' });
  });

  it('should not leak the password hash in the login response', async () => {
    const result = await controller.login({
      email: 'student@example.com',
      password: 'password123',
    });
    expect(JSON.stringify(result)).not.toContain('$2b$');
  });

  it('should throw on a wrong password', async () => {
    await expect(
      controller.login({ email: 'student@example.com', password: 'wrongpass1' }),
    ).rejects.toThrow();
  });

  it('should throw on an unknown email', async () => {
    await expect(
      controller.login({ email: 'nobody@example.com', password: 'password123' }),
    ).rejects.toThrow();
  });

  it('should register a new student into the waiting queue, with no token', async () => {
    const result = await controller.register({
      email: 'new@example.com',
      password: 'newpass123',
      name: 'New Student',
    });
    // Ruling R-6: `{ status: 'waiting' }` and nothing else. A token here would
    // authenticate an account that `login` refuses.
    expect(result).toEqual({ status: 'waiting' });
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('user');
  });

  it('should reject a duplicate email', async () => {
    await controller.register({
      email: 'new@example.com',
      password: 'newpass123',
      name: 'New Student',
    });

    await expect(
      controller.register({
        email: 'new@example.com',
        password: 'newpass123',
        name: 'Duplicate',
      }),
    ).rejects.toThrow();
  });

  it('should revoke the token id on logout', () => {
    const result = controller.logout({
      user: {
        sub: 'student-1',
        email: 'student@example.com',
        role: 'student',
        jti: 'token-abc',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    });
    expect(result).toEqual({ success: true });
    expect(denylist.isRevoked('token-abc')).toBe(true);
  });

  it('should return an identical response for known and unknown emails', async () => {
    const known = await controller.requestPasswordReset({
      email: 'student@example.com',
    });
    const unknown = await controller.requestPasswordReset({
      email: 'nobody@example.com',
    });
    // Byte-identical responses - the only way to tell them apart would be the
    // notifier, which the caller cannot observe.
    expect(known).toEqual({ success: true });
    expect(unknown).toEqual({ success: true });
    expect(JSON.stringify(known)).toBe(JSON.stringify(unknown));
    // The token reached the notifier, never the HTTP response.
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0].email).toBe('student@example.com');
    expect(JSON.stringify(known)).not.toContain(notifier.sent[0].token);
  });

  it('should reset the password with a valid token and reject reuse', async () => {
    await controller.requestPasswordReset({ email: 'student@example.com' });
    const resetToken = notifier.sent.at(-1)?.token;
    expect(resetToken).toBeDefined();

    await expect(
      controller.confirmPasswordReset({
        token: resetToken as string,
        newPassword: 'brandnew123',
      }),
    ).resolves.toEqual({ success: true });

    // The new password now works and the old one does not.
    await expect(
      controller.login({ email: 'student@example.com', password: 'brandnew123' }),
    ).resolves.toHaveProperty('accessToken');
    await expect(
      controller.login({ email: 'student@example.com', password: 'password123' }),
    ).rejects.toThrow();

    // A reset token is single-use.
    await expect(
      controller.confirmPasswordReset({
        token: resetToken as string,
        newPassword: 'another123',
      }),
    ).rejects.toThrow();
  });

  it('should reject an unknown reset token', async () => {
    await expect(
      controller.confirmPasswordReset({
        token: 'not-a-real-token',
        newPassword: 'whatever123',
      }),
    ).rejects.toThrow();
  });
});
