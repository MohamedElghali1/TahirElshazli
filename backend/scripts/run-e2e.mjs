#!/usr/bin/env node
/**
 * Run the e2e suite one FILE per process, and refuse to be silent about it.
 *
 * WHY. Each e2e file boots the whole `AppModule`. `vitest.config.e2e.ts`
 * already records two rounds of this fight: file parallelism was turned off
 * when a third concurrent boot killed a worker, then the pool was moved from
 * forked processes to threads when a fourth file brought it back. A fifth file
 * (`google-sign-in.e2e-spec.ts`, unit 14) has broken it again — the combined
 * run now dies with 0xC0000409 (3221226505) on Windows having printed NO
 * summary at all.
 *
 * The danger is not the crash, it is the shape of it. That config's own
 * comment names it: *"A worker that dies silently is the worst shape a flake
 * can take here, because a reader sees '0 failed' and the total quietly
 * drops."* `CLAUDE.md` §10 says the same thing about the integration suite —
 * **a suite that skips itself is indistinguishable from one that passes.**
 *
 * So this runner does two things the combined run cannot:
 *   1. One file per process, so five booted apps never share one V8.
 *   2. **Parses the summary out of every file and fails if one is missing.**
 *      A file that produces no "Tests N passed" line is an ERROR here, never a
 *      silent zero. That is the whole point.
 *
 * Dependency-free on purpose. It shells out to the same vitest and the same
 * config; it changes how they are invoked, not what they do.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TEST_DIR = join(ROOT, 'test');

/**
 * npm workspaces hoist to the repo root, so vitest usually lives one level up
 * rather than in `backend/node_modules`. Check both instead of assuming — an
 * unresolved path here would report as "no summary" for every file, which is
 * the check firing on the runner's own bug rather than on a real one.
 */
const VITEST = [
  join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
  join(ROOT, '..', 'node_modules', 'vitest', 'vitest.mjs'),
].find((p) => existsSync(p));

if (!VITEST) {
  console.error('✖ cannot find vitest in backend/node_modules or the workspace root. Run `npm install`.');
  process.exit(1);
}

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.e2e-spec.ts'))
  .sort();

if (files.length === 0) {
  console.error('✖ no *.e2e-spec.ts files found — refusing to report success.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const broken = [];
const retried = [];

/** vitest prints "Tests  12 passed (12)" or "Tests  1 failed | 11 passed (12)". */
const SUMMARY = /Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed\s+\((\d+)\)/;

/**
 * Attempts allowed per file before a summary-less run is called a failure.
 * Three covers the measured ~1-in-3 crash rate with room to spare; it is NOT a
 * licence to paper over a file that fails for a real reason, which is caught on
 * attempt one and never retried. `E2E_ATTEMPTS=1` disables retrying entirely,
 * which is what you want when investigating the crash itself.
 */
const ATTEMPTS = Math.max(1, Number(process.env.E2E_ATTEMPTS ?? 3));

/** Breathing room between attempts; see the clustering note in the loop. */
const RETRY_PAUSE_MS = Number(process.env.E2E_RETRY_PAUSE_MS ?? 5000);

function runFile(rel) {
  const run = spawnSync(
    process.execPath,
    [VITEST, 'run', '--config', './vitest.config.e2e.ts', rel],
    { cwd: ROOT, encoding: 'utf8', shell: false },
  );
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  return { code: run.status, output, summary: output.match(SUMMARY) };
}

for (const file of files) {
  const rel = `test/${file}`;
  process.stdout.write(`\n── ${rel}\n`);

  // Retry ONLY when there is no summary at all, up to ATTEMPTS times.
  //
  // This cannot mask a real failure, and that is the whole argument for it: a
  // genuine test failure ALWAYS prints a summary carrying "N failed", so it is
  // counted on the first attempt and never retried. A summary-less run is the
  // one outcome that carries no information — the worker died before vitest
  // could report — and retrying it is the difference between measuring and
  // guessing.
  //
  // Measured on this Windows box: `staff.e2e-spec.ts` (244 cases, one booted
  // AppModule, real bcrypt) dies with 0xC0000409 roughly one run in three, in
  // its own process, under BOTH the threads and the forks pool. So it is the
  // weight of that one file, not cross-file concurrency — which is what the
  // config's earlier two rounds of this had already narrowed down.
  //
  // Every retry is reported, and the run still fails if the budget runs out.
  // A file that needs a retry every time must not quietly become normal.
  let attempt = runFile(rel);
  for (let n = 1; !attempt.summary && n < ATTEMPTS; n += 1) {
    console.error(`   … no summary (exit ${attempt.code}) — attempt ${n + 1} of ${ATTEMPTS}`);
    // Pause before retrying. The crashes cluster rather than arriving
    // independently — three back-to-back attempts on the heavy file all died
    // where spaced attempts did not — which points at the machine not having
    // released the previous boot's memory and handles yet, not at anything in
    // the test. Sleeping synchronously because this runner is a script with
    // nothing else to do.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_PAUSE_MS);
    attempt = runFile(rel);
    if (attempt.summary) retried.push(rel);
  }

  if (!attempt.summary) {
    broken.push({ rel, code: attempt.code, tail: attempt.output.trim().split('\n').slice(-6).join('\n') });
    console.error(`   ✖ NO SUMMARY after ${ATTEMPTS} attempts (exit ${attempt.code}) — not counted as passing.`);
    continue;
  }

  const fileFailed = Number(attempt.summary[1] ?? 0);
  const filePassed = Number(attempt.summary[2]);
  passed += filePassed;
  failed += fileFailed;
  console.log(`   ${fileFailed > 0 ? '✖' : '✓'} ${filePassed} passed${fileFailed ? `, ${fileFailed} failed` : ''}`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`e2e: ${passed} passed${failed ? `, ${failed} failed` : ''} across ${files.length} file(s)`);

if (retried.length > 0) {
  console.log(
    `  note: ${retried.length} file(s) died without a summary and passed on retry — ${retried.join(', ')}.`,
  );
  console.log('  That is the worker crash, not a test. If it becomes frequent, cut the number of booted apps.');
}

if (broken.length > 0) {
  console.error(`\n✖ ${broken.length} file(s) produced no summary and were NOT counted:`);
  for (const b of broken) console.error(`\n  ${b.rel} (exit ${b.code})\n${b.tail.replace(/^/gm, '    ')}`);
  console.error('\nA run with no summary is not a pass. Fix the file or the environment.\n');
  process.exit(1);
}

if (failed > 0) process.exit(1);
console.log('✓ all e2e files reported a summary and every test passed.\n');
