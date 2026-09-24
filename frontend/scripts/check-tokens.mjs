#!/usr/bin/env node
/**
 * `OPS-2` — fail the build on a design token that does not exist.
 *
 * WHY THIS EXISTS. Tailwind's arbitrary-value syntax accepts any string, so
 * `p-[var(--nope)]` compiles to `padding: var(--nope)` and renders as nothing.
 * A CSS declaration whose `var()` names an undefined custom property with no
 * fallback is invalid at computed-value time and is dropped. It typechecks, it
 * lints, and `next build` succeeds — only the rendered stylesheet is wrong.
 *
 * That class has now shipped here four times:
 *   - 478 colour instances (`CLAUDE.md` §11 rule 1)
 *   - 113 size instances   (`F5-1`)
 *   - 491 references across 24 files, the whole public site (`F13-1`, unit 13)
 *   - and again days later, when unit 14's Google screens reintroduced
 *     `--sp-3/6/8` into the login and callback pages.
 *
 * Three separate reviewers read the code between the third and the fourth. A
 * reviewer is the wrong instrument for this; a resolver is the right one. Same
 * argument `OPS-1` makes about the `lib/types.ts` mirror, and the same remedy:
 * MAKE DRIFT A COMPILE ERROR, NOT A CODE REVIEW.
 *
 * Deliberately dependency-free and ~100 lines. It reads CSS with a regex rather
 * than a parser because it only needs two things out of it — the names on the
 * left of a `--x:` and the names inside a `var()`. A real parser here would be
 * speculative architecture (`CLAUDE.md` §13).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Where tokens are DEFINED. Everything else may only consume them. */
const TOKEN_SOURCES = ['app/tokens/fig-tokens.css', 'app/tokens/semantic.css', 'app/globals.css'];

/** Where tokens are USED. */
const SOURCE_DIRS = ['app', 'components', 'lib'];
const SOURCE_EXT = /\.(tsx?|css)$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Injected at runtime by `next/font` (`app/layout.tsx`), so they are real but
 * are never written in a stylesheet this script can read. The only allowlist,
 * and it stays short on purpose — every entry is a hole in the check.
 */
const RUNTIME_DEFINED = ['--font-inter', '--font-geist-mono'];

/**
 * Blank out comments before scanning.
 *
 * Without this the check fails on its own documentation: the rule it enforces
 * is stated in `globals.css` and `components/ui/index.ts` by QUOTING the bad
 * pattern, and those quotes are not code. Replacing with spaces rather than
 * deleting keeps line numbers honest in the report.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

// --- 1. Every custom property that actually exists -------------------------
const defined = new Set(RUNTIME_DEFINED);
for (const rel of TOKEN_SOURCES) {
  const css = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
  for (const m of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);
}

// --- 2. Every custom property something reaches for ------------------------
const undefinedRefs = [];
const sizeAsColour = [];

for (const file of SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d)))) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    // A token source may define what it also uses; skip its own definitions.
    const isTokenSource = TOKEN_SOURCES.includes(rel);

    for (const m of line.matchAll(/var\(\s*(--[A-Za-z0-9_${}.\[\]-]+)/g)) {
      const name = m[1];
      // `var(--status-${tone}-wash)` — a template literal assembles the name at
      // runtime. Its pieces cannot be resolved statically; skip rather than
      // report a false positive.
      if (name.includes('$') || name.includes('{')) continue;
      // A trailing hyphen means the same thing with the interpolation stripped.
      if (name.endsWith('-')) continue;
      if (isTokenSource && defined.has(name)) continue;
      if (!defined.has(name)) {
        undefinedRefs.push({ rel, line: i + 1, name, text: line.trim().slice(0, 100) });
      }
    }

    // The `F5-1` shape: Tailwind v4 compiles a bare `var()` after `text-` to
    // `color:`, so a SIZE written that way never applies at all. This is wrong
    // even when the token exists, which is why it is checked separately.
    for (const m of line.matchAll(/\btext-\[var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      sizeAsColour.push({ rel, line: i + 1, name: m[1], text: line.trim().slice(0, 100) });
    }
  });
}

// --- 3. Report -------------------------------------------------------------
let failed = false;

if (undefinedRefs.length > 0) {
  failed = true;
  console.error(`\n✖ ${undefinedRefs.length} reference(s) to a custom property that is not defined.`);
  console.error('  These render as NOTHING. Define the token, or use the live one.\n');
  for (const r of undefinedRefs) console.error(`  ${r.rel}:${r.line}  ${r.name}\n      ${r.text}`);
}

if (sizeAsColour.length > 0) {
  failed = true;
  console.error(`\n✖ ${sizeAsColour.length} use(s) of \`text-[var(--…)]\`.`);
  console.error('  Tailwind v4 compiles this to `color:`, so a size never applies.');
  console.error('  Use a named utility (`text-fg`, `text-base`, `text-m-body`),');
  console.error('  or `text-(length:--x)` when the size really must come from a variable.\n');
  for (const r of sizeAsColour) console.error(`  ${r.rel}:${r.line}  ${r.name}\n      ${r.text}`);
}

if (failed) {
  console.error('\nSee CLAUDE.md §11 and docs/CHANGELOG.md `F13-1`.\n');
  process.exit(1);
}

console.log(`✓ tokens: ${defined.size} defined, every reference resolves.`);
