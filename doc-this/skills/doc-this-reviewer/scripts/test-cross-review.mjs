#!/usr/bin/env node
// test-cross-review.mjs — deterministic smoke test for cross-review.mjs.
//
// Uses a fake `agy` shim on a temp PATH so it NEVER makes a real egress call. Validates the
// wrapper's control flow (arg parsing, availability skip, exit-code translation, status line,
// script-relative prompt resolution) — not agy itself.
//
// Exit: 0 = all green, 1 = one or more failures.

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness } from '../../../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET = join(SCRIPT_DIR, 'cross-review.mjs');

const h = new Harness('cross-review wrapper');
const TMPROOT = h.mkTemp('xr-test-');
const FAKE_BIN = join(TMPROOT, 'bin');
const OUT = join(TMPROOT, 'out');
const RESULT = join(OUT, 'cross-review-result.md');
mkdirSync(FAKE_BIN, { recursive: true });
mkdirSync(OUT, { recursive: true });

// coreutils-only PATH hides any real agy on the system.
const BASE_PATH = '/usr/bin:/bin';
const FAKE_PATH = `${FAKE_BIN}:${BASE_PATH}`;

// makeAgy(exitCode, stdoutLine) — write a fake agy that prints one line and exits.
function makeAgy(code, line) {
  const p = join(FAKE_BIN, 'agy');
  writeFileSync(p, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(line)}\nexit ${code}\n`);
  chmodSync(p, 0o755);
}

// runTarget(path, args, cwd) -> { rc, cap }
function runTarget(pathEnv, args = [], cwd = process.cwd()) {
  const r = spawnSync(process.execPath, [TARGET, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: pathEnv },
  });
  return { rc: r.status ?? 1, cap: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const expectRc = (name, expected, actual) =>
  h.check(`${name} (rc=${actual})`, actual === expected, `expected rc=${expected}, got ${actual}`);
const expectContains = (name, needle, hay) =>
  h.check(name, hay.includes(needle), `missing '${needle}' in: ${hay.trim()}`);

// 1. missing <output_folder> -> usage error
let r = runTarget(BASE_PATH);
expectRc('missing arg -> exit 1', 1, r.rc);

// 2. non-directory <output_folder> -> usage error
r = runTarget(BASE_PATH, [join(TMPROOT, 'nope')]);
expectRc('non-dir -> exit 1', 1, r.rc);
expectContains('non-dir message', 'not a directory', r.cap);

// 3. unknown flag -> usage error
r = runTarget(BASE_PATH, [OUT, '--bogus']);
expectRc('unknown flag -> exit 1', 1, r.rc);
expectContains('unknown flag message', 'unknown flag', r.cap);

// 4. agy absent -> clean skip (exit 3)
rmSync(join(FAKE_BIN, 'agy'), { force: true });
r = runTarget(BASE_PATH, [OUT]);
expectRc('agy absent -> exit 3', 3, r.rc);
expectContains('agy absent message', 'agy not installed', r.cap);

// 5. agy present, exits 0 -> exit 0, result file written, status 'ran'
rmSync(RESULT, { force: true });
makeAgy(0, '- [SEVERITY: moderate] [CATEGORY: pact] unit/x — wrong — corrected');
r = runTarget(FAKE_PATH, [OUT]);
expectRc('agy ok -> exit 0', 0, r.rc);
expectContains('status says ran', 'cross-review: ran', r.cap);
h.check('result file written',
  existsSync(RESULT) && readFileSync(RESULT, 'utf8').includes('CATEGORY: pact'),
  'result file missing/empty');

// 6. agy present, exits non-zero -> exit 4, status carries tail summary
rmSync(RESULT, { force: true });
makeAgy(7, 'fatal: model unavailable');
r = runTarget(FAKE_PATH, [OUT]);
expectRc('agy error -> exit 4', 4, r.rc);
expectContains('status says agy error', 'agy error', r.cap);
expectContains('status carries summary', 'model unavailable', r.cap);

// 7. prompt resolves relative to the script regardless of cwd
rmSync(RESULT, { force: true });
makeAgy(0, 'ok');
r = runTarget(FAKE_PATH, [OUT], TMPROOT);
expectRc('runs from foreign cwd -> exit 0', 0, r.rc);
expectContains('no prompt-missing error from foreign cwd', 'cross-review: ran', r.cap);

// 8. --model override reaches the status line
rmSync(RESULT, { force: true });
makeAgy(0, 'ok');
r = runTarget(FAKE_PATH, [OUT, '--model', 'Custom Model X']);
expectRc('--model override -> exit 0', 0, r.rc);
expectContains('--model echoed in status', 'Custom Model X', r.cap);

h.done();
