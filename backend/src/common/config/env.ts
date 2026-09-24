/**
 * Boot-time environment validation.
 *
 * Everything here fails at startup rather than at first request. A
 * misconfigured deployment that boots and then serves traffic with a known
 * signing key, or with rate limiting silently disabled, is far worse than one
 * that refuses to start.
 */

export type NodeEnv = 'development' | 'test' | 'production';

const VALID_NODE_ENVS: NodeEnv[] = ['development', 'test', 'production'];

/**
 * Secrets that are public knowledge: they live in this repository, in
 * .env.example, or in docker-compose.yml. Any of them is equivalent to having
 * no secret at all.
 */
const KNOWN_PUBLIC_SECRETS = new Set([
  'dev-secret-change-in-production',
  'your-secret-key-change-in-production',
  'dev-secret-key-change-in-production',
  'secret',
  'changeme',
]);

/** HMAC-SHA256 keys shorter than this are brute-forceable offline from one token. */
const MIN_SECRET_LENGTH = 32;

export const DEV_JWT_SECRET = 'dev-secret-change-in-production';

/**
 * An unset NODE_ENV must not silently mean "development" - that is how a
 * production box ends up on the dev signing key and open CORS. Anything not in
 * the known set is rejected outright, so `Production` or `prod` fail loudly
 * instead of quietly downgrading every security control.
 */
export function resolveNodeEnv(raw = process.env.NODE_ENV): NodeEnv {
  const value = raw?.trim();
  if (!value) {
    return 'development';
  }
  if (!VALID_NODE_ENVS.includes(value as NodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of ${VALID_NODE_ENVS.join(', ')} (got "${value}"). ` +
        'A misspelled value would silently select development defaults.',
    );
  }
  return value as NodeEnv;
}

export function resolveJwtSecret(
  nodeEnv: NodeEnv,
  raw = process.env.JWT_SECRET,
): string {
  const secret = raw?.trim();
  const isProduction = nodeEnv === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET is not set. Refusing to start with a hardcoded signing key. ' +
          'Generate one with: openssl rand -base64 48',
      );
    }
    return DEV_JWT_SECRET;
  }

  if (isProduction) {
    if (KNOWN_PUBLIC_SECRETS.has(secret)) {
      throw new Error(
        'JWT_SECRET is a placeholder published in this repository, so it is ' +
          'public. Generate a real one: openssl rand -base64 48',
      );
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters ` +
          `(got ${secret.length}). Generate one: openssl rand -base64 48`,
      );
    }
  }
  return secret;
}

/**
 * `@nestjs/jwt` accepts a `ms` duration string or a number of seconds. A bad
 * value is not caught by the type system - the cast erases at runtime - and
 * shows up as a 500 on every login, or worse: "99" signs fine and produces
 * tokens that are already expired when issued.
 */
export function resolveJwtExpiry(
  raw = process.env.JWT_EXPIRY,
): `${number}${'s' | 'm' | 'h' | 'd'}` {
  const value = raw?.trim();
  if (!value) {
    // The denylist is per-process, so a logout recorded on one replica is
    // invisible to the others until the token expires naturally. That window is
    // exactly this value, which is why the default is an hour and not a day.
    return '1h';
  }
  if (!/^\d+[smhd]$/.test(value)) {
    throw new Error(
      `JWT_EXPIRY must be a duration like 30m, 24h or 7d (got "${value}"). ` +
        'A bare number is read as seconds and silently issues expired tokens.',
    );
  }
  return value as `${number}${'s' | 'm' | 'h' | 'd'}`;
}

/**
 * How many reverse proxies sit in front of the app. This decides which entry of
 * X-Forwarded-For Express believes, and therefore what the rate limiter keys on.
 *
 * The default is 0 - trust nothing. With any non-zero value and no real proxy
 * in front, a client can set X-Forwarded-For itself and get a fresh rate-limit
 * bucket per request, which disables brute-force protection entirely. Set it
 * deliberately to match the deployment (Cloudflare + VPS proxy = 2).
 */
