import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { Role } from '../../auth/roles.enum.js';
import { actorRoleOf } from '../../auth/actor-role.js';
import type { StaffActor } from '../../staff/staff-scope.service.js';
import type { GoogleCredentialRepository } from './interfaces/google-credential-repository.interface.js';
import { GOOGLE_CREDENTIAL_REPOSITORY } from './interfaces/google-credential-repository.interface.js';
import {
  GOOGLE_SCOPES,
  GoogleOAuthService,
} from './google-oauth.service.js';
import {
  GoogleFormsClient,
  type GoogleFormMeta,
} from './google-forms.client.js';
import { TokenCipher } from './token-cipher.js';

/**
 * Who is acting. Imported rather than redeclared: `StaffScopeService` already
 * defines this shape and a second copy would be one more place for
 * `JwtPayload.role` (a plain string) to be typed as something narrower than it
 * is. Type-only, so this adds no module dependency on `StaffModule`.
 */
export type { StaffActor };

export interface GoogleIntegrationStatus {
  /** Whether the server has OAuth credentials at all (`GOOGLE_DRIVER=google`). */
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  /**
   * False when the stored grant is missing a scope the feature needs - the
   * "connected, but the user unticked a box" state, which otherwise surfaces
   * as an unexplained 403 the first time someone opens an analytics screen.
   */
  hasRequiredScopes: boolean;
}

/**
 * How long the OAuth `state` token is good for. Long enough to read a consent
 * screen carefully, short enough that a leaked redirect URL sitting in a
 * browser history is not a standing invitation to bind an account.
 */
const STATE_TTL_SECONDS = 600;

/** Marks a JWT as an OAuth state rather than a session token. See `signState`. */
const STATE_PURPOSE = 'google_oauth_state';

/**
 * The connected Google account: connecting it, disconnecting it, and handing
 * the rest of the feature a usable access token.
 *
 * Everything here is teacher-only. CLAUDE.md §2.2 keeps a TA out of integration
 * configuration for the same reason it keeps them out of payments and accounts
 * - and §5.11.1's "TAs see everything" widened *visibility*, never capability.
 * A TA will consume this connection when reading analytics for their own
 * courses; they do not get to establish or replace it.
 */
@Injectable()
export class GoogleIntegrationService {
  private readonly logger = new Logger(GoogleIntegrationService.name);

  constructor(
    @Inject(GOOGLE_CREDENTIAL_REPOSITORY)
    private readonly credentials: GoogleCredentialRepository,
    /**
     * Null when `GOOGLE_DRIVER=none`, exactly as `FILE_STORAGE` is null without
     * a storage driver. Every entry point checks and answers 503 rather than
     * the module refusing to load - the platform stays fully usable without
     * this integration, which is what makes `none` a defensible default.
     */
    @Inject(GoogleOAuthService)
    private readonly oauth: GoogleOAuthService | null,
    @Inject(TokenCipher)
    private readonly cipher: TokenCipher | null,
    private readonly forms: GoogleFormsClient,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  private require(): { oauth: GoogleOAuthService; cipher: TokenCipher } {
    if (!this.oauth || !this.cipher) {
      throw new ServiceUnavailableException(
        'The Google integration is not configured on this server. Set ' +
          'GOOGLE_DRIVER=google with the OAuth client credentials - see ' +
          'docs/google-forms-setup.md.',
      );
    }
    return { oauth: this.oauth, cipher: this.cipher };
  }

  get configured(): boolean {
    return this.oauth !== null && this.cipher !== null;
  }

  async status(): Promise<GoogleIntegrationStatus> {
    const credential = await this.credentials.findActive();
    return {
      configured: this.configured,
      connected: credential !== null,
      googleEmail: credential?.googleEmail ?? null,
      connectedAt: credential?.connectedAt ?? null,
      lastUsedAt: credential?.lastUsedAt ?? null,
      lastError: credential?.lastError ?? null,
      hasRequiredScopes: credential
        ? GOOGLE_SCOPES.every((scope) => credential.scopes.includes(scope))
        : false,
    };
  }

  /**
   * The URL to send the teacher to, with a signed `state`.
   *
   * **The state is the security control on the callback**, which has to be
   * `@Public()`: it is reached by a top-level browser redirect from Google,
   * which carries no `Authorization` header, so there is no session to read
   * there. Signing the initiating teacher's id into a short-lived JWT is what
   * lets the callback know - and prove - who started the flow.
   *
   * Without it the callback would have to trust a user id from the query
   * string, and anyone who could reach the URL could bind *their own* Google
   * account as the platform's integration. That is the whole attack, and it is
   * why `purpose` is checked too: a session token must not be usable here, and
   * a state token must not be usable as a session.
   */
  async beginConnect(actor: StaffActor): Promise<{ authUrl: string }> {
    const { oauth } = this.require();
    const state = await this.jwt.signAsync(
      {
        sub: actor.id,
        // Carried so the callback can record who acted *as what* without
        // assuming. The callback has no session to read it from - that is the
        // whole reason the state token exists - so deriving it later would mean
        // a database lookup or a hardcoded `Role.Teacher`, and §5.4 is
        // explicit that the second is how an audit trail starts lying.
        role: actor.role,
        purpose: STATE_PURPOSE,
        nonce: randomUUID(),
      },
      { expiresIn: STATE_TTL_SECONDS },
    );
    return { authUrl: oauth.buildAuthUrl(state) };
  }

  /**
   * Handles Google's redirect back: verifies the state, exchanges the code,
   * and stores the grant.
   *
   * Returns the connected account's email so the callback can render something
   * truthful. Throws on every failure rather than redirecting with an error
   * code, because the controller renders the outcome as a page either way.
   */
  async completeConnect(
    code: string,
    state: string,
  ): Promise<{ googleEmail: string }> {
    const { oauth, cipher } = this.require();

    let actorId: string;
    let actorRole: Role;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        role?: string;
        purpose?: string;
      }>(state);
      if (payload.purpose !== STATE_PURPOSE) {
        // A valid session token would otherwise be accepted here. It is signed
        // with the same secret, so only this check separates "the teacher
        // started a connection" from "someone pasted their own access token".
        throw new Error('wrong purpose');
      }
      actorId = payload.sub;
      // Resolved here, inside the same `try`, rather than at the audit write:
      // a state token carrying no usable role is an unusable state token, and
      // refusing it as one keeps the failure at the boundary instead of
      // aborting the transaction from inside the audit entry.
      actorRole = actorRoleOf({ role: payload.role ?? '' });
    } catch {
      throw new ForbiddenException(
        'This Google connection link is invalid or has expired. Start the ' +
          'connection again from the integration screen.',
      );
    }

