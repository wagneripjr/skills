#!/usr/bin/env node
// test-doc-this-describe-only-gate.mjs — regression test for the describe-only gate.
//
// BUG-005: the gate policed docs/requirements, docs/adr, docs/bugs whenever a project
// had ever run doc-this (.doc-this/state.json is permanent), so hand-written
// forward-design ADRs (## Consequences) and "should be" requirements were blocked
// forever. Fix: scope the gate to the staging tree ONLY (.doc-this-sdd/**; the
// legacy visible name _doc_this_sdd/** is still matched for in-flight runs).
//
// Asserts the gate's exit codes:  allow = exit 0,  deny = exit 2.
// Covers: each deny rule fires inside .doc-this-sdd/** AND legacy _doc_this_sdd/**;
// the shared docs/ SDLC namespace is no longer policed (the regression); non-doc-this
// projects untouched; the DOC-THIS-EXEMPT escape valve and Edit (.new_string) path.

import { mkdirSync, writeFileSync, rmSync, closeSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from '../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GATE = join(SCRIPT_DIR, 'doc-this-describe-only-gate.mjs');
const SESSION_ID = `test-bug005-${process.pid}`;
const BYPASS = join(tmpdir(), `.claude-doc-this-bypass-${SESSION_ID}`);

rmSync(BYPASS, { force: true });

const h = new Harness('doc-this describe-only gate');

// runGate(hasState, filePath, content, toolKey = 'content')
function runGate(hasState, filePath, content, toolKey = 'content') {
  const dir = h.mkTemp('dt-describe-');
  if (hasState) {
    mkdirSync(join(dir, '.doc-this'), { recursive: true });
    writeFileSync(join(dir, '.doc-this', 'state.json'), '{"output_folder":".doc-this-sdd"}');
  }
  const input = JSON.stringify({
    session_id: SESSION_ID,
    cwd: dir,
    tool_input: { file_path: filePath, [toolKey]: content },
  });
  const { code } = runNode(GATE, { input });
  rmSync(dir, { recursive: true, force: true });
  return code;
}

const assertExit = (name, expected, actual) =>
  h.check(`${name} (exit ${actual})`, actual === expected, `expected exit ${expected}, got ${actual}`);

h.section('--- Legacy staging name still policed (backward-compat: _doc_this_sdd/**) ---');
assertExit('deny: 🟡 marker in staging requirements', 2,
  runGate(true, '_doc_this_sdd/units/a/requirements.md', '# Unit A\n🟡 INFERRED: caching layer'));
assertExit('deny: judgment phrase in staging code-analysis', 2,
  runGate(true, '_doc_this_sdd/units/a/code-analysis.md', 'Notes\nthis could be improved by extracting a helper'));
assertExit('deny: fabricated ## Consequences in staged decision-trace', 2,
  runGate(true, '_doc_this_sdd/decision-traces/dt-001.md', '# Decision\n## Consequences\nfoo'));
assertExit('deny: fabricated section in staged adr/ADR-*.md path', 2,
  runGate(true, '_doc_this_sdd/units/a/adr/ADR-1.md', '# ADR\n## Alternatives considered\nbar'));
assertExit('deny: technical-debt header in staging', 2,
  runGate(true, '_doc_this_sdd/units/a/design.md', '# Design\n## Technical Debt\nx'));
assertExit('deny: NFR-from-pattern phrase in staging', 2,
  runGate(true, '_doc_this_sdd/units/a/requirements.md', 'Latency target inferred from middleware timeout'));
assertExit('deny: sampling-phrase (outline variant) in staging — Rule 7', 2,
  runGate(true, '_doc_this_sdd/units/a/code-analysis.md', 'the remaining files were read by outline'));
assertExit('deny: sampling-phrase (en) in staging — Rule 7', 2,
  runGate(true, '_doc_this_sdd/units/a/code-analysis.md', 'these files were not read in full'));
assertExit('deny applies to Edit (.new_string) too, staging', 2,
  runGate(true, '_doc_this_sdd/units/a/requirements.md', '🟡 INFERRED', 'new_string'));
assertExit('allow: clean staging file (no violation)', 0,
  runGate(true, '_doc_this_sdd/units/a/requirements.md', '# Unit A\nThe endpoint returns 200 on success.'));
assertExit('exempt: DOC-THIS-EXEMPT marker bypasses a staging violation', 0,
  runGate(true, '_doc_this_sdd/units/a/requirements.md', '<!-- DOC-THIS-EXEMPT : reason="legit edge case" -->\n🟡 INFERRED'));

h.section('--- The gate fires inside the new default staging tree (.doc-this-sdd/**) ---');
assertExit('deny: 🟡 marker in .doc-this-sdd requirements', 2,
  runGate(true, '.doc-this-sdd/units/a/requirements.md', '# Unit A\n🟡 INFERRED: caching layer'));
assertExit('deny: judgment phrase in .doc-this-sdd code-analysis', 2,
  runGate(true, '.doc-this-sdd/units/a/code-analysis.md', 'Notes\nthis could be improved by extracting a helper'));
assertExit('deny: fabricated ## Consequences in .doc-this-sdd decision-trace', 2,
  runGate(true, '.doc-this-sdd/decision-traces/dt-001.md', '# Decision\n## Consequences\nfoo'));
assertExit('deny: sampling-phrase (en) in .doc-this-sdd — Rule 7', 2,
  runGate(true, '.doc-this-sdd/units/a/code-analysis.md', 'these files were not read in full'));
assertExit('allow: clean .doc-this-sdd file (no violation)', 0,
  runGate(true, '.doc-this-sdd/units/a/requirements.md', '# Unit A\nThe endpoint returns 200 on success.'));
assertExit('exempt: DOC-THIS-EXEMPT marker bypasses a .doc-this-sdd violation', 0,
  runGate(true, '.doc-this-sdd/units/a/requirements.md', '<!-- DOC-THIS-EXEMPT : reason="legit edge case" -->\n🟡 INFERRED'));

h.section('--- BUG-005 regression: the shared docs/ SDLC namespace is NO LONGER policed ---');
assertExit('ALLOW: forward-design ADR with ## Consequences in docs/adr (the bug)', 0,
  runGate(true, 'docs/adr/ADR-004-renew-order.md', '# ADR-004\n## Decision\nUse event sourcing.\n## Consequences\nMore storage.'));
assertExit('ALLOW: docs/adrs/ ADR with ## Alternatives considered', 0,
  runGate(true, 'docs/adrs/ADR-009.md', '# ADR-009\n## Alternatives considered\nKept the monolith.'));
assertExit("ALLOW: requirement saying 'should be' in docs/requirements", 0,
  runGate(true, 'docs/requirements/FR-001-login.md', '# FR-001\nThe system should be available 24/7.\nWe recommend OAuth.'));
assertExit('ALLOW: bug report in docs/bugs even with a tech-debt header', 0,
  runGate(true, 'docs/bugs/BUG-010-timeout.md', '# BUG-010\n## Technical Debt\nLegacy retry loop.'));

h.section('--- Non-doc-this project: gate is a silent no-op regardless of content ---');
assertExit('ALLOW: forward ADR with ## Consequences in a NON-doc-this project', 0,
  runGate(false, 'docs/adr/ADR-001.md', '# ADR-001\n## Consequences\nanything'));
assertExit('ALLOW: even a _doc_this_sdd path when no .doc-this/state.json exists', 0,
  runGate(false, '_doc_this_sdd/units/a/requirements.md', '🟡 INFERRED'));

h.section('--- Bypass marker ---');
closeSync(openSync(BYPASS, 'w'));
assertExit('bypass marker exempts even a staging violation', 0,
  runGate(true, '_doc_this_sdd/units/a/requirements.md', '🟡 INFERRED'));
rmSync(BYPASS, { force: true });

h.done();
