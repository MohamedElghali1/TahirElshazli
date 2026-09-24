import { generateKeyPairSync, sign, randomUUID, type JsonWebKey, type KeyObject } from 'node:crypto';
import type { GoogleJwksSource } from '../../src/auth/google/google-id-token.verifier.js';

/**
 * A stand-in for Google's side of OIDC: a real RSA key pair, its JWKS, and a
 * minter for `id_token`s signed with it. The **real** `GoogleIdTokenVerifier`
 * runs against these, so a spec that passes has exercised signature
 * verification rather than a mock that agrees with everything.
 *
 * `strangerKey` signs tokens with a key the JWKS does not publish, for the
 * forged-signature case.
 */
export const TEST_CLIENT_ID = 'test-client.apps.googleusercontent.com';

export class FakeGoogle implements GoogleJwksSource {
  readonly kid = `kid-${randomUUID()}`;
  private readonly key: KeyObject;
  readonly publicJwk: JsonWebKey;
  private readonly strangerKey: KeyObject;

  constructor() {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.key = pair.privateKey;
    this.publicJwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: this.kid, alg: 'RS256', use: 'sig' };
    this.strangerKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  }

  async fetchKeys(): Promise<JsonWebKey[]> {
    return [this.publicJwk];
  }

  /** Claims a real Google token would carry, overridable one at a time. */
  claims(over: Record<string, unknown> = {}): Record<string, unknown> {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: 'https://accounts.google.com',
      aud: TEST_CLIENT_ID,
      sub: 'google-sub-1',
      email: 'someone@gmail.com',
      email_verified: true,
      iat: now,
      exp: now + 3600,
      nonce: 'nonce-1',
      ...over,
    };
  }

  mint(
    claims: Record<string, unknown>,
    opts: { header?: Record<string, unknown>; stranger?: boolean } = {},
  ): string {
    const header = { alg: 'RS256', kid: this.kid, typ: 'JWT', ...opts.header };
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const input = `${enc(header)}.${enc(claims)}`;
    const signature = sign('RSA-SHA256', Buffer.from(input), opts.stranger ? this.strangerKey : this.key);
    return `${input}.${signature.toString('base64url')}`;
  }
}
