#!/usr/bin/env node
// test-doc-this-dispatch-gate.mjs — regression test for the procedural-dispatch
// gate (BUG-003 follow-up): pipeline workers must not run unanchored.
//
// Discovery workers are dispatched objectively by /doc-this; activation in a
// project WITHOUT the pipeline anchor (.doc-this/state.json) is denied. The
// /doc-this orchestrator, optional agents, and non-pipeline skills pass through.
//
// Asserts exit codes: allow = 0, deny = 2.

import { mkdirSync, writeFileSync, rmSync, closeSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from '../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GATE = join(SCRIPT_DIR, 'doc-this-dispatch-gate.mjs');
const SESSION_ID = `test-dispatch-${process.pid}`;
const BYPASS = join(tmpdir(), `.claude-doc-this-bypass-${SESSION_ID}`);

rmSync(BYPASS, { force: true });

const h = new Harness('doc-this dispatch gate');

// runGate(skill, anchor: 'none'|'doc', field: 'skill'|'name') -> exit code
function runGate(skill, anchor, field) {
  const dir = h.mkTemp('dt-dispatch-');
  if (anchor === 'doc') {
    mkdirSync(join(dir, '.doc-this'), { recursive: true });
    writeFileSync(join(dir, '.doc-this', 'state.json'), '{"phase":"analysis","checkpoints":{}}');
  }
  const toolInput = field === 'name' ? { name: skill } : { skill };
  const input = JSON.stringify({ session_id: SESSION_ID, cwd: dir, tool_input: toolInput });
  const { code } = runNode(GATE, { input });
  rmSync(dir, { recursive: true, force: true });
  return code;
}

const assertExit = (name, expected, actual) =>
  h.check(`${name} (exit ${actual})`, actual === expected, `expected exit ${expected}, got ${actual}`);

h.section('--- Discovery workers ---');
assertExit('code-analyst DENIED without .doc-this/state.json (unanchored)', 2, runGate('doc-this:doc-this-code-analyst', 'none', 'skill'));
assertExit('code-analyst allowed when pipeline state exists', 0, runGate('doc-this:doc-this-code-analyst', 'doc', 'skill'));
assertExit('scout DENIED without pipeline state (workers incl. entry worker)', 2, runGate('doc-this:doc-this-scout', 'none', 'skill'));
assertExit('legacy archaeologist name DENIED without pipeline state', 2, runGate('doc-this:doc-this-archaeologist', 'none', 'skill'));
assertExit('writer DENIED without pipeline state', 2, runGate('doc-this:doc-this-writer', 'none', 'skill'));

h.section('--- Pass-throughs ---');
assertExit('doc-this orchestrator passes through without state', 0, runGate('doc-this:doc-this', 'none', 'skill'));
assertExit('optional tracer passes through without state', 0, runGate('doc-this:doc-this-tracer', 'none', 'skill'));
assertExit('doc-this-promote passes through without state', 0, runGate('doc-this:doc-this-promote', 'none', 'skill'));
assertExit('non-pipeline skill passes through', 0, runGate('wagner-skills:airflow-dags', 'none', 'skill'));

h.section('--- Defensive field read (.skill // .name) ---');
assertExit('tool_input.name fallback: worker DENIED without state', 2, runGate('doc-this:doc-this-detective', 'none', 'name'));

h.section('--- Bypass marker ---');
closeSync(openSync(BYPASS, 'w'));
assertExit('bypass marker exempts an unanchored worker', 0, runGate('doc-this:doc-this-code-analyst', 'none', 'skill'));
rmSync(BYPASS, { force: true });

h.done();
