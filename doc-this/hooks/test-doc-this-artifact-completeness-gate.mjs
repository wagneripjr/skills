#!/usr/bin/env node
// test-doc-this-artifact-completeness-gate.mjs — regression test for the per-module
// artifact-completeness gate (BUG-004: the Code Analyst shipped early modules with
// entities only in modules.json and no data-dictionary/[module].md or
// flowcharts/[module].md, because "module complete" checked file reads, not
// artifact writes).
//
// Asserts the gate's exit codes at the detective transition:
//   allow = exit 0, deny = exit 2.
// Contract (doc_level ∈ {standard, detailed}): per module in modules.json,
//   data-dictionary/[module].md required IFF entities[] non-empty
//   flowcharts/[module].md      required IFF functions[] OR algorithms[] non-empty
// Covers: missing-dict deny, missing-flowchart deny, algorithms-only deny (proves
// the OR), complete allow, entity/fn/algo-less module allow, doc_level=minimal
// allow, legacy (no modules.json) advisory, malformed modules.json fail-open,
// non-detective pass-through, bypass marker.

import { mkdirSync, writeFileSync, rmSync, closeSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from '../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const GATE = join(SCRIPT_DIR, 'doc-this-artifact-completeness-gate.mjs');
const SESSION_ID = `test-bug004-${process.pid}`;
const BYPASS = join(tmpdir(), `.claude-doc-this-bypass-${SESSION_ID}`);

rmSync(BYPASS, { force: true });

const h = new Harness('doc-this artifact completeness gate');
const DET = 'doc-this:doc-this-detective';

// Module shapes (modules.json). "ent" = 1 entity, "fn" = 1 function, "algo" = 1 algorithm.
const MOD_ENT_FN = '{"exclusions":[],"modules":[{"name":"orders","path":"src/orders","purpose":null,"primary_files":[],"all_files":[],"entities":[{"name":"Order","fields":[]}],"functions":[{"name":"place","file":"x","line":1}],"algorithms":[]}]}';
const MOD_ENT_ONLY = '{"exclusions":[],"modules":[{"name":"views","path":"src/views","purpose":null,"primary_files":[],"all_files":[],"entities":[{"name":"V","fields":[]}],"functions":[],"algorithms":[]}]}';
const MOD_FN_ONLY = '{"exclusions":[],"modules":[{"name":"components","path":"src/components","purpose":null,"primary_files":[],"all_files":[],"entities":[],"functions":[{"name":"render","file":"x","line":1}],"algorithms":[]}]}';
const MOD_ALGO_ONLY = '{"exclusions":[],"modules":[{"name":"shared","path":"src/shared","purpose":null,"primary_files":[],"all_files":[],"entities":[],"functions":[],"algorithms":[{"name":"normalize"}]}]}';
const MOD_EMPTY = '{"exclusions":[],"modules":[{"name":"constants","path":"src/constants","purpose":null,"primary_files":[],"all_files":[],"entities":[],"functions":[],"algorithms":[]}]}';
const MOD_BROKEN = '{"modules":[oops';

// runGate(skill, docLevel, modules|null, dictFor[], flowFor[])
function runGate(skill, docLevel, modules, makeDict = [], makeFlow = []) {
  const dir = h.mkTemp('dt-artifact-');
  mkdirSync(join(dir, '.doc-this', 'context'), { recursive: true });
  mkdirSync(join(dir, '.doc-this-sdd', 'data-dictionary'), { recursive: true });
  mkdirSync(join(dir, '.doc-this-sdd', 'flowcharts'), { recursive: true });
  writeFileSync(
    join(dir, '.doc-this', 'state.json'),
    JSON.stringify({
      output_folder: '.doc-this-sdd',
      doc_level: docLevel,
      checkpoints: { scout: {}, code_analyst: { modules_analyzed: ['a'] } },
    }),
  );
  if (modules) writeFileSync(join(dir, '.doc-this', 'context', 'modules.json'), modules);
  for (const m of makeDict) writeFileSync(join(dir, '.doc-this-sdd', 'data-dictionary', `${m}.md`), `# ${m}\n`);
  for (const m of makeFlow) writeFileSync(join(dir, '.doc-this-sdd', 'flowcharts', `${m}.md`), `# ${m}\n`);
  const input = JSON.stringify({ session_id: SESSION_ID, cwd: dir, tool_input: { skill } });
  const { code } = runNode(GATE, { input });
  rmSync(dir, { recursive: true, force: true });
  return code;
}

const assertExit = (name, expected, actual) =>
  h.check(`${name} (exit ${actual})`, actual === expected, `expected exit ${expected}, got ${actual}`);

h.section('--- DENY: required artifacts missing ---');
assertExit('deny: entities>0 but no data-dictionary/[module].md', 2, runGate(DET, 'detailed', MOD_ENT_ONLY));
assertExit('deny: functions>0 but no flowcharts/[module].md', 2, runGate(DET, 'standard', MOD_FN_ONLY));
assertExit('deny: algorithms>0 (functions==0) but no flowchart — proves the OR', 2, runGate(DET, 'detailed', MOD_ALGO_ONLY));
assertExit('deny: entity+fn module has flowchart but no data-dictionary', 2, runGate(DET, 'detailed', MOD_ENT_FN, [], ['orders']));

h.section('--- ALLOW: contract satisfied ---');
assertExit('allow: entity+fn module has both data-dictionary and flowchart', 0, runGate(DET, 'detailed', MOD_ENT_FN, ['orders'], ['orders']));
assertExit('allow: entity-only module has its data-dictionary, no flowchart needed', 0, runGate(DET, 'standard', MOD_ENT_ONLY, ['views'], []));
assertExit('allow: fn-only module has its flowchart, no data-dictionary needed', 0, runGate(DET, 'standard', MOD_FN_ONLY, [], ['components']));
assertExit('allow: empty module (no entities/functions/algorithms) needs no artifacts', 0, runGate(DET, 'detailed', MOD_EMPTY));

h.section('--- ALLOW: doc_level=minimal embeds artifacts, never gated ---');
assertExit('allow: doc_level=minimal even with entities and no dict file', 0, runGate(DET, 'minimal', MOD_ENT_FN));

h.section('--- legacy / fail-open / pass-through / bypass ---');
assertExit('advise+allow: no modules.json (legacy run)', 0, runGate(DET, 'detailed', null));
assertExit('fail-open: modules.json is invalid JSON', 0, runGate(DET, 'detailed', MOD_BROKEN));
assertExit('pass-through: non-detective skill (writer) untouched', 0, runGate('doc-this:doc-this-writer', 'detailed', MOD_ENT_ONLY));
assertExit('pass-through: code-analyst activation untouched', 0, runGate('doc-this:doc-this-code-analyst', 'detailed', MOD_ENT_ONLY));

closeSync(openSync(BYPASS, 'w'));
assertExit('bypass marker exempts even a missing-dict deny', 0, runGate(DET, 'detailed', MOD_ENT_ONLY));
rmSync(BYPASS, { force: true });

h.done();
