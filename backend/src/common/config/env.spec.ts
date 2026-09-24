import { describe, expect, it } from 'vitest';
import {
  resolveGoogleSignInConfig,
  resolveAutoSeed,
  resolveMailDriver,
  resolveSmtpConfig,
  resolveStorageDriver,
} from './env.js';

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

describe('resolveMailDriver', () => {
  it('defaults to log off production and to none on it', () => {
    expect(resolveMailDriver('development', undefined)).toBe('log');
    expect(resolveMailDriver('test', undefined)).toBe('log');
    expect(resolveMailDriver('production', undefined)).toBe('none');
  });

  it.each(['none', 'log', 'smtp'] as const)('accepts %s', (v) => {
    expect(resolveMailDriver('development', v)).toBe(v);
  });

  it('rejects an unknown driver', () => {
    expect(() => resolveMailDriver('development', 'sendgrid')).toThrow(
      /MAIL_DRIVER must be one of/,
    );
  });

  it('does not refuse log in production', () => {
    // Unlike STORAGE_DRIVER=local, a swallowed email is not data-loss.
    expect(resolveMailDriver('production', 'log')).toBe('log');
  });
});

describe('resolveSmtpConfig', () => {
  const full = {
    MAIL_SMTP_HOST: 'smtp.example.com',
    MAIL_SMTP_PORT: '587',
    MAIL_SMTP_USER: 'user',
    MAIL_SMTP_PASS: 'pass',
    MAIL_SMTP_FROM: 'noreply@example.com',
  };

  it('returns a config when all vars are set', () => {
    const config = resolveSmtpConfig(full);
    expect(config).toEqual({
      host: 'smtp.example.com',
      port: 587,
      user: 'user',
      pass: 'pass',
      from: 'noreply@example.com',
    });
  });

  it('throws when a required var is missing', () => {
    const { MAIL_SMTP_HOST: _, ...rest } = full;
    expect(() => resolveSmtpConfig(rest)).toThrow(/MAIL_SMTP_HOST/);
  });

  it('throws when MAIL_SMTP_PORT is not a number', () => {
    expect(() =>
      resolveSmtpConfig({ ...full, MAIL_SMTP_PORT: 'abc' }),
    ).toThrow(/must be a number/);
  });
});

describe('resolveGoogleSignInConfig (GAUTH-1, D-51)', () => {
  const google = {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.com/admin/integrations/google/callback',
  };

  it('is off (null) without a sign-in redirect URI, even with Google configured', () => {
    expect(resolveGoogleSignInConfig('google', 'production', { ...google })).toBeNull();
    expect(resolveGoogleSignInConfig('none', 'development', {})).toBeNull();
  });

  it('reuses the OAuth client and normalises the staff domain list', () => {
    const config = resolveGoogleSignInConfig('google', 'production', {
      ...google,
      GOOGLE_SIGN_IN_REDIRECT_URI: 'https://tahirelshazli.com/google/callback',
      STAFF_GOOGLE_DOMAINS: ' TahirElshazli.com, tahirelshazli.com ,school.org',
    });
    expect(config).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://tahirelshazli.com/google/callback',
      staffDomains: ['tahirelshazli.com', 'school.org'],
    });
  });

  it('leaves staff Google sign-in off when the domain list is empty', () => {
    const config = resolveGoogleSignInConfig('google', 'production', {
      ...google,
      GOOGLE_SIGN_IN_REDIRECT_URI: 'https://tahirelshazli.com/google/callback',
    });
    expect(config!.staffDomains).toEqual([]);
  });

  it('refuses a malformed staff domain at boot', () => {
    for (const bad of ['@gmail.com', 'https://school.org', '*.school.org', 'localhost', 'school .org']) {
      expect(() =>
        resolveGoogleSignInConfig('google', 'development', { ...google, STAFF_GOOGLE_DOMAINS: bad }),
      ).toThrow(/STAFF_GOOGLE_DOMAINS/);
    }
  });

  it('refuses a sign-in URI without the Google driver, a relative URI, and http in production', () => {
    expect(() =>
      resolveGoogleSignInConfig('none', 'development', { GOOGLE_SIGN_IN_REDIRECT_URI: 'https://x.org/cb' }),
    ).toThrow(/GOOGLE_DRIVER/);
    expect(() =>
      resolveGoogleSignInConfig('google', 'development', { ...google, GOOGLE_SIGN_IN_REDIRECT_URI: '/google/callback' }),
    ).toThrow(/absolute URL/);
    expect(() =>
      resolveGoogleSignInConfig('google', 'production', { ...google, GOOGLE_SIGN_IN_REDIRECT_URI: 'http://x.org/cb' }),
    ).toThrow(/https/);
    expect(
      resolveGoogleSignInConfig('google', 'development', { ...google, GOOGLE_SIGN_IN_REDIRECT_URI: 'http://localhost:3000/google/callback' }),
    ).not.toBeNull();
  });
});
