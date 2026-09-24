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

for (const file of files) {
  const rel = `test/${file}`;
  process.stdout.write(`\n── ${rel}\n`);

  const run = spawnSync(
    process.execPath,
    [VITEST, 'run', '--config', './vitest.config.e2e.ts', rel],
    { cwd: ROOT, encoding: 'utf8', shell: false },
  );

  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  // vitest prints "Tests  12 passed (12)" or "Tests  1 failed | 11 passed (12)".
  const summary = output.match(/Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed\s+\((\d+)\)/);

  if (!summary) {
    // No summary. The process may have exited 0 — that is exactly the failure
    // mode this runner exists to catch, so it is never treated as a pass.
    broken.push({ rel, code: run.status, tail: output.trim().split('\n').slice(-6).join('\n') });
    console.error(`   ✖ NO SUMMARY (exit ${run.status}) — cannot be counted as passing.`);
    continue;
  }

  const fileFailed = Number(summary[1] ?? 0);
  const filePassed = Number(summary[2]);
  passed += filePassed;
  failed += fileFailed;
  console.log(`   ${fileFailed > 0 ? '✖' : '✓'} ${filePassed} passed${fileFailed ? `, ${fileFailed} failed` : ''}`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`e2e: ${passed} passed${failed ? `, ${failed} failed` : ''} across ${files.length} file(s)`);

if (broken.length > 0) {
  console.error(`\n✖ ${broken.length} file(s) produced no summary and were NOT counted:`);
  for (const b of broken) console.error(`\n  ${b.rel} (exit ${b.code})\n${b.tail.replace(/^/gm, '    ')}`);
  console.error('\nA run with no summary is not a pass. Fix the file or the environment.\n');
  process.exit(1);
}

if (failed > 0) process.exit(1);
console.log('✓ all e2e files reported a summary and every test passed.\n');
