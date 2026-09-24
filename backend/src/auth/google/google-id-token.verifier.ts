import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

/**
 * Verifies a Google OIDC `id_token` (`GAUTH-1`, `SECURITY.md` §2.6).
 *
 * The token comes straight from Google's token endpoint over TLS, which OIDC
 * says is enough on its own - it is verified anyway, because the rule for this
 * unit is "verify the signature and `aud`" and because a check that is only
 * implied by transport is a check the next refactor removes.
 *
 * **No JOSE library.** Node's `createPublicKey({ format: 'jwk' })` and
 * `crypto.verify` are all RS256 needs, which matches the Forms integration's
 * reasons for having no `googleapis` (`google-oauth.service.ts`).
 *
 * **Keys are fetched per verification, not cached.** Sign-ins are rare at
 * CLAUDE.md §1's numbers, and a key cache is another per-process structure with
 * its own expiry bugs; one HTTP round trip on a sign-in is not worth either.
 */

/** What a verified token establishes. Nothing else from the payload is trusted. */
export interface GoogleIdClaims {
  sub: string;
  email: string;
  /** The Workspace domain, or null for a consumer account. */
  hd: string | null;
}

/** Where the signing keys come from - Google's JWKS in production, a test key in specs. */
export interface GoogleJwksSource {
  fetchKeys(): Promise<JsonWebKey[]>;
}

export const GOOGLE_JWKS_SOURCE = Symbol('GOOGLE_JWKS_SOURCE');

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export class HttpGoogleJwksSource implements GoogleJwksSource {
  async fetchKeys(): Promise<JsonWebKey[]> {
    const response = await fetch(GOOGLE_JWKS_URL);
    if (!response.ok) {
      throw new IdTokenRejectedError(`jwks http ${response.status}`);
    }
    const body = (await response.json()) as { keys?: JsonWebKey[] };
    return body.keys ?? [];
  }
}

/**
 * A refusal. `reason` is for tests and the server log only - the caller always
 * gets one message, so a probe cannot learn which check it failed.
 */
export class IdTokenRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`id_token rejected: ${reason}`);
  }
}

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SECONDS = 60;

function decodeSegment(segment: string, what: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new IdTokenRejectedError(`malformed ${what}`);
}

export class GoogleIdTokenVerifier {
  constructor(
    private readonly clientId: string,
    private readonly jwks: GoogleJwksSource,
  ) {}

  async verify(
    idToken: string,
    expectedNonce: string,
    nowMs: number = Date.now(),
  ): Promise<GoogleIdClaims> {
    const parts = idToken.split('.');
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
      throw new IdTokenRejectedError('not a compact JWS');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = decodeSegment(headerB64, 'header');

    // Pinned, not read from the token: `alg: none` and an HS256 token "signed"
    // with the public key are the two classic ways a verifier that trusts the
    // header accepts a forgery.
    if (header.alg !== 'RS256') {
      throw new IdTokenRejectedError(`alg ${String(header.alg)}`);
    }
    if (typeof header.kid !== 'string') {
      throw new IdTokenRejectedError('no kid');
    }
    const jwk = (await this.jwks.fetchKeys()).find(
      (k) => k.kid === header.kid && k.kty === 'RSA' && (k.alg === undefined || k.alg === 'RS256'),
    );
    if (!jwk) {
      throw new IdTokenRejectedError('unknown kid');
    }

    let signatureOk = false;
    try {
      signatureOk = verify(
        'RSA-SHA256',
        Buffer.from(`${headerB64}.${payloadB64}`),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(signatureB64, 'base64url'),
      );
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) {
      throw new IdTokenRejectedError('bad signature');
    }

    // Only now is the payload worth reading.
    const claims = decodeSegment(payloadB64, 'payload');
    const nowSeconds = Math.floor(nowMs / 1000);

    if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) {
      throw new IdTokenRejectedError('iss');
    }
    // `aud` may be an array in general OIDC; Google issues a string. Either
    // way it must name this client and nothing else may be the sole audience.
    const aud = claims.aud;
    const audOk = Array.isArray(aud) ? aud.includes(this.clientId) : aud === this.clientId;
    if (!audOk) {
      throw new IdTokenRejectedError('aud');
    }
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds) {
      throw new IdTokenRejectedError('expired');
    }
    if (typeof claims.iat !== 'number' || claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
      throw new IdTokenRejectedError('iat in the future');
    }
    if (typeof claims.nonce !== 'string' || claims.nonce !== expectedNonce) {
      throw new IdTokenRejectedError('nonce');
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new IdTokenRejectedError('sub');
    }
    // An unverified address is one Google has not checked the user owns -
    // exactly the thing an email-matching refusal must not be told about.
    if (claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email) {
      throw new IdTokenRejectedError('email not verified');
    }
    const hd = typeof claims.hd === 'string' && claims.hd ? claims.hd.toLowerCase() : null;

    return { sub: claims.sub, email: claims.email.toLowerCase(), hd };
  }
}
