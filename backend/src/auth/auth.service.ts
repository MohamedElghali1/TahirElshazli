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
import type { PasswordResetNotifier } from './interfaces/password-reset-notifier.interface.js';
import { PASSWORD_RESET_NOTIFIER } from './interfaces/password-reset-notifier.interface.js';
import type { StudentRepository } from '../students/interfaces/student-repository.interface.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
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
    @Inject(PASSWORD_RESET_NOTIFIER)
    private readonly notifier: PasswordResetNotifier,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
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

  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<AuthResult> {
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
    });
    // A student user without a profile row is a half-created account: the
    // profile and dashboard endpoints both 404 for them.
    await this.studentRepo.createForUser({
      userId: user.id,
      name: user.name,
      email: user.email,
    });
    const accessToken = await this.issueToken(user);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email);
    // Always run exactly one verify, against the real hash or the precomputed
    // dummy, so an unknown email and a wrong password cost the same time.
    const passwordMatches = await this.hasher.verify(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
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
   * endpoint cannot be used to enumerate accounts. The token goes only to the
   * notifier (out of band) - never back to the caller.
   */
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    const user = await this.userRepo.findByEmail(email);
    if (user) {
      const token = randomUUID();
      const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_TTL_MS,
      ).toISOString();
      await this.userRepo.createPasswordResetToken(user.id, token, expiresAt);
      await this.notifier.sendResetToken(user.email, token, expiresAt);
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
}
