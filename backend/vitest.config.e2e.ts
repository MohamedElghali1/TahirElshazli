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
  },
});
