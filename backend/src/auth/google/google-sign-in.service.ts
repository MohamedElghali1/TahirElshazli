import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { GoogleSignInConfig } from '../../common/config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuthService, type AuthResult } from '../auth.service.js';
import { actorRoleOf } from '../actor-role.js';
import { STAFF_ALL } from '../staff-roles.js';
import { USER_REPOSITORY, type UserRepository } from '../interfaces/user-repository.interface.js';
import {
  GOOGLE_IDENTITY_REPOSITORY,
  GoogleIdentityConflictError,
  type GoogleIdentityRepository,
} from './interfaces/google-identity-repository.interface.js';
import { GOOGLE_SIGN_IN_CLIENT, type GoogleSignInClient } from './google-sign-in.client.js';
import { GoogleIdTokenVerifier, type GoogleIdClaims } from './google-id-token.verifier.js';

export const GOOGLE_SIGN_IN_CONFIG = Symbol('GOOGLE_SIGN_IN_CONFIG');

type Purpose = 'google_sign_in' | 'google_link';

interface StatePayload {
  purpose: Purpose;
  nonce: string;
  keyHash: string;
  /** Link only: the account the flow was started from. */
  sub?: string;
}

export interface GoogleStart {
  authUrl: string;
  /**
   * Kept by the starting page and presented on completion, never put in a URL.
   * Its hash is in the state, so only the browser that started the flow can
   * finish it - the login-CSRF control.
   */
  browserKey: string;
}

export interface GoogleLinkStatus {
  /** Whether this caller could link at all: configured, and for staff a non-empty domain list. */
  available: boolean;
  linked: boolean;
  email: string | null;
  linkedAt: string | null;
}

export interface GoogleActor {
  id: string;
  role: string;
}

const STATE_TTL_SECONDS = 600;

export const MESSAGES = {
  notConfigured: 'Google sign-in is not set up on this server. Sign in with your password.',
  rejected: 'Google sign-in could not be completed. Start again from the sign-in page.',
  // `D-49`. Reveals that an account exists only for an address the caller has
  // just proven they control at Google.
  emailTaken:
    'An account with this email already exists. Sign in with your password, ' +
    'then connect Google from your account settings.',
  // `D-50`.
  noAccount: 'No account uses this Google account. Sign in with your password, or register.',
  cannotSignIn: 'This account cannot sign in.',
  staffOff: 'Google sign-in is not enabled for staff accounts on this server. Sign in with your password.',
  staffDomain:
    'Google sign-in for staff accounts needs an address on an approved domain. Sign in with your password.',
  subTaken: 'That Google account is already connected to another account.',
  alreadyLinked: 'Your account is already connected to a Google account. Disconnect it first.',
  notLinked: 'No Google account is connected.',
} as const;

const isStaff = (role: string) => (STAFF_ALL as readonly string[]).includes(role);
const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

/**
 * Google sign-in and the link that makes it possible (`GAUTH-1`,
 * `SECURITY.md` §2.6, rulings `D-49`…`D-51`).
 *
 * **The rule this service exists to hold: a Google identity reaches an account
 * only through a link, and a link is written only inside a signed-in session.**
 * Sign-in never consults `users.email` to decide who someone is (that is the
 * refusal message, not the mechanism), and nothing here reads the unverified
 * `users.google_email`.
 */
@Injectable()
export class GoogleSignInService {
  private readonly logger = new Logger(GoogleSignInService.name);

