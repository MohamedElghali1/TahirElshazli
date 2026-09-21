import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Role } from './roles.enum.js';
import { TokenDenylistService } from './token-denylist.service.js';
import type { UserRepository } from './interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from './interfaces/user-repository.interface.js';
import type { PasswordHasher } from './interfaces/password-hasher.interface.js';
import { PASSWORD_HASHER } from './interfaces/password-hasher.interface.js';
import { MailService } from '../mail/mail.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { StudentRepository } from '../students/interfaces/student-repository.interface.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
import type { AssistantScopeRepository } from '../staff/interfaces/assistant-scope-repository.interface.js';
import { ASSISTANT_SCOPE_REPOSITORY } from '../staff/interfaces/assistant-scope-repository.interface.js';
import type { AssistantInvitationRepository } from '../manage/interfaces/assistant-invitation-repository.interface.js';
import { ASSISTANT_INVITATION_REPOSITORY } from '../manage/interfaces/assistant-invitation-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { actorRoleOf } from './actor-role.js';
import type { JwtPayload } from './jwt.strategy.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResult {
  accessToken: string;
  user: AuthenticatedUser;
}

/**
 * What registration returns: the queue position, and **nothing else**.
 *
 * No `accessToken` and no `user` (ruling R-6). A new account is `waiting` and
 * `DOMAIN_MODEL.md:23` says only `active` may authenticate, so handing back a
 * credential in the same response that records the account as unable to
 * authenticate contradicts the model in the API's own body - and it is the
 * kind of contradiction someone later resolves by deleting the gate rather
 * than the token.
 */
