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
    // Each e2e file boots its own full AppModule. Running them in parallel put
    // three of those on one machine at once, and the third worker died with
    // "Worker exited unexpectedly" - not a test failure, a resource one, and
    // it reports as an unhandled error that leaves the run red with every
    // assertion green. Serial costs ~30s and is deterministic.
    fileParallelism: false,
    // **Threads, not the default forked processes.** Serialising the files was
    // enough until `DOM-4` (unit 2, slice 2b-i) added a fourth file and ~11
    // more booted-app tests; after that the *forked* worker started exiting
    // mid-run again, roughly one run in three, with every assertion that had
    // run still green. A worker that dies silently is the worst shape a flake
    // can take here, because a reader sees "0 failed" and the total quietly
    // drops. A worker thread shares the parent's heap instead of paying for a
    // second V8 per file: 8 consecutive full runs, 228/228, zero exits.
    //
    // This is not a licence to boot more apps. The next file that needs one
    // should ask whether its cases belong in an existing file first.
    pool: 'threads',
  },
});
