import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Each spec compiles a full Nest DI graph in beforeEach; on a cold Vite
    // transform cache the heavier ones exceed the 10s default and fail as
    // "Hook timed out" rather than for any real reason.
    hookTimeout: 30_000,
  },
});