export function resolveTrustedProxyHops(
  raw = process.env.TRUSTED_PROXY_HOPS,
): number {
  const value = raw?.trim();
  if (!value) {
    return 0;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `TRUSTED_PROXY_HOPS must be a non-negative integer (got "${value}"). ` +
        'A non-numeric value makes Express trust nothing and collapses every ' +
        'client into one rate-limit bucket.',
    );
  }
  return Number(value);
}

/**
 * The port the HTTP server binds to. Validated here with everything else so a
 * non-numeric value fails at boot rather than surfacing as an opaque listen
 * error, and so there is one convention in this file rather than two.
 *
 * The default is 3001 because 3000 belongs to the Next.js frontend, and
 * `npm run dev` starts both in one process tree: with a 3000 default the two
 * race for the same port and whichever loses dies at boot. Every other file in
 * the repo already assumes this split - `frontend/lib/api.ts` defaults to
 * `http://localhost:3001`, the Dockerfile EXPOSEs 3001, compose maps 3001:3001
 * - so this default is what makes a fresh clone run without a .env at all.
 */
export function resolvePort(raw = process.env.PORT): number {
  const value = raw?.trim();
  if (!value) {
    return 3001;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535 (got "${value}").`,
    );
  }
  return Number(value);
}

/**
 * Which repository implementations the app wires up.
 *
 * `memory` keeps the `InMemory*Repository` stubs: no database needed, data
 * lost on restart, nothing shared between replicas. It is the right default
 * for local work and for the test suite, and it is never acceptable in
 * production - which is why an unset value resolves to `postgres` there and
 * the boot then fails on the missing DATABASE_URL rather than quietly serving
 * traffic from a process-local array.
 */
export type PersistenceDriver = 'memory' | 'postgres';

const VALID_PERSISTENCE_DRIVERS: PersistenceDriver[] = ['memory', 'postgres'];

export function resolvePersistenceDriver(
  nodeEnv: NodeEnv,
  raw = process.env.PERSISTENCE_DRIVER,
): PersistenceDriver {
  const value = raw?.trim();
  if (!value) {
    return nodeEnv === 'production' ? 'postgres' : 'memory';
  }
  if (!VALID_PERSISTENCE_DRIVERS.includes(value as PersistenceDriver)) {
    throw new Error(
      `PERSISTENCE_DRIVER must be one of ${VALID_PERSISTENCE_DRIVERS.join(', ')} ` +
        `(got "${value}").`,
    );
  }
  if (value === 'memory' && nodeEnv === 'production') {
    throw new Error(
      'PERSISTENCE_DRIVER=memory is refused in production. Every write would be ' +
        'lost on restart and invisible to any other replica.',
    );
  }
  return value as PersistenceDriver;
}

/**
 * The Postgres connection string. Only required when the Postgres driver is
 * selected, so a developer running on the in-memory stubs never needs a
 * database - but a production boot without one fails here rather than on the
 * first query.
 */
export function resolveDatabaseUrl(
  driver: PersistenceDriver,
  raw = process.env.DATABASE_URL,
): string | null {
  const value = raw?.trim();
  if (driver !== 'postgres') {
    return null;
  }
  if (!value) {
    throw new Error(
      'DATABASE_URL is required when PERSISTENCE_DRIVER=postgres. ' +
        'Example: postgresql://user:password@host:5432/tahirelshazli',
    );
  }
  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new Error(
      `DATABASE_URL must be a postgres:// or postgresql:// URL (got "${redactUrl(value)}").`,
    );
  }
  return value;
}

/**
 * Strips the password before a connection string reaches an error message or a
 * log line. `DATABASE_URL` carries a live credential (CLAUDE.md §8: never log
 * credentials), and the unhelpful alternative is an error that names no value
 * at all.
 */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '<unparseable connection string>';
  }
}

/**
 * Whether pending migrations run automatically at boot.
 *
 * Off by default. Auto-migrating suits a single-container deployment, but with
 * more than one replica every instance races to apply the same DDL on startup,
 * so the deliberate path is a migration step in CI/CD before the new image
 * serves traffic.
 */
