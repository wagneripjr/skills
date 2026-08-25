#!/usr/bin/env node
// test-doc-this-coverage-gate.mjs — regression test for the Total Source
// Coverage gate (BUG-003: doc-this counted hundreds of WebForms files in the inventory
// but never read them, recording their contents as 🔴 gaps).
//
// Asserts the gate's exit codes per transition:
//   allow = exit 0, deny = exit 2.
// Covers: unread-source deny, unassigned-source deny, complete-coverage allow,
// per-page ui deny/allow, matrix deny/allow, legacy advisory (no manifest),
// malformed-ledger fail-open, bypass marker, optional-agent pass-through.

import { mkdirSync, writeFileSync, rmSync, closeSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from '../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GATE = join(SCRIPT_DIR, 'doc-this-coverage-gate.mjs');
const SESSION_ID = `test-bug003-${process.pid}`;
const BYPASS = join(tmpdir(), `.claude-doc-this-bypass-${SESSION_ID}`);

rmSync(BYPASS, { force: true });

const h = new Harness('doc-this coverage gate');

const STATE = '{"output_folder":".doc-this-sdd","checkpoints":{"scout":{},"code_analyst":{"modules_analyzed":["a"]}}}';
const MANIFEST = `{"generated_at":"t","files":[
  {"path":"Scripts/j.min.js","class":"vendored","subclass":""},
  {"path":"src/a/Page.aspx","class":"source","subclass":"markup"},
  {"path":"src/a/Svc.cs","class":"source","subclass":"code"},
  {"path":"src/a/q.sql","class":"source","subclass":"sql"}],"counts":{"source":3,"vendored":1}}`;
const LEDGER_FULL = '{"files_analyzed":["src/a/Svc.cs","src/a/Page.aspx","src/a/q.sql"]}';
const LEDGER_PARTIAL = '{"files_analyzed":["src/a/Svc.cs"]}';
const LEDGER_BROKEN = '{"files_analyzed": [oops';
const MODULES_FULL = '{"exclusions":[],"modules":[{"name":"a","path":"src/a","purpose":null,"primary_files":["src/a/Svc.cs"],"all_files":["src/a/Svc.cs","src/a/Page.aspx","src/a/q.sql"]}]}';
const MODULES_HOLE = '{"exclusions":[],"modules":[{"name":"a","path":"src/a","purpose":null,"primary_files":[],"all_files":["src/a/Svc.cs","src/a/Page.aspx"]}]}';
const SURFACE_FULL = '{"entries":[{"kind":"ui","name":"/a","page":"src/a/Page.aspx:1","consumed_by":[],"visibility":"unknown","confidence":"unknown"}]}';
const SURFACE_GROUPED = '{"entries":[{"kind":"ui","name":"pages of module a (grouped)","page":"","consumed_by":[],"visibility":"unknown","confidence":"unknown"}]}';
const MATRIX_FULL = `| Legacy file | Unit | Coverage |
|-------------|------|----------|
| \`src/a/Svc.cs\` | \`a/\` | 🟢 |
| \`src/a/Page.aspx\` | \`a/\` | 🟢 |
| \`src/a/q.sql\` | \`a/\` | 🟢 |`;
const MATRIX_PARTIAL = `| Legacy file | Unit | Coverage |
|-------------|------|----------|
| \`src/a/Svc.cs\` | \`a/\` | 🟢 |`;

// runGate(skill, manifest, ledger, modules, surface, matrix)
// null means: do not create that fixture file.
function runGate(skill, manifest, ledger, modules, surface, matrix) {
  const dir = h.mkTemp('dt-coverage-');
  mkdirSync(join(dir, '.doc-this', 'context'), { recursive: true });
  mkdirSync(join(dir, '.doc-this-sdd', 'traceability'), { recursive: true });
  writeFileSync(join(dir, '.doc-this', 'state.json'), STATE);
  if (manifest) writeFileSync(join(dir, '.doc-this', 'context', 'file-manifest.json'), manifest);
  if (ledger) writeFileSync(join(dir, '.doc-this', 'context', 'coverage-ledger.json'), ledger);
  if (modules) writeFileSync(join(dir, '.doc-this', 'context', 'modules.json'), modules);
  if (surface) writeFileSync(join(dir, '.doc-this-sdd', 'external-surface.json'), surface);
  if (matrix) writeFileSync(join(dir, '.doc-this-sdd', 'traceability', 'code-spec-matrix.md'), matrix);
  const input = JSON.stringify({ session_id: SESSION_ID, cwd: dir, tool_input: { skill } });
  const { code } = runNode(GATE, { input });
  rmSync(dir, { recursive: true, force: true });
  return code;
}

const assertExit = (name, expected, actual) =>
  h.check(`${name} (exit ${actual})`, actual === expected, `expected exit ${expected}, got ${actual}`);

const DET = 'doc-this:doc-this-detective';
const WRI = 'doc-this:doc-this-writer';
const REV = 'doc-this:doc-this-reviewer';

h.section('--- detective ← analysis coverage ---');
assertExit('detective denied: 2 source files unread (partial ledger)', 2, runGate(DET, MANIFEST, LEDGER_PARTIAL, MODULES_FULL, null, null));
assertExit('detective denied: ledger missing entirely (nothing read)', 2, runGate(DET, MANIFEST, null, MODULES_FULL, null, null));
assertExit('detective denied: q.sql unassigned (no all_files/exclusions home)', 2, runGate(DET, MANIFEST, LEDGER_FULL, MODULES_HOLE, null, null));
assertExit('detective allowed: full ledger + full module assignment', 0, runGate(DET, MANIFEST, LEDGER_FULL, MODULES_FULL, null, null));
assertExit('detective fail-open: ledger exists but is invalid JSON', 0, runGate(DET, MANIFEST, LEDGER_BROKEN, MODULES_FULL, null, null));

h.section('--- writer ← per-page ui coverage ---');
assertExit('writer denied: markup page has no per-page ui entry (grouped)', 2, runGate(WRI, MANIFEST, LEDGER_FULL, MODULES_FULL, SURFACE_GROUPED, null));
assertExit('writer denied: external-surface.json missing with markup present', 2, runGate(WRI, MANIFEST, LEDGER_FULL, MODULES_FULL, null, null));
assertExit('writer allowed: every markup page has its ui entry', 0, runGate(WRI, MANIFEST, LEDGER_FULL, MODULES_FULL, SURFACE_FULL, null));

h.section('--- reviewer ← code-spec-matrix coverage ---');
assertExit('reviewer denied: matrix missing rows for 2 source files', 2, runGate(REV, MANIFEST, LEDGER_FULL, MODULES_FULL, SURFACE_FULL, MATRIX_PARTIAL));
assertExit('reviewer denied: matrix file absent', 2, runGate(REV, MANIFEST, LEDGER_FULL, MODULES_FULL, SURFACE_FULL, null));
assertExit('reviewer allowed: matrix covers every source file', 0, runGate(REV, MANIFEST, LEDGER_FULL, MODULES_FULL, SURFACE_FULL, MATRIX_FULL));

h.section('--- legacy / pass-through / bypass ---');
assertExit('legacy run (no manifest): advisory + allow, never deny', 0, runGate(DET, null, null, null, null, null));
assertExit('optional data-master passes through untouched', 0, runGate('doc-this:doc-this-data-master', MANIFEST, null, null, null, null));
assertExit('code-analyst activation passes through (no coverage transition)', 0, runGate('doc-this:doc-this-code-analyst', MANIFEST, null, null, null, null));

closeSync(openSync(BYPASS, 'w'));
assertExit('bypass marker exempts even an unread-source deny', 0, runGate(DET, MANIFEST, LEDGER_PARTIAL, MODULES_FULL, null, null));
rmSync(BYPASS, { force: true });

h.done();