export interface RegistrationResult {
  status: 'waiting';
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * A real bcrypt hash of a value nobody holds. Login verifies against this when
 * the email is unknown, so the unknown-email path costs exactly one bcrypt
 * comparison - the same as the known-email path. Hashing on demand instead
 * would cost two operations and leak account existence through response time.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$10$uQ2MFTugIUY.QoAHacTgiudOeFyNSsN5KAhZF.LwAysdgVAzd.gWi';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly denylist: TokenDenylistService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly hasher: PasswordHasher,
    private readonly mail: MailService,
    private readonly db: DatabaseService,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(ASSISTANT_SCOPE_REPOSITORY)
    private readonly scopeRepo: AssistantScopeRepository,
    @Inject(ASSISTANT_INVITATION_REPOSITORY)
    private readonly invitationRepo: AssistantInvitationRepository,
    private readonly audit: AuditService,
  ) {}

  private async issueToken(user: {
    id: string;
    email: string;
    role: Role;
  }): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
      // Millisecond mint time. The standard `iat` is whole seconds, too coarse
      // to tell a token issued just before a password change from one issued
      // just after it - see TokenDenylistService.
      iatMs: Date.now(),
    };
    return this.jwtService.signAsync(payload);
  }

  /**
   * Creates a student account **in the waiting queue**. It cannot sign in
   * until staff accept it (`POST /admin/students/:id/accept`).
   */
  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<RegistrationResult> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await this.hasher.hash(password);
    const user = await this.userRepo.create({
      email,
      passwordHash,
      name,
      role: Role.Student,
      // **Explicit, never the column default.** `users.status` defaults to
      // `'active'` (migration 014) so the accounts that predate the queue keep
      // working; leaning on that here would put every new registration
      // straight past the queue and leave it permanently empty - a silent
      // authorization hole. `auth.service.spec.ts` asserts the value passed to
      // `create`, not the row read back, so the default cannot mask it.
      status: 'waiting',
    });
    // A student user without a profile row is a half-created account: the
    // profile and dashboard endpoints both 404 for them.
    await this.studentRepo.createForUser({
      userId: user.id,
      name: user.name,
      email: user.email,
    });
    return { status: 'waiting' };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email);
    // Always run exactly one verify, against the real hash or the precomputed
    // dummy, so an unknown email and a wrong password cost the same time.
    const passwordMatches = await this.hasher.verify(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    // One condition, one message, and it runs **after** the verify.
    //
    // `user.status !== 'active'` is a third clause on the existing refusal
    // rather than a check of its own, deliberately: a distinct "your account is
    // pending approval" message turns login into a registration oracle, and an
    // early return before the verify re-opens the timing side channel that
    // DUMMY_PASSWORD_HASH exists to close. Nothing here reveals which clause
    // failed.
    if (!user || !passwordMatches || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = await this.issueToken(user);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  logout(payload: JwtPayload & { exp?: number }): { success: true } {
    if (payload.jti) {
      const expiresAt =
        payload.exp ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      this.denylist.revoke(payload.jti, expiresAt);
    }
    return { success: true };
  }

  /**
   * Returns an identical response whether or not the account exists, so the
   * endpoint cannot be used to enumerate accounts. The mail goes only to the
   * recipient (out of band) - never back to the caller.
   *
   * Wrapped in `runInTransaction` so the password-reset token and the mail
   * delivery row commit together (MAIL-3).
   */
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    const user = await this.userRepo.findByEmail(email);
    if (user) {
      const token = randomUUID();
      const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_TTL_MS,
      ).toISOString();
      await this.db.runInTransaction(async () => {
        await this.userRepo.createPasswordResetToken(user.id, token, expiresAt);
        await this.mail.send({
          to: user.email,
          template: 'password-reset',
          data: { token, expiresAt },
        });
      });
    }
    return { success: true };
  }

  async confirmPasswordReset(
    token: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const stored = await this.userRepo.findPasswordResetToken(token);
    if (!stored || stored.usedAt || new Date(stored.expiresAt) <= new Date()) {
      throw new UnauthorizedException('Reset token is invalid or has expired');
    }
    const passwordHash = await this.hasher.hash(newPassword);
    await this.userRepo.updatePassword(stored.userId, passwordHash);
    await this.userRepo.markPasswordResetTokenUsed(token);
    // Whoever prompted the reset may already hold a live session; ending all of
    // them is the point of resetting.
    this.denylist.revokeAllForUser(stored.userId);
    return { success: true };
  }

  /**
   * Accepting an assistant invitation (`AUTH-4`, `PEOPLE-4`): creates the
   * account, sets the scope the invitation specified, and signs them in - one
   * transaction, same shape as `RegistrationApprovalService.accept`. Unlike a
   * student's registration, there is no queue: an assistant invitation is
   * already the admin decision, so the account is `active` immediately.
   *
   * The account is the actor of its own `assistant.invitation_accepted` entry
   * - there is no staff caller on this route (`security: []`,
   * `API_SPEC.yaml`), so "who activated this account" can only be answered by
   * the account itself, the same way a login is self-attributed.
   */
  async acceptInvitation(token: string, password: string): Promise<AuthResult> {
    const invitation = await this.invitationRepo.findByToken(token);
    if (
      !invitation ||
      invitation.acceptedAt ||
      new Date(invitation.expiresAt) <= new Date()
    ) {
      // One message for unknown, already-used and expired - the same
      // anti-enumeration shape `confirmPasswordReset` already uses.
      throw new UnauthorizedException('Invitation is invalid or has expired');
    }
    return this.db.runInTransaction(async () => {
      const passwordHash = await this.hasher.hash(password);
      const user = await this.userRepo.create({
        email: invitation.email,
        passwordHash,
        name: invitation.name,
        role: invitation.role,
        status: 'active',
      });
      await this.scopeRepo.setScope(user.id, invitation.scope);
      if (invitation.scope === 'assigned_groups') {
        for (const groupId of invitation.groupIds) {
          await this.scopeRepo.assignGroup(user.id, groupId, invitation.invitedBy);
        }
      }
      await this.invitationRepo.markAccepted(invitation.id);
      await this.audit.record({
        actorId: user.id,
        actorRole: actorRoleOf({ role: user.role }),
        action: 'assistant.invitation_accepted',
        targetType: 'assistant',
        targetId: user.id,
        courseId: null,
        before: null,
        after: { email: user.email, role: user.role, scope: invitation.scope },
      });
      const accessToken = await this.issueToken(user);
      return {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      };
    });
  }
}