export function resolveAutoMigrate(raw = process.env.DB_AUTO_MIGRATE): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return false;
  }
  if (!['0', '1', 'true', 'false'].includes(value)) {
    throw new Error(
      `DB_AUTO_MIGRATE must be 0, 1, true or false (got "${value}").`,
    );
  }
  return value === '1' || value === 'true';
}

/**
 * Apply the development fixtures at boot.
 *
 * Separate from `DB_AUTO_MIGRATE`, and **refused in production**, because the
 * two carry different risks. Migrations are forward-only DDL that a production
 * database needs; the seeds insert `student@example.com` with a published
 * password hash, so applying them to a real deployment is an account-takeover
 * hole rather than a convenience (see MigrationRunner.seed, which says the same
 * thing and is why seeding is a CLI step at all).
 *
 * It exists so the containerized development stack in docker-compose.yml comes
 * up with data to click through. Without it the compose stack applies eight
 * migrations to an empty database and there is no account to sign in with -
 * a stack that boots healthy and is unusable.
 *
 * Re-running is safe: every seed file is idempotent (ON CONFLICT DO NOTHING),
 * which is what lets this run on every boot rather than only the first.
 */
export function resolveAutoSeed(
  nodeEnv: NodeEnv,
  raw = process.env.DB_AUTO_SEED,
): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return false;
  }
  if (!['0', '1', 'true', 'false'].includes(value)) {
    throw new Error(
      `DB_AUTO_SEED must be 0, 1, true or false (got "${value}").`,
    );
  }
  const enabled = value === '1' || value === 'true';
  if (enabled && nodeEnv === 'production') {
    throw new Error(
      'DB_AUTO_SEED is refused in production. The fixtures insert known ' +
        'accounts with a published password hash, so seeding a real database ' +
        'hands out logins. Run `npm run db:seed` against a development ' +
        'database instead.',
    );
  }
  return enabled;
}

export function resolveCorsOrigins(
  nodeEnv: NodeEnv,
  raw = process.env.CORS_ORIGIN,
): string[] | true {
  const origins = raw
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins?.length) {
    return origins;
  }
  if (nodeEnv === 'production') {
    // `true` reflects whatever Origin the caller sent; with credentials enabled
    // that is an open door, and an unset variable is the likeliest way there.
    throw new Error(
      'CORS_ORIGIN must list the allowed origins in production (comma-separated).',
    );
  }
  return true;
}

/**
 * Which file-storage driver the app wires up.
 *
 * `local` writes to a directory on the container filesystem and serves it back
 * from `/uploads/*`. It exists so the blog's authoring UI (CLAUDE.md §5.19) has
 * a working file picker before Cloudflare R2 is provisioned - §3 makes those
 * subscriptions the client's responsibility and requires the code to degrade
 * sensibly until they exist.
 *
 * `none` accepts no uploads at all and the upload endpoint answers 503. That is
 * the production default, and the honest one: a URL field still works, so the
 * blog is fully usable with media hosted anywhere, and nothing silently writes
 * to a filesystem that is discarded on the next deploy.
 *
 * `local` in production is **refused**, for the same shape of reason
 * `PERSISTENCE_DRIVER=memory` is. The failure would be quiet rather than loud:
 * `blog_post_media` rows outlive the files they point at, so the gallery
 * becomes broken images with no error anywhere, and with a second replica half
 * the reads 404 regardless. `r2` is the value this grows to.
 */
export type StorageDriver = 'none' | 'local';

const VALID_STORAGE_DRIVERS: StorageDriver[] = ['none', 'local'];

