import { createHmac } from 'node:crypto';
import { GoogleIdTokenVerifier, IdTokenRejectedError } from './google-id-token.verifier.js';
import { FakeGoogle, TEST_CLIENT_ID } from '../../../test/support/fake-google.js';

/**
 * `SECURITY.md` §2.6: verify the `id_token`'s signature and `aud`. Each refusal
 * is asserted by its reason, so a test cannot pass because an *earlier* check
 * happened to fail.
 */
describe('GoogleIdTokenVerifier', () => {
  const google = new FakeGoogle();
  const verifier = new GoogleIdTokenVerifier(TEST_CLIENT_ID, google);

  const rejects = async (token: string, reason: string, nonce = 'nonce-1') => {
    const error = await verifier.verify(token, nonce).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdTokenRejectedError);
    expect((error as IdTokenRejectedError).reason).toBe(reason);
  };

  it('accepts a genuine token and returns only sub, email and hd', async () => {
    const claims = await verifier.verify(
      google.mint(google.claims({ email: 'Staff@School.org', hd: 'School.org', name: 'ignored' })),
      'nonce-1',
    );
    expect(claims).toEqual({ sub: 'google-sub-1', email: 'staff@school.org', hd: 'school.org' });
  });

  it('gives a consumer account a null hd', async () => {
    expect((await verifier.verify(google.mint(google.claims()), 'nonce-1')).hd).toBeNull();
  });

  it('refuses a token signed by a key Google does not publish', async () => {
    await rejects(google.mint(google.claims(), { stranger: true }), 'bad signature');
  });

  it('refuses a payload altered after signing', async () => {
    const [h, , s] = google.mint(google.claims()).split('.');
    const forged = Buffer.from(JSON.stringify(google.claims({ sub: 'someone-else' }))).toString('base64url');
    await rejects(`${h}.${forged}.${s}`, 'bad signature');
  });

  it('refuses alg none and an HS256 token keyed with the public key', async () => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const payload = enc(google.claims());
    await rejects(`${enc({ alg: 'none', kid: google.kid })}.${payload}.x`, 'alg none');

    const header = enc({ alg: 'HS256', kid: google.kid });
    const mac = createHmac('sha256', JSON.stringify(google.publicJwk))
      .update(`${header}.${payload}`)
      .digest('base64url');
    await rejects(`${header}.${payload}.${mac}`, 'alg HS256');
  });

  it('refuses an unknown kid', async () => {
    await rejects(google.mint(google.claims(), { header: { kid: 'rotated-away' } }), 'unknown kid');
  });

  it('refuses the wrong audience - a token minted for another app', async () => {
    await rejects(google.mint(google.claims({ aud: 'someone-elses-client' })), 'aud');
  });

  it('refuses the wrong issuer', async () => {
    await rejects(google.mint(google.claims({ iss: 'https://evil.example' })), 'iss');
  });

  it('refuses an expired token and one issued in the future', async () => {
    const now = Math.floor(Date.now() / 1000);
    await rejects(google.mint(google.claims({ exp: now - 120 })), 'expired');
    await rejects(google.mint(google.claims({ iat: now + 600 })), 'iat in the future');
  });

  it('refuses a token from another flow (nonce mismatch or absent)', async () => {
    await rejects(google.mint(google.claims()), 'nonce', 'a-different-nonce');
    await rejects(google.mint(google.claims({ nonce: undefined })), 'nonce');
  });

  it('refuses an unverified email', async () => {
    await rejects(google.mint(google.claims({ email_verified: false })), 'email not verified');
    await rejects(google.mint(google.claims({ email_verified: 'true' })), 'email not verified');
  });

  it('refuses garbage', async () => {
    await rejects('not-a-jwt', 'not a compact JWS');
    await rejects('a.b.c', 'malformed header');
  });
});
