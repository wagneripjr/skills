#!/usr/bin/env node
// run-all.mjs — run every doc-this gate E2E test.
//
// Exit 0 only when at least one suite ran AND none skipped. A suite that cannot run
// (exit 77 — missing prerequisite) is NOT a pass: counting it as one lets a machine
// missing that prerequisite print a green run that asserted nothing.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DIR = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0, skipped = 0;
const skippedNames = [];

const suites = readdirSync(DIR)
  .filter((n) => n.startsWith('test-') && n.endsWith('.mjs'))
  .sort();

for (const name of suites) {
  process.stdout.write(`### ${name} ###\n`);
  const rc = spawnSync(process.execPath, [join(DIR, name)], { stdio: 'inherit' }).status ?? 1;
  if (rc === 0) passed++;
  else if (rc === 77) { skipped++; skippedNames.push(name); }
  else failed++;
  process.stdout.write('\n');
}

process.stdout.write(`suites: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

if (failed > 0) {
  process.stdout.write('SOME SUITES FAILED\n');
  process.exit(1);
}
if (skipped > 0) {
  process.stdout.write(`INCOMPLETE: ${skipped} suite(s) could not run — ${skippedNames.join(' ')}\n`);
  process.stdout.write('Install the missing prerequisite and re-run; nothing was asserted for those suites.\n');
  process.exit(1);
}
if (passed === 0) {
  process.stdout.write('INCOMPLETE: no suites were discovered\n');
  process.exit(1);
}
process.stdout.write('ALL SUITES PASSED\n');
