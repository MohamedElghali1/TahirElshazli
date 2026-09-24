import type { GoogleSignInConfig } from '../../common/config/env.js';

/**
 * The two calls sign-in makes to Google: where to send the browser, and the
 * code exchange that returns an `id_token`. A port, so e2e can stand in for
 * Google while the real `GoogleIdTokenVerifier` still checks what comes back.
 *
 * Deliberately separate from the Forms `GoogleOAuthService`: that one asks for
 * `forms.*` scopes, offline access and a forced consent screen, none of which a
 * sign-in wants. Sharing it would put Forms permissions on every student's
 * consent screen.
 */
export interface GoogleSignInClient {
  buildAuthUrl(state: string, nonce: string): string;
  /** Throws on any failure; the caller turns that into one refusal. */
  exchangeCode(code: string): Promise<{ idToken: string }>;
}

export const GOOGLE_SIGN_IN_CLIENT = Symbol('GOOGLE_SIGN_IN_CLIENT');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export class HttpGoogleSignInClient implements GoogleSignInClient {
  constructor(private readonly config: GoogleSignInConfig) {}

  buildAuthUrl(state: string, nonce: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      // Identity only. No offline access and no refresh token: nothing is
      // stored from a sign-in but the `sub` link.
      scope: 'openid email',
      // Lets someone signed in to two Google accounts pick the right one,
      // rather than silently using whichever was last active.
      prompt: 'select_account',
      state,
      nonce,
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ idToken: string }> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const body = (await response.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!response.ok || !body.id_token) {
      throw new Error(`Google token exchange failed: ${body.error ?? `http_${response.status}`}`);
    }
    return { idToken: body.id_token };
  }
}
