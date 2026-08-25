#!/usr/bin/env node
// run-all.mjs — run every test suite in the repository.
//
// Exit 0 only when at least one suite ran AND none skipped. A suite that cannot run
// (exit 77 — a missing prerequisite) is NOT a pass: counting it as one lets a
// machine lacking it print a green run that asserted nothing. Same contract as
// doc-this/hooks/run-all.mjs, which this delegates to for the gate suites.
//
// Usage: node tests/run-all.mjs
//
// Zero dependencies. Node >= 18.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// tessl needs an account and network; its harness exits 77 when unauthenticated. Including it
// would pin this runner at permanent INCOMPLETE on every machine that has not run `tessl login`.
// It is opt-in and documented in README, never part of the default suite.
const EXCLUDE = new Set(['test-tessl-quality-gate.mjs']);

const suites = [];

// tests/ — the repo-level acceptance matrices.
for (const f of readdirSync(join(ROOT, 'tests')).sort()) {
  if (!/^test-.*\.mjs$/.test(f) || EXCLUDE.has(f)) continue;
  suites.push(join('tests', f));
}

// doc-this/hooks/ — delegated to its own runner, which already owns the 77 contract.
if (existsSync(join(ROOT, 'doc-this/hooks/run-all.mjs'))) suites.push('doc-this/hooks/run-all.mjs');

// doc-this/skills/*/scripts/ — harnesses co-located with the skill they cover.
const skillsDir = join(ROOT, 'doc-this/skills');
if (existsSync(skillsDir)) {
  for (const skill of readdirSync(skillsDir).sort()) {
    const scripts = join(skillsDir, skill, 'scripts');
    if (!existsSync(scripts)) continue;
    for (const f of readdirSync(scripts).sort()) {
      if (!/^test-.*\.mjs$/.test(f) || EXCLUDE.has(f)) continue;
      suites.push(relative(ROOT, join(scripts, f)));
    }
  }
}

let passed = 0, failed = 0;
const skipped = [], failedNames = [];

for (const suite of suites) {
  console.log(`### ${suite} ###`);
  const rc = spawnSync(process.execPath, [join(ROOT, suite)], { stdio: 'inherit', cwd: ROOT }).status;
  if (rc === 0) passed++;
  else if (rc === 77) skipped.push(suite);
  else { failed++; failedNames.push(suite); }
  console.log('');
}

console.log(`suites: ${passed} passed, ${failed} failed, ${skipped.length} skipped`);

if (failed > 0) {
  console.log(`SOME SUITES FAILED:${failedNames.map((n) => ` ${n}`).join('')}`);
  process.exit(1);
}
if (skipped.length > 0) {
  console.log(`INCOMPLETE: ${skipped.length} suite(s) could not run —${skipped.map((n) => ` ${n}`).join('')}`);
  console.log('Install the missing prerequisite and re-run; nothing was asserted for those suites.');
  process.exit(1);
}
if (passed === 0) {
  console.log('INCOMPLETE: no suites were discovered');
  process.exit(1);
}
console.log('ALL SUITES PASSED');
