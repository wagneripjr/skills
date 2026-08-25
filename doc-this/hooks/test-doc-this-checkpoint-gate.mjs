#!/usr/bin/env node
// test-doc-this-checkpoint-gate.mjs — regression test for BUG-002 + the
// Code Analyst rename aliases.
//
// The checkpoint gate must look up predecessor checkpoints by AGENT name
// (.checkpoints.scout), NOT by phase name (.checkpoints.reconnaissance).
// BUG-002: the gate keyed on phase name, so every agent past Scout was denied
// even when its predecessor had genuinely completed.
//
// Rename aliases: doc-this-archaeologist → doc-this-code-analyst. The gate must
// (a) accept the legacy SKILL name as an alias for the new one, and (b) accept
// the legacy checkpoint key "archaeologist" wherever "code_analyst" is required,
// so in-flight pre-rename projects keep working.
//
// Feeds the gate realistic PreToolUse/Skill stdin payloads and asserts exit codes:
//   allow = exit 0, deny = exit 2.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from '../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GATE = join(SCRIPT_DIR, 'doc-this-checkpoint-gate.mjs');
const SESSION_ID = `test-bug002-${process.pid}`;

// Ensure no stray bypass marker would mask a real deny.
rmSync(join(tmpdir(), `.claude-doc-this-bypass-${SESSION_ID}`), { force: true });

const h = new Harness('doc-this checkpoint gate');

function runGate(skill, state) {
  const dir = h.mkTemp('dt-checkpoint-');
  mkdirSync(join(dir, '.doc-this'), { recursive: true });
  writeFileSync(join(dir, '.doc-this', 'state.json'), state);
  const input = JSON.stringify({ session_id: SESSION_ID, cwd: dir, tool_input: { skill } });
  const { code } = runNode(GATE, { input });
  rmSync(dir, { recursive: true, force: true });
  return code;
}

const assertExit = (name, expected, actual) =>
  h.check(`${name} (exit ${actual})`, actual === expected, `expected exit ${expected}, got ${actual}`);

const SCOUT_DONE = '{"checkpoints":{"scout":{"completed_at":"2026-06-09T00:00:00Z","files":[]}}}';
const CA_DONE = '{"checkpoints":{"scout":{"completed_at":"2026-06-09T00:00:00Z"},"code_analyst":{"modules_analyzed":["a"]}}}';
const CA_LEGACY = '{"checkpoints":{"scout":{"completed_at":"2026-06-09T00:00:00Z"},"archaeologist":{"modules_analyzed":["a"]}}}';
const EMPTY = '{"checkpoints":{}}';

// 1. The BUG-002 case: scout checkpoint present → code-analyst must be ALLOWED.
assertExit('code-analyst allowed when .checkpoints.scout present', 0, runGate('doc-this:doc-this-code-analyst', SCOUT_DONE));

// 1b. Legacy SKILL name is an alias for the same gate behavior.
assertExit('legacy archaeologist skill name allowed when scout present', 0, runGate('doc-this:doc-this-archaeologist', SCOUT_DONE));

// 2. No scout checkpoint → code-analyst correctly DENIED.
assertExit('code-analyst denied when scout checkpoint missing', 2, runGate('doc-this:doc-this-code-analyst', EMPTY));

// 3. Scout is the entry point → always allowed.
assertExit('scout allowed as entry point', 0, runGate('doc-this:doc-this-scout', EMPTY));

// 4. Optional agent → passes through (not gated on a predecessor).
assertExit('optional data-master passes through', 0, runGate('doc-this:doc-this-data-master', EMPTY));

// 5. Chain holds further down: detective allowed when code_analyst present.
assertExit('detective allowed when .checkpoints.code_analyst present', 0, runGate('doc-this:doc-this-detective', CA_DONE));

// 5b. Rename-alias regression: detective allowed when only the LEGACY
//     .checkpoints.archaeologist key exists (pre-rename in-flight project).
assertExit('detective allowed when only legacy .checkpoints.archaeologist present', 0, runGate('doc-this:doc-this-detective', CA_LEGACY));

// 6. Ordering still enforced: detective denied when only scout present.
assertExit('detective denied when code_analyst checkpoint missing', 2, runGate('doc-this:doc-this-detective', SCOUT_DONE));

h.done();