export function resolveStorageDriver(
  nodeEnv: NodeEnv,
  raw = process.env.STORAGE_DRIVER,
): StorageDriver {
  const value = raw?.trim();
  if (!value) {
    return nodeEnv === 'production' ? 'none' : 'local';
  }
  if (!VALID_STORAGE_DRIVERS.includes(value as StorageDriver)) {
    throw new Error(
      `STORAGE_DRIVER must be one of ${VALID_STORAGE_DRIVERS.join(', ')} ` +
        `(got "${value}").`,
    );
  }
  if (value === 'local' && nodeEnv === 'production') {
    throw new Error(
      'STORAGE_DRIVER=local is refused in production. Uploaded files would be ' +
        'lost on the next deploy while the rows pointing at them survived, and ' +
        'a second replica would 404 half of them. Use a URL field until R2 is ' +
        'configured.',
    );
  }
  return value as StorageDriver;
}

/**
 * Where the local driver writes.
 *
 * Relative paths are resolved against the process working directory by the
 * driver, not here, so this stays a plain string that a Docker volume mount can
 * point anywhere. The default sits outside `src/` deliberately: a watcher
 * rebuilding on every upload is a surprising thing to debug.
 */
export function resolveUploadDir(raw = process.env.UPLOAD_DIR): string {
  const value = raw?.trim();
  if (!value) {
    return 'var/uploads';
  }
  return value;
}

/**
 * The base URL a mail template builds a clickable link against (a sign-in
 * link, `PEOPLE-3`; a password-reset link).
 *
 * No safe default exists in production - an unset value would silently mail
 * out a `localhost` link, which is a broken email, not a missing feature, so
 * it fails the same way `CORS_ORIGIN` does. `http://localhost:3000` is
 * standing in for the real dev server address, which is what every other
 * local default in this file already assumes.
 */
export function resolveFrontendUrl(
  nodeEnv: NodeEnv,
  raw = process.env.FRONTEND_URL,
): string {
  const value = raw?.trim();
  if (value) {
    return value.replace(/\/+$/, '');
  }
  if (nodeEnv === 'production') {
    throw new Error(
      'FRONTEND_URL must be set in production - mail templates build links against it.',
    );
  }
  return 'http://localhost:3000';
}

/**
 * Which mail transport the app wires up.
 *
 * Mirrors `StorageDriver` / `resolveStorageDriver` exactly:
 *
 * - `none` sends nothing; `MailService` answers 503. The production default,
 *   and the honest one: a swallowed email is not data-loss the way an orphaned
 *   upload is, so `'log'` is not refused in production.
 * - `log` logs the template name only (never recipient or data, both can be
 *   PII/secrets). The development default.
 * - `smtp` sends via nodemailer with the five `MAIL_SMTP_*` env vars.
 */
export type MailDriver = 'none' | 'log' | 'smtp';

const VALID_MAIL_DRIVERS: MailDriver[] = ['none', 'log', 'smtp'];

export function resolveMailDriver(
  nodeEnv: NodeEnv,
  raw = process.env.MAIL_DRIVER,
): MailDriver {
  const value = raw?.trim();
  if (!value) {
    return nodeEnv === 'production' ? 'none' : 'log';
  }
  if (!VALID_MAIL_DRIVERS.includes(value as MailDriver)) {
    throw new Error(
      `MAIL_DRIVER must be one of ${VALID_MAIL_DRIVERS.join(', ')} ` +
        `(got "${value}").`,
    );
  }
  return value as MailDriver;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/**
 * The five SMTP env vars, required when `MAIL_DRIVER=smtp`.
 *
 * Throws at boot if any is missing or empty, mirroring `resolveGoogleOAuthConfig`.
 */
export function resolveSmtpConfig(
  env = process.env,
): SmtpConfig {
  const host = env.MAIL_SMTP_HOST?.trim();
  const portRaw = env.MAIL_SMTP_PORT?.trim();
  const user = env.MAIL_SMTP_USER?.trim();
  const pass = env.MAIL_SMTP_PASS?.trim();
  const from = env.MAIL_SMTP_FROM?.trim();

  const missing = [
    !host && 'MAIL_SMTP_HOST',
    !portRaw && 'MAIL_SMTP_PORT',
    !user && 'MAIL_SMTP_USER',
    !pass && 'MAIL_SMTP_PASS',
    !from && 'MAIL_SMTP_FROM',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `MAIL_DRIVER=smtp requires ${missing.join(', ')}.`,
    );
  }

  const port = Number(portRaw);
  if (Number.isNaN(port)) {
    throw new Error(
      `MAIL_SMTP_PORT must be a number (got "${portRaw}").`,
    );
  }

  return {
    host: host!,
    port,
    user: user!,
    pass: pass!,
    from: from!,
  };
}

