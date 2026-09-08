import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // beforeAll boots the whole AppModule and runs a real bcrypt login - the
    // heaviest hook in the repo, and the likeliest to exceed the 10s default
    // on a cold CI runner.
    hookTimeout: 30_000,
    // Each e2e file boots its own full AppModule in a forked worker. Running
    // them in parallel put three of those on one machine at once, and the
    // third fork died with "Worker exited unexpectedly" - not a test failure,
    // a resource one, and it reports as an unhandled error that leaves the run
    // red with every assertion green. Serial costs ~30s and is deterministic.
    fileParallelism: false,
  },
});