  constructor(
    @Inject(GOOGLE_SIGN_IN_CONFIG) private readonly config: GoogleSignInConfig | null,
    @Inject(GOOGLE_SIGN_IN_CLIENT) private readonly client: GoogleSignInClient | null,
    @Inject(GoogleIdTokenVerifier) private readonly verifier: GoogleIdTokenVerifier | null,
    @Inject(GOOGLE_IDENTITY_REPOSITORY) private readonly identities: GoogleIdentityRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private require() {
    if (!this.config || !this.client || !this.verifier) {
      throw new ServiceUnavailableException(MESSAGES.notConfigured);
    }
    return { config: this.config, client: this.client, verifier: this.verifier };
  }

  /** `D-51`: staff pass only with a verified `hd` on a non-empty allow-list. */
  private staffRefusal(role: string, hd: string | null): string | null {
    if (!isStaff(role)) return null;
    const domains = this.config?.staffDomains ?? [];
    if (domains.length === 0) return MESSAGES.staffOff;
    if (!hd || !domains.includes(hd)) return MESSAGES.staffDomain;
    return null;
  }

  private async begin(purpose: Purpose, sub?: string): Promise<GoogleStart> {
    const { client } = this.require();
    const nonce = randomUUID();
    const browserKey = randomBytes(32).toString('base64url');
    const payload: StatePayload = { purpose, nonce, keyHash: sha256(browserKey), ...(sub ? { sub } : {}) };
    const state = await this.jwt.signAsync(payload, { expiresIn: STATE_TTL_SECONDS });
    return { authUrl: client.buildAuthUrl(state, nonce), browserKey };
  }

  /**
   * Everything a completion must prove before its result is worth reading: a
   * state of the right purpose, presented by the browser that started it, a
   * code Google honours, and an `id_token` that verifies against that state's
   * nonce. Every failure is the same 401.
   */
  private async complete(
    purpose: Purpose,
    code: string,
    state: string,
    browserKey: string,
  ): Promise<{ claims: GoogleIdClaims; payload: StatePayload }> {
    const { client, verifier } = this.require();
    let payload: StatePayload;
    try {
      payload = await this.jwt.verifyAsync<StatePayload>(state);
    } catch {
      throw new UnauthorizedException(MESSAGES.rejected);
    }
    // A session token is signed with the same secret and carries no purpose;
    // a state of the other purpose is equally not this one.
    if (payload.purpose !== purpose || typeof payload.nonce !== 'string' || typeof payload.keyHash !== 'string') {
      throw new UnauthorizedException(MESSAGES.rejected);
    }
    const presented = Buffer.from(sha256(browserKey));
    const expected = Buffer.from(payload.keyHash);
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw new UnauthorizedException(MESSAGES.rejected);
    }
    try {
      const { idToken } = await client.exchangeCode(code);
      const claims = await verifier.verify(idToken, payload.nonce);
      return { claims, payload };
    } catch (error) {
      // The reason goes to the log, never to the caller.
      this.logger.warn(`Google ${purpose} refused: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException(MESSAGES.rejected);
    }
  }

  startSignIn(): Promise<GoogleStart> {
    return this.begin('google_sign_in');
  }

  async signIn(code: string, state: string, browserKey: string): Promise<AuthResult> {
    const { claims } = await this.complete('google_sign_in', code, state, browserKey);
    const identity = await this.identities.findBySub(claims.sub);
    if (!identity) {
      // `D-49` / `D-50`. The email decides only which refusal to show.
      const byEmail = await this.users.findByEmail(claims.email);
      throw new UnauthorizedException(byEmail ? MESSAGES.emailTaken : MESSAGES.noAccount);
    }
    const user = await this.users.findById(identity.userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException(MESSAGES.cannotSignIn);
    }
    // Checked at every sign-in against the token presented now, not the `hd`
    // stored at link time: a domain removed from the list stops working at once.
    const refusal = this.staffRefusal(user.role, claims.hd);
    if (refusal) {
      throw new UnauthorizedException(refusal);
    }
    return this.auth.issueSession(user);
  }

  async startLink(actor: GoogleActor): Promise<GoogleStart> {
    this.require();
    // Refused before the round trip to Google, so staff on a server with no
    // domain list are not sent through a consent screen to be told no.
    if (isStaff(actor.role) && (this.config?.staffDomains.length ?? 0) === 0) {
      throw new ForbiddenException(MESSAGES.staffOff);
    }
    return this.begin('google_link', actor.id);
  }

  async link(actor: GoogleActor, code: string, state: string, browserKey: string): Promise<GoogleLinkStatus> {
    const { claims, payload } = await this.complete('google_link', code, state, browserKey);
    // The state names the account the flow started from; the session names the
    // account finishing it. Both must be the same person - otherwise a link
    // started in one account could be completed into another.
    if (payload.sub !== actor.id) {
      throw new UnauthorizedException(MESSAGES.rejected);
    }
    const refusal = this.staffRefusal(actor.role, claims.hd);
    if (refusal) {
      throw new ForbiddenException(refusal);
    }
    const user = await this.users.findById(actor.id);
    if (!user) {
      throw new UnauthorizedException(MESSAGES.rejected);
    }

    return this.db.runInTransaction(async () => {
      let created;
      try {
        created = await this.identities.create({
          userId: user.id,
          googleSub: claims.sub,
          email: claims.email,
          hd: claims.hd,
        });
      } catch (error) {
        if (error instanceof GoogleIdentityConflictError) {
          throw new ConflictException(error.which === 'user' ? MESSAGES.alreadyLinked : MESSAGES.subTaken);
        }
        throw error;
      }
      await this.audit.record({
        actorId: user.id,
        actorRole: actorRoleOf({ role: user.role }),
        action: 'account.google_linked',
        targetType: 'user_google_identity',
        targetId: user.id,
        courseId: null,
        before: null,
        after: { email: created.email, hd: created.hd },
      });
      return { available: true, linked: true, email: created.email, linkedAt: created.linkedAt };
    });
  }

  async status(actor: GoogleActor): Promise<GoogleLinkStatus> {
    const identity = await this.identities.findByUser(actor.id);
    const configured = this.config !== null && this.client !== null && this.verifier !== null;
    const available = configured && (!isStaff(actor.role) || (this.config?.staffDomains.length ?? 0) > 0);
    return {
      available,
      linked: identity !== null,
      email: identity?.email ?? null,
      linkedAt: identity?.linkedAt ?? null,
    };
  }

  /**
   * Always allowed in this unit: every account still has a password (`D-50`),
   * so removing Google cannot lock anyone out. Works on an unconfigured server
   * too - disconnecting must never depend on Google being reachable.
   */
  async unlink(actor: GoogleActor): Promise<void> {
    await this.db.runInTransaction(async () => {
      const removed = await this.identities.removeForUser(actor.id);
      if (!removed) {
        throw new NotFoundException(MESSAGES.notLinked);
      }
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'account.google_unlinked',
        targetType: 'user_google_identity',
        targetId: actor.id,
        courseId: null,
        before: { email: removed.email, hd: removed.hd },
        after: null,
      });
    });
  }
}