/**
 * Which Google Forms integration is wired up.
 *
 * The same shape as `STORAGE_DRIVER`, and for the same reason (CLAUDE.md §3:
 * the third-party subscriptions are the client's and the code degrades sensibly
 * until they exist). `none` is the default everywhere - including production -
 * because a Google Cloud project, an OAuth consent screen and a set of client
 * credentials are things a human has to go and create, and nothing about this
 * application should fail to boot because they have not yet.
 *
 * With `none` the integration endpoints answer 503 with a message the UI
 * renders as "not configured", and a teacher authoring work can still paste a
 * form link - they simply get completion tracking rather than scores. That is a
 * real degraded mode rather than a broken one, which is what makes `none` a
 * defensible production default rather than an oversight.
 *
 * There is deliberately **no `mock` driver.** The instruction was that
 * analytics must not be faked, and a driver that returns plausible-looking
 * response data is exactly the thing that gets demonstrated to a client and
 * mistaken for a working integration.
 */
export type GoogleDriver = 'none' | 'google';

const VALID_GOOGLE_DRIVERS: GoogleDriver[] = ['none', 'google'];

export function resolveGoogleDriver(
  raw = process.env.GOOGLE_DRIVER,
): GoogleDriver {
  const value = raw?.trim();
  if (!value) {
    return 'none';
  }
  if (!VALID_GOOGLE_DRIVERS.includes(value as GoogleDriver)) {
    throw new Error(
      `GOOGLE_DRIVER must be one of ${VALID_GOOGLE_DRIVERS.join(', ')} ` +
        `(got "${value}").`,
    );
  }
  return value as GoogleDriver;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  /**
   * Must match a redirect URI registered on the OAuth client **byte for byte**
   * - Google compares it as a string, so a trailing slash or http-vs-https
   * difference fails with `redirect_uri_mismatch` and no further explanation.
   * It is validated as a URL here so that failure happens at boot, where the
   * message can say which variable is wrong, rather than on the consent screen.
   */
  redirectUri: string;
}

/**
 * The OAuth client credentials, required only when the driver is `google`.
 *
 * Returns null for `none` rather than throwing, so a developer who has not set
 * any of this up never has to: the module wires a null provider and the service
 * answers 503, exactly as `FILE_STORAGE` does without `STORAGE_DRIVER`.
 */
