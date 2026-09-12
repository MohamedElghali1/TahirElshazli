import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Authenticated encryption for the stored Google refresh token.
 *
 * CLAUDE.md §8 requires sensitive data encrypted at rest. A refresh token is
 * the sharpest example of that in this database: it is a bearer credential for
 * a real Google account, it does not expire on its own, and anyone holding it
 * can read every form Dr. Tahir owns without touching this application at all.
 *
 * **AES-256-GCM, not CBC.** GCM authenticates the ciphertext, so a tampered
 * value fails to decrypt rather than decrypting to something else. That matters
 * more than it might look: the decrypted output is sent to Google as a
 * credential, and an unauthenticated mode would let someone who can write to
 * the database steer what this server transmits.
 *
 * No new dependency - `node:crypto` is in the standard library, and this file
 * is short enough to read in full, which is the property that matters most for
 * anything holding a key.
 */

/**
 * Version prefix on every ciphertext.
 *
 * The stored value describes its own format, so rotating the scheme later is a
 * matter of writing `v2` and keeping a `v1` branch to read old rows - rather
 * than guessing what an existing row was written by, which is the position
 * anyone regrets being in.
 */
const VERSION = 'v1';

/** 96 bits, the size GCM is specified for and the size it is fastest at. */
const IV_BYTES = 12;

/** 128 bits. Truncating a GCM tag weakens the authentication it exists for. */
const TAG_BYTES = 16;

export class TokenCipher {
  /**
   * @param key exactly 32 bytes. `resolveGoogleTokenKey` has already checked
   * the length and thrown a message naming the variable if it was wrong, so a
   * bad key never reaches here - but the constructor re-checks, because a
   * silent 16-byte key would mean AES-128 under a name that promises 256.
   */
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error(
        `TokenCipher requires a 32-byte key (got ${key.length}).`,
      );
    }
  }

  /**
   * Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url.
   *
   * A fresh random IV per call, never a counter and never derived from the
   * plaintext: GCM's security collapses entirely if an IV is reused under the
   * same key, and "the same teacher reconnecting the same account" is exactly
   * the repeat that a derived IV would produce.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  /**
   * Throws on anything that is not an intact `v1` ciphertext under this key.
   *
   * Throwing rather than returning null is deliberate. Every caller wants the
   * token in order to talk to Google, and a null would be threaded through as
   * "not connected" - which is a different and much more confusing state than
   * "connected, but the encryption key changed". The service turns this into a
   * message that says to reconnect.
   */
  decrypt(encoded: string): string {
    const parts = encoded.split('.');
    if (parts.length !== 4) {
      throw new Error('Stored Google token is malformed.');
    }
    const [version, ivB64, tagB64, dataB64] = parts;
    if (version !== VERSION) {
      throw new Error(
        `Stored Google token has unsupported format "${version}".`,
      );
    }
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Stored Google token is malformed.');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // `final()` throws when the tag does not verify: either the row was
      // tampered with or the key is not the one it was written under. The
      // message says neither, because the distinction is not one the caller can
      // act on differently and guessing at it in a log is how a key-rotation
      // incident gets misfiled as a database corruption one.
      throw new Error(
        'Stored Google token could not be decrypted. It was encrypted with a ' +
          'different GOOGLE_TOKEN_ENCRYPTION_KEY, or the row has been altered. ' +
          'Reconnect the Google account to replace it.',
      );
    }
  }
}

/**
 * Constant-time comparison for the OAuth `state` nonce.
 *
 * Lives here rather than in the OAuth service because it is the same class of
 * concern and the same import. `timingSafeEqual` throws on a length mismatch,
 * so the lengths are checked first - and the check is not itself a leak worth
 * worrying about, since the nonce length is fixed and public.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
