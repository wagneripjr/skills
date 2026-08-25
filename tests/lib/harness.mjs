// Shared assertion helpers for every test harness in this repo.
//
// Exit contract, identical across suites and relied on by tests/run-all.mjs:
//   0  = all assertions passed
//   1  = at least one assertion failed
//   77 = SKIP — the suite could not evaluate anything (missing prerequisite).
//        A suite that asserted nothing is NOT a pass.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export class Harness {
  constructor(title) {
    this.pass = 0;
    this.fail = 0;
    this.tempDirs = [];
    if (title) process.stdout.write(`=== ${title} ===\n`);
  }

  ok(msg) { this.pass++; process.stdout.write(`  PASS: ${msg}\n`); }

  bad(msg, detail) {
    this.fail++;
    process.stdout.write(`  FAIL: ${msg}\n`);
    if (detail) process.stdout.write(`        ${detail}\n`);
  }

  check(msg, condition, detail) {
    if (condition) this.ok(msg); else this.bad(msg, detail);
    return !!condition;
  }

  equal(msg, actual, expected) {
    return this.check(msg, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  section(title) { process.stdout.write(`\n${title}\n`); }

  // A throwaway directory, removed when the suite finishes.
  mkTemp(prefix = 'dt-test-') {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    this.tempDirs.push(dir);
    return dir;
  }

  cleanup() {
    for (const d of this.tempDirs) rmSync(d, { recursive: true, force: true });
    this.tempDirs = [];
  }

  // Print the summary and exit with the suite's contract code. Never returns.
  done() {
    this.cleanup();
    process.stdout.write(`\n=== Results ===\n  ${this.pass} passed, ${this.fail} failed\n`);
    process.exit(this.fail > 0 ? 1 : 0);
  }
}

// A suite that cannot evaluate anything exits 77, never 0.
export function skip(reason) {
  process.stdout.write(`SKIP: ${reason}\n`);
  process.exit(77);
}

// Run a Node script with JSON on stdin; returns { code, stdout, stderr }.
export function runNode(script, { input = '', args = [], cwd, env } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    input,
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