export function resolveGoogleOAuthConfig(
  driver: GoogleDriver,
  env = process.env,
): GoogleOAuthConfig | null {
  if (driver !== 'google') {
    return null;
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();

  const missing = [
    !clientId && 'GOOGLE_CLIENT_ID',
    !clientSecret && 'GOOGLE_CLIENT_SECRET',
    !redirectUri && 'GOOGLE_OAUTH_REDIRECT_URI',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `GOOGLE_DRIVER=google requires ${missing.join(', ')}. ` +
        'Create an OAuth 2.0 Web application client at ' +
        'https://console.cloud.google.com/apis/credentials and copy the values ' +
        'across. See docs/google-forms-setup.md for the full walkthrough.',
    );
  }

  try {
    // eslint-disable-next-line no-new
    new URL(redirectUri!);
  } catch {
    throw new Error(
      `GOOGLE_OAUTH_REDIRECT_URI must be an absolute URL (got "${redirectUri}"). ` +
        'It has to match the Authorized redirect URI on the OAuth client ' +
        'exactly - Google compares the two as strings.',
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
  };
}

/**
 * The key the stored Google refresh token is encrypted with.
 *
 * CLAUDE.md §8 requires sensitive data encrypted at rest, and a Google refresh
 * token is about as sensitive as this database gets: it is a long-lived bearer
 * credential for Dr. Tahir's Google account that does not expire on its own.
 * A database backup that leaks one is materially worse than one that leaks the
 * password hashes beside it.
 *
 * Required whenever the driver is `google`, in **every** environment rather
 * than production only - which is the deliberate difference from
 * `resolveJwtSecret`. A development default would mean the token in a developer
 * database is decryptable by anyone holding this repository, and unlike a dev
 * JWT secret (which signs tokens for fixture accounts) this one protects a real
 * credential for a real third-party account the moment anybody clicks Connect.
 */
export function resolveGoogleTokenKey(
  driver: GoogleDriver,
  raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
): Buffer | null {
  if (driver !== 'google') {
    return null;
  }
  const value = raw?.trim();
  if (!value) {
    throw new Error(
      'GOOGLE_DRIVER=google requires GOOGLE_TOKEN_ENCRYPTION_KEY. ' +
        'Generate one with: openssl rand -base64 32',
    );
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes of base64 ' +
        `(decoded to ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

export interface GoogleSignInConfig {
  clientId: string;
  clientSecret: string;
  /**
   * Where Google sends the browser back after a sign-in or a link - a page on
   * the **web app**, not the API, because what comes back has to become a
   * session in the browser. A second Authorized redirect URI on the same OAuth
   * client as the Forms integration; Google compares it byte for byte.
   */
  redirectUri: string;
  /**
   * `D-51`: the Workspace domains a staff account may use Google from, checked
   * against the verified `id_token`'s `hd` claim. **Empty means staff Google
   * sign-in is off** and staff keep their passwords. Students are not pinned.
   */
  staffDomains: string[];
}

/** A bare, lowercase domain name: labels of letters, digits and inner hyphens. */
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Google sign-in (`GAUTH-1`). Null - sign-in answers 503 - unless the Google
 * driver is on (it reuses that OAuth client) **and** a sign-in redirect URI is
 * set, so a server that has only Forms configured does not suddenly offer a
 * sign-in button pointing at a redirect nobody registered.
 *
 * `STAFF_GOOGLE_DOMAINS` is validated even so: a typo there silently locks
 * every staff member out of Google, or - if the check were loose - lets the
 * wrong domain in, so a malformed entry stops the boot.
 */
export function resolveGoogleSignInConfig(
  driver: GoogleDriver,
  nodeEnv: NodeEnv,
  env = process.env,
): GoogleSignInConfig | null {
  const staffDomains = (env.STAFF_GOOGLE_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const bad = staffDomains.filter((d) => !DOMAIN_PATTERN.test(d));
  if (bad.length) {
    throw new Error(
      `STAFF_GOOGLE_DOMAINS must be bare domain names, comma-separated ` +
        `(e.g. "tahirelshazli.com"). Not a domain: ${bad.map((d) => `"${d}"`).join(', ')}.`,
    );
  }

  const redirectUri = env.GOOGLE_SIGN_IN_REDIRECT_URI?.trim();
  if (!redirectUri) {
    return null;
  }
  const oauth = resolveGoogleOAuthConfig(driver, env);
  if (!oauth) {
    throw new Error(
      'GOOGLE_SIGN_IN_REDIRECT_URI is set but GOOGLE_DRIVER is not "google". ' +
        'Google sign-in uses the same OAuth client as the Forms integration; ' +
        'see docs/google-forms-setup.md.',
    );
  }
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new Error(
      `GOOGLE_SIGN_IN_REDIRECT_URI must be an absolute URL (got "${redirectUri}").`,
    );
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    // The authorization code travels to this URL. Over http it is readable in
    // transit, and the code is what a sign-in is exchanged for.
    throw new Error('GOOGLE_SIGN_IN_REDIRECT_URI must use https in production.');
  }
  return {
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    redirectUri,
    staffDomains: [...new Set(staffDomains)],
  };
}
