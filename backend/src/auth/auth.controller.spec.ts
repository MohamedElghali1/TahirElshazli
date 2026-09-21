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
import { MailService } from '../mail/mail.service.js';
import { MAIL_SENDER } from '../mail/mail-sender.interface.js';
import { MAIL_DELIVERY_REPOSITORY } from '../mail/mail-delivery.repository.js';
import { InMemoryMailDeliveryRepository } from '../mail/in-memory-mail-delivery.repository.js';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { InMemoryAssistantScopeRepository } from '../staff/repositories/in-memory-assistant-scope.repository.js';
import { ASSISTANT_INVITATION_REPOSITORY } from '../manage/interfaces/assistant-invitation-repository.interface.js';
import { InMemoryAssistantInvitationRepository } from '../manage/repositories/in-memory-assistant-invitation.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';

describe('AuthController', () => {
  let controller: AuthController;
  let denylist: TokenDenylistService;
  let mailSend: ReturnType<typeof vi.fn>;
  let invitations: InMemoryAssistantInvitationRepository;
  let scopeRepo: InMemoryAssistantScopeRepository;
  let audit: AuditService;
  let users: InMemoryUserRepository;

  beforeEach(async () => {
    mailSend = vi.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        TokenDenylistService,
        DatabaseService,
        MailService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: STUDENT_REPOSITORY, useClass: InMemoryStudentRepository },
        { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
        { provide: MAIL_SENDER, useValue: { send: mailSend } },
        { provide: MAIL_DELIVERY_REPOSITORY, useClass: InMemoryMailDeliveryRepository },
        { provide: ASSISTANT_SCOPE_REPOSITORY, useClass: InMemoryAssistantScopeRepository },
        { provide: ASSISTANT_INVITATION_REPOSITORY, useClass: InMemoryAssistantInvitationRepository },
        AuditService,
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
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
    invitations = module.get(ASSISTANT_INVITATION_REPOSITORY);
    scopeRepo = module.get(ASSISTANT_SCOPE_REPOSITORY);
    audit = module.get(AuditService);
    users = module.get(USER_REPOSITORY);
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
    // Byte-identical responses.
    expect(known).toEqual({ success: true });
    expect(unknown).toEqual({ success: true });
    expect(JSON.stringify(known)).toBe(JSON.stringify(unknown));
    // The mail was sent via MailService for the known email only.
    expect(mailSend).toHaveBeenCalledTimes(1);
    expect(mailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'password-reset',
        to: 'student@example.com',
      }),
    );
  });

  it('should reset the password with a valid token and reject reuse', async () => {
    await controller.requestPasswordReset({ email: 'student@example.com' });
    // Extract the token from the MailService.send call.
    const sentData = mailSend.mock.calls.at(-1)?.[0]?.data;
    const resetToken = sentData?.token as string;
    expect(resetToken).toBeDefined();

    await expect(
      controller.confirmPasswordReset({
        token: resetToken,
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
        token: resetToken,
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

  describe('acceptInvitation', () => {
    it('creates an active account, sets scope, and signs them in', async () => {
      await invitations.create({
        name: 'New TA',
        email: 'invited@example.com',
        role: 'assistant' as never,
        scope: 'assigned_groups',
        groupIds: ['group-1'],
        token: 'invite-token-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        invitedBy: 'teacher-1',
      });

      const result = await controller.acceptInvitation('invite-token-1', {
        password: 'brandnew123',
      });
      expect(result.accessToken).toBe('mock-token');
      expect(result.user).toMatchObject({ email: 'invited@example.com', role: 'assistant' });

      const stored = await users.findByEmail('invited@example.com');
      expect(stored?.status).toBe('active');
      expect(await scopeRepo.findScope(stored!.id)).toBe('assigned_groups');
      expect((await scopeRepo.findAssignments(stored!.id)).map((a) => a.groupId)).toEqual([
        'group-1',
      ]);

      const { entries } = await audit.find({ limit: 10 });
      const entry = entries.find((e) => e.action === 'assistant.invitation_accepted');
      expect(entry?.actorId).toBe(stored!.id);
      expect(entry?.targetId).toBe(stored!.id);
    });

    it('rejects an unknown token, an expired one and an already-used one with the same message', async () => {
      await invitations.create({
        name: 'Expired TA',
        email: 'expired@example.com',
        role: 'assistant' as never,
        scope: 'all_groups',
        groupIds: [],
        token: 'invite-token-expired',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        invitedBy: 'teacher-1',
      });
      await invitations.create({
        name: 'Used TA',
        email: 'used@example.com',
        role: 'assistant' as never,
        scope: 'all_groups',
        groupIds: [],
        token: 'invite-token-used',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        invitedBy: 'teacher-1',
      });
      await controller.acceptInvitation('invite-token-used', { password: 'firstpass123' });

      const unknown = await controller
        .acceptInvitation('not-a-real-token', { password: 'whatever123' })
        .catch((e: Error) => e.message);
      const expired = await controller
        .acceptInvitation('invite-token-expired', { password: 'whatever123' })
        .catch((e: Error) => e.message);
      const reused = await controller
        .acceptInvitation('invite-token-used', { password: 'whatever123' })
        .catch((e: Error) => e.message);

      expect(unknown).toBe(expired);
      expect(expired).toBe(reused);
    });
  });
});
