#!/usr/bin/env node
// FR-TESSL-5 — the eval record, and the non-activation proof it carries.
//
// Reads only committed bytes: no network, no account, no credits, so it runs in the default
// suite. What it cannot do is check a number against Tessl — that is exactly why the numbers
// are projected by scripts/eval-record.mjs and never typed. What it CAN check is that the
// projection is internally consistent, carries no id the publication-safety rule forbids,
// and that the activation column says what CLAUDE.md claims it says.
//
// Zero dependencies. Node >= 18.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Harness } from './lib/harness.mjs';
import { CLASSIFICATIONS } from '../scripts/eval-record.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PLUGINS = join(ROOT, 'plugins');
const GATE = join(ROOT, 'plugins/doc-this/hooks/doc-this-dispatch-gate.mjs');
const PROOF = join(ROOT, 'tests/fixtures/activation-scenarios/RESULTS.json');

const h = new Harness('FR-TESSL-5 — the record is projected, and the workers stay quiet');

// ---------------------------------------------------------------------------
// The WORKERS set is READ from the gate, never restated here. A harness that
// carries its own copy stops testing the gate the moment the two diverge — and
// divergence is silent, because both lists still look plausible.
// ---------------------------------------------------------------------------

function workersFromGate(source) {
  const block = /const WORKERS = new Set\(\[([\s\S]*?)\]\);/.exec(source);
  if (!block) return null;
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const gateSource = readFileSync(GATE, 'utf8');
const workers = workersFromGate(gateSource);

h.check('AC-1 the WORKERS set parses out of the dispatch gate', Array.isArray(workers) && workers.length > 0,
  `got ${JSON.stringify(workers)}`);

// Tessl reports an activated skill as tessl__<skill>; the gate names it <plugin>:<skill>.
// This mapping is the load-bearing line of the whole proof: compare the two spellings
// directly and nothing ever matches, so the proof passes without observing anything.
const tesslName = (dispatchName) => `tessl__${dispatchName.split(':').pop()}`;
const FORBIDDEN = new Set((workers ?? []).map(tesslName));

h.check('AC-2 the dispatch spelling maps to the tessl spelling',
  tesslName('doc-this:doc-this-scout') === 'tessl__doc-this-scout');
h.check('AC-2b the orchestrator is not in the forbidden set',
  !FORBIDDEN.has('tessl__doc-this'),
  `forbidden: ${[...FORBIDDEN].join(', ')}`);

// ---------------------------------------------------------------------------
// Every RESULTS.json in the tree.
// ---------------------------------------------------------------------------

const records = [];
for (const p of readdirSync(PLUGINS).sort()) {
  const f = join(PLUGINS, p, 'evals', 'RESULTS.json');
  if (existsSync(f)) records.push([`plugins/${p}/evals/RESULTS.json`, f]);
}
if (existsSync(PROOF)) records.push(['tests/fixtures/activation-scenarios/RESULTS.json', PROOF]);

h.check('AC-3 at least one run is recorded', records.length > 0,
  'no RESULTS.json anywhere — a measurement that is not recorded is a claim');

const FIELDS = [
  'skill', 'plugin_version', 'scenario', 'scenario_tree', 'skill_tree', 'context_commit',
  'model_reported', 'forced_activation', 'runs', 'baseline', 'with_plugin', 'lift_pp',
  'activated', 'status', 'classification', 't',
];
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const ABSPATH = /(^|["\s])(\/Users\/|\/home\/|[A-Za-z]:\\)/;

const allRows = [];
for (const [label, file] of records) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    h.bad(`AC-4 ${label} parses`, String(e.message));
    continue;
  }
  h.check(`AC-4 ${label} parses and carries rows`, Array.isArray(parsed.rows) && parsed.rows.length > 0);
  for (const r of parsed.rows ?? []) allRows.push([label, r]);

  const raw = readFileSync(file, 'utf8');
  h.check(`AC-5 ${label} carries no run, workspace or user id`, !UUID.test(raw));
  h.check(`AC-5b ${label} carries no absolute local path`, !ABSPATH.test(raw));
}

for (const [label, r] of allRows) {
  const where = `${label} · ${r.skill}/${r.scenario}`;
  const missing = FIELDS.filter((f) => !(f in r));
  h.check(`AC-6 ${where} carries every field`, missing.length === 0, `missing: ${missing.join(', ')}`);

  if (r.status === 'completed') {
    const expected = Math.round((r.with_plugin - r.baseline) * 10) / 10;
    h.check(`AC-7 ${where} lift_pp is with_plugin minus baseline`,
      Math.abs(r.lift_pp - expected) < 0.05,
      `recorded ${r.lift_pp}, computed ${expected} from ${r.baseline} and ${r.with_plugin}`);
  } else if (r.status === 'incomplete') {
    // The generator leaves this null on purpose, so this check fails until a human writes
    // one. That is the point: an unexplained failure is not allowed to sit in the record.
    h.check(`AC-8 ${where} a run that did not complete is classified`,
      CLASSIFICATIONS.includes(r.classification),
      `classification ${JSON.stringify(r.classification)} is not one of ${CLASSIFICATIONS.join(' / ')}`);
  } else {
    h.check(`AC-8b ${where} an unscored probe carries no scores to misread`,
      r.status === 'unscored' && r.baseline === null && r.with_plugin === null && r.lift_pp === null,
      `status ${r.status}, baseline ${r.baseline}, with_plugin ${r.with_plugin}`);
  }
}

// ---------------------------------------------------------------------------
// The proof itself.
// ---------------------------------------------------------------------------

const probes = allRows.filter(([, r]) => r.forced_activation === false);

if (!probes.length) {
  process.stdout.write(
    '  NOTE: no unforced-activation run recorded yet — see tests/fixtures/activation-scenarios/README.md\n',
  );
} else {
  const offenders = probes.flatMap(([, r]) =>
    (r.activated ?? []).filter((s) => FORBIDDEN.has(s)).map((s) => `${r.scenario}: ${s}`));
  h.check('AC-9 no Discovery worker activated on user phrasing alone', offenders.length === 0,
    offenders.join('; '));

  // The control. An agent that activated nothing at all makes AC-9 pass for the wrong
  // reason, which is the same fail-open as a scan that reads no files.
  const anyActivation = probes.some(([, r]) => (r.activated ?? []).length > 0);
  h.check('AC-10 at least one probe activated something', anyActivation,
    'every probe activated nothing — AC-9 proved nothing, it just had no data');
}

// ---------------------------------------------------------------------------
// Mutation canaries. A guard that has never been seen to fail is a guard nobody
// has tested; both directions, because a set that matches everything and a set
// that matches nothing are indistinguishable from the green side.
// ---------------------------------------------------------------------------

h.section('canaries');

h.check('AC-11a a renamed set in the gate is detected, not silently ignored',
  workersFromGate(gateSource.replace('const WORKERS = new Set([', 'const HANDS = new Set([')) === null);

h.check('AC-11b a worker in an activated column is caught',
  ['tessl__doc-this-scout'].some((s) => FORBIDDEN.has(s)));

h.check('AC-11c the orchestrator in an activated column is allowed',
  !['tessl__doc-this'].some((s) => FORBIDDEN.has(s)));

// AC-5's detector, proven against a planted id rather than assumed. Split literal: written
// whole it would be a real run id in a tracked file, which is the thing AC-5 forbids — the
// canary would fail test-publication-safety.mjs and the fix would be to weaken the canary.
h.check('AC-11d the id scan flags a run id',
  UUID.test(`"id": "01a07d81${'-4d62-70ff-'}bc94-080009d5f0fd"`));
h.check('AC-11e the id scan ignores a git tree object id', !UUID.test('"skill_tree": "d57264acd4e973b9af7cf316cf881b218eed0e42"'));

// git is the arbiter of what ships; a record inside .tesslignore'd evals/ must still be tracked.
try {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'plugins/*/evals/RESULTS.json'],
    { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const onDisk = records.filter(([l]) => l.startsWith('plugins/')).map(([l]) => l);
  h.check('AC-12 every plugin record is tracked by git', tracked.length === onDisk.length,
    `tracked ${tracked.length}, on disk ${onDisk.length}`);
} catch {
  process.stdout.write('  NOTE: git unavailable; AC-12 not evaluated\n');
}

h.done();
