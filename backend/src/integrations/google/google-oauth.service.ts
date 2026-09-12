import { Injectable, Logger } from '@nestjs/common';
import type { GoogleOAuthConfig } from '../../common/config/env.js';

/**
 * The OAuth 2.0 conversation with Google, and nothing else.
 *
 * Deliberately knows nothing about this application's database, users or
 * audit log - it exchanges codes for tokens and refresh tokens for access
 * tokens. `GoogleIntegrationService` is what turns that into a connected
 * account. Keeping the split means the awkward parts of OAuth are testable
 * without a database and readable without holding the rest of the feature in
 * your head.
 *
 * **No `googleapis` dependency.** That package is tens of megabytes and pulls
 * in a generated client for every Google product; this integration needs four
 * HTTP calls. Node 24 has global `fetch`, so the whole client is this file plus
 * `GoogleFormsClient` - which also matches a codebase whose only heavy runtime
 * dependency is `pg`.
 */

/** Where the user is sent to consent. */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
/** Where codes and refresh tokens are exchanged. */
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
/** Where a grant is given back on disconnect. */
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
/** Who just connected. OIDC, so it needs no extra API to be enabled. */
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * What the app asks for. Narrow on purpose - every scope here has to be
 * justified on the consent screen the teacher reads, and a request for more
 * than is used is both a worse consent experience and a bigger blast radius.
 *
 * - `forms.body.readonly` - the form's structure: its title, whether it is a
 *   quiz, the questions and their point values. Needed to show the teacher what
 *   they linked and to interpret a score out of a total.
 * - `forms.responses.readonly` - the responses themselves. This is the one that
 *   makes the whole feature possible and the one Google classifies as
 *   **sensitive**, which is what drives the verification requirement described
 *   in docs/google-forms-setup.md.
 * - `openid`, `email` - so the status screen can say *which* account is
 *   connected. Without it the answer to "why can't it see my form?" has no
 *   obvious first check.
 *
 * Notably absent: any `drive` scope. Listing the teacher's forms from Drive
 * would be a nicer picker than pasting a URL, but `drive.readonly` grants read
 * access to **every file in their Drive**, which is a restricted scope with a
 * much heavier verification burden and a far worse consent prompt. Pasting a
 * URL is a small cost to avoid asking for that.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'openid',
  'email',
] as const;

export interface GoogleTokenGrant {
  accessToken: string;
  /**
   * Present only on the **first** consent, or when `prompt=consent` forces a
   * fresh grant. Google omits it on subsequent authorisations, which is the
   * single most common way an integration like this ends up storing `undefined`
   * and failing a week later - see `buildAuthUrl`, which forces it.
   */
  refreshToken: string | null;
  /** What was actually granted, which may be narrower than what was asked. */
  scopes: string[];
  expiresInSeconds: number;
}

export interface GoogleAccountIdentity {
  email: string;
  /** The OIDC subject: stable across an email change, unlike the address. */
  sub: string;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private readonly config: GoogleOAuthConfig) {}

  /**
   * The URL to send the teacher to. One click, once, and never again.
   *
   * Three parameters here are load-bearing and each one is a documented way
   * this integration breaks if omitted:
   *
   * - **`access_type=offline`** is what makes Google issue a refresh token at
   *   all. Without it the app gets an hour of access and then silently stops
   *   working, which is the failure this whole design exists to avoid.
   * - **`prompt=consent`** forces a refresh token on *every* authorisation, not
   *   just the first. Google omits it when the user has already consented, so
   *   reconnecting after a key rotation would otherwise store nothing and
   *   appear to succeed. Reconnect is the documented fix for several failure
   *   modes; it has to actually work.
   * - **`include_granted_scopes=true`** makes an incremental grant additive
   *   rather than replacing what was granted before.
   *
   * `state` is supplied by the caller and is a signed, short-lived token
   * identifying the teacher - see `GoogleIntegrationService`. It is what makes
   * the public callback safe.
   */
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  /** Exchanges the one-time code from the callback for a token grant. */
  async exchangeCode(code: string): Promise<GoogleTokenGrant> {
    return this.tokenRequest({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });
  }

  /**
   * Trades the stored refresh token for a fresh access token.
   *
   * Access tokens are deliberately **not** cached anywhere. They last an hour,
   * and at CLAUDE.md §7.3's numbers a sync runs on the order of once per
   * assignment per few minutes - so caching would add a shared-state problem
   * (§5.11's five conditions, and the same per-process trap the rate limiter
   * has) to save an HTTP round trip nobody is waiting on.
   */
  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenGrant> {
    return this.tokenRequest({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });
  }

  /** Who this grant belongs to, for the status screen. */
  async fetchIdentity(accessToken: string): Promise<GoogleAccountIdentity> {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(
        `Google rejected the userinfo request (${response.status}). ` +
          'The connection was not completed.',
      );
    }
    const body = (await response.json()) as { email?: string; sub?: string };
    if (!body.email || !body.sub) {
      // Both come from the `openid email` scopes. Missing means the consent
      // screen returned a narrower grant than was asked for, which is a real
      // state rather than an impossible one.
      throw new Error(
        'Google did not return an account email. Re-run the connection and ' +
          'leave every permission ticked on the consent screen.',
      );
    }
    return { email: body.email, sub: body.sub };
  }

  /**
   * Tells Google the app no longer wants the grant.
   *
   * Best-effort, and deliberately so: the caller deletes the row regardless.
   * A revoke that fails because the user already removed the app from their
   * Google account settings would otherwise block a disconnect and leave the
   * credential in this database - the opposite of what was asked for.
   */
  async revoke(refreshToken: string): Promise<boolean> {
    try {
      const response = await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
      return response.ok;
    } catch (error) {
      this.logger.warn(
        `Revoking the Google grant failed: ${String(error)}. The stored ` +
          'credential is still being deleted.',
      );
      return false;
    }
  }

  private async tokenRequest(
    params: Record<string, string>,
  ): Promise<GoogleTokenGrant> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });

    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !body.access_token) {
      // Google's `error` is a short machine code (`invalid_grant`,
      // `redirect_uri_mismatch`) and the description is the human half. Both
      // are surfaced because the codes are the searchable part and the
      // descriptions are the actionable part - and because the two most common
      // ones here have causes a developer cannot guess from a 400 alone.
      const code = body.error ?? `http_${response.status}`;
      const detail = body.error_description ?? 'no further detail';
      throw new Error(`Google token request failed: ${code} (${detail}).`);
    }

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      // Space-delimited per the spec, and read back rather than assumed: a user
      // who unticks a permission produces a narrower grant than was requested.
      scopes: body.scope?.split(' ').filter(Boolean) ?? [],
      expiresInSeconds: body.expires_in ?? 3600,
    };
  }
}

/** DI token - the config is constructor-injected, so the class needs a factory. */
export const GOOGLE_OAUTH_SERVICE = Symbol('GOOGLE_OAUTH_SERVICE');
