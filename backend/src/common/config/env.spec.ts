import { describe, expect, it } from 'vitest';
import { resolveAutoSeed, resolveStorageDriver } from './env.js';

/**
 * The two environment switches whose wrong value is a *quiet* failure rather
 * than a crash, which is why both refuse production outright and why the
 * refusal is worth a test rather than a comment.
 *
 * Neither resolver reads `process.env` here - both take the raw value as an
 * argument, so these tests cannot be affected by the environment the suite
 * happens to run in, and cannot leak a mutated variable into the next spec.
 */
describe('resolveAutoSeed', () => {
  it('is off unless asked for', () => {
    expect(resolveAutoSeed('development', undefined)).toBe(false);
    expect(resolveAutoSeed('development', '')).toBe(false);
  });

  it('accepts the same four spellings DB_AUTO_MIGRATE does', () => {
    expect(resolveAutoSeed('development', '1')).toBe(true);
    expect(resolveAutoSeed('development', 'true')).toBe(true);
    expect(resolveAutoSeed('development', 'TRUE')).toBe(true);
    expect(resolveAutoSeed('development', '0')).toBe(false);
    expect(resolveAutoSeed('development', 'false')).toBe(false);
  });

  it('throws on a value it does not recognise rather than defaulting off', () => {
    // A misspelled "yes" silently meaning "no" is how a developer loses an
    // afternoon to an empty database.
    expect(() => resolveAutoSeed('development', 'yes')).toThrow(/DB_AUTO_SEED/);
  });

  it('refuses to seed a production database', () => {
    // The fixtures carry student@example.com with a published password hash.
    // Applying them to a real deployment hands out logins.
    expect(() => resolveAutoSeed('production', '1')).toThrow(/refused in production/);
    expect(() => resolveAutoSeed('production', 'true')).toThrow(/refused in production/);
  });

  it('allows the switch to be explicitly off in production', () => {
    // Refusing `0` as well would make a single env file impossible to share
    // across environments, and there is nothing unsafe about "no".
    expect(resolveAutoSeed('production', '0')).toBe(false);
  });
});

describe('resolveStorageDriver', () => {
  it('defaults to local off production and to none on it', () => {
    expect(resolveStorageDriver('development', undefined)).toBe('local');
    expect(resolveStorageDriver('test', undefined)).toBe('local');
    // R2 is the client's to provision (CLAUDE.md §3), so an unconfigured
    // production answers 503 on upload and keeps the URL field working.
    expect(resolveStorageDriver('production', undefined)).toBe('none');
  });

  it('refuses the local disk driver in production', () => {
    // Files would vanish on the next deploy while blog_post_media rows
    // pointing at them survived - broken images and no error anywhere.
    expect(() => resolveStorageDriver('production', 'local')).toThrow(
      /refused in production/,
    );
  });

  it('rejects an unknown driver', () => {
    expect(() => resolveStorageDriver('development', 'r2')).toThrow(
      /STORAGE_DRIVER must be one of/,
    );
  });
});
