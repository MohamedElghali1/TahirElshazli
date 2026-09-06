import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * The suite that needs a real Postgres. Kept out of `npm test` deliberately -
 * the unit suite must stay runnable with no services on the machine - and
 * skipped from inside the spec when TEST_DATABASE_URL is unset, so running it
 * without a database reports "skipped" rather than a wall of connection errors.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    // Migrating a fresh schema on a cold container is slower than any DI graph.
    hookTimeout: 60_000,
    // Every spec drops and recreates `public`; two files doing that at once
    // would pull the schema out from under each other.
    fileParallelism: false,
  },
});
