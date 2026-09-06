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