    const grant = await oauth.exchangeCode(code);
    if (!grant.refreshToken) {
      // `prompt=consent` is supposed to guarantee one. If it is still missing,
      // storing the grant would produce an integration that works for an hour
      // and then fails with no explanation - so this refuses loudly instead.
      throw new ServiceUnavailableException(
        'Google did not return a refresh token, so the connection would stop ' +
          'working within the hour. Remove this app from your Google account ' +
          'permissions and connect again.',
      );
    }

    const identity = await oauth.fetchIdentity(grant.accessToken);

    // The credential write and its audit entry commit together (CLAUDE.md
    // §5.4). `AuditService.record` throws outside a transaction, so this is
    // enforced rather than remembered.
    return this.db.runInTransaction(async () => {
      const credential = await this.credentials.upsert({
        userId: actorId,
        googleEmail: identity.email,
        googleSub: identity.sub,
        refreshToken: cipher.encrypt(grant.refreshToken!),
        scopes: grant.scopes,
      });

      await this.audit.record({
        actorId,
        // From the signed state, so it is the role of whoever actually started
        // the flow rather than the role this route happens to require today.
        actorRole,
        action: 'google.connected',
        targetType: 'google_credential',
        targetId: credential.id,
        courseId: null,
        before: null,
        // The email, never the token. An audit entry is read by people and
        // kept for years; a credential in one is a credential leaked to
        // everyone who can read the log (§8).
        after: {
          googleEmail: identity.email,
          scopes: grant.scopes.join(' '),
        },
      });

      return { googleEmail: identity.email };
    });
  }

  /** Revokes the grant with Google and deletes the stored credential. */
  async disconnect(actor: StaffActor): Promise<void> {
    const { oauth, cipher } = this.require();
    const credential = await this.credentials.findActiveWithToken();
    if (!credential) {
      // Idempotent: disconnecting what is already disconnected is the state the
      // caller asked for, not an error worth a 404 on a settings screen.
      return;
    }

    // Revoke before deleting, but never let a failed revoke block the delete -
    // `revoke` swallows its own errors for exactly that reason. The likeliest
    // cause is the user having already removed the app in their Google account
    // settings, where refusing to clean up our row would be perverse.
    try {
      await oauth.revoke(cipher.decrypt(credential.refreshToken));
    } catch (error) {
      this.logger.warn(
        `Could not decrypt the stored token to revoke it: ${String(error)}. ` +
          'Deleting the credential anyway.',
      );
    }

    await this.db.runInTransaction(async () => {
      await this.credentials.remove(credential.id);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'google.disconnected',
        targetType: 'google_credential',
        targetId: credential.id,
        courseId: null,
        before: { googleEmail: credential.googleEmail },
        after: null,
      });
    });
  }

  /**
   * A fresh access token for the connected account.
   *
   * The one place the stored secret is decrypted and used. Records success or
   * failure against the credential, which is what turns the silent failure
   * modes (a revoked grant, a seven-day testing-mode expiry, a rotated
   * encryption key) into something the status screen can show before anyone
   * notices analytics have stopped updating.
   */
  async accessToken(): Promise<string> {
    const { oauth, cipher } = this.require();
    const credential = await this.credentials.findActiveWithToken();
    if (!credential) {
      throw new ServiceUnavailableException(
        'No Google account is connected. Connect one on the integration screen.',
      );
    }

    try {
      const grant = await oauth.refreshAccessToken(
        cipher.decrypt(credential.refreshToken),
      );
      await this.credentials.markUsed(credential.id);
      return grant.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.credentials.markError(credential.id, message);
      // Deliberately not rethrowing the raw Google error: `invalid_grant` is
      // the common one and means almost nothing to a reader, while the three
      // causes worth checking are always the same three.
      throw new ServiceUnavailableException(
        'The stored Google credentials are no longer valid, so responses ' +
          'cannot be read. This usually means access was revoked in the ' +
          "Google account's security settings, or the OAuth consent screen " +
          'is still in Testing mode (which expires access after seven days). ' +
          'Reconnect the Google account to fix it.',
      );
    }
  }

  /**
   * Reads a form's metadata - the "does this actually work?" probe.
   *
   * This is the endpoint the setup walkthrough ends on, and it exists because
   * every other way of discovering that the integration is misconfigured
   * involves a teacher, a class of students, and a deadline. It exercises the
   * whole chain in one call: stored credential, decryption, token refresh, API
   * authorisation and form access.
   */
  async inspectForm(formUrlOrId: string): Promise<GoogleFormMeta> {
    const formId = this.forms.parseFormId(formUrlOrId);
    const token = await this.accessToken();
    return this.forms.fetchForm(token, formId);
  }
}
