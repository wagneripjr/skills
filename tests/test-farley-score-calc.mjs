#!/usr/bin/env node
// test-farley-score-calc.mjs — acceptance matrix for the farley-score calculator (FR-FARLEY-1)
//
// The skill forbids computing a Farley Index in prose, so this CLI is the only place the number is
// made. Expected values are derived here from the documented formulas, never captured from the
// script's own output — a projection checked against itself passes whatever the script does.
//
//   AC-1 the index divides by the weight sum 9.0, not the property count 8
//   AC-2 rating boundaries sit exactly on the documented thresholds
//   AC-3 a property with no signals scores the conservative 5.0
//   AC-4 sigmoid normalization matches the documented formula; extreme densities stay finite
//   AC-5 blend is 60/40 static/LLM
//   AC-6 malformed input yields {"ok":false} and exit 1; mismatched aggregate-suite lengths refuse
//   AC-7 --version reports the plugin manifest's version
//   AC-8 every command quoted in references/calculator.md runs and returns ok
//   AC-9 every scripts/*.py a skill document names exists
//   AC-10 MUTATION: an 8.0 divisor and a 6.0 base each flip the checks that guard them
//
// python3 is a hard prerequisite, so the suite owns its own 77 rather than a pass it never earned.

import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness, skip } from './lib/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'farley-score');
const SKILL = join(PLUGIN, 'skills', 'farley-score');
const SCRIPTS = join(SKILL, 'scripts');

if (spawnSync('python3', ['--version']).error) skip('python3 not found on PATH');

const h = new Harness('farley-score calculator');

const call = (dir, args) => {
  const r = spawnSync('python3', [join(dir, 'cli_calculator.py'), ...args], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout || r.stderr); } catch { /* reported by the caller */ }
  return { code: r.status, stdout: r.stdout, json };
};
const result = (dir, cmd, data) => call(dir, [cmd, JSON.stringify(data)]).json?.result;
const near = (a, b, eps = 1e-3) => typeof a === 'number' && Math.abs(a - b) < eps;
const all = (v) => Object.fromEntries(['U', 'M', 'R', 'A', 'N', 'G', 'F', 'T'].map((p) => [p, v]));
const sigmoid = (x, mid, k) => 1 / (1 + Math.exp(-k * (x - mid)));

function guards(dir) {
  const failed = [];
  const only = (prop) => ({ ...all(0), [prop]: 10 });
  if (!near(result(dir, 'compute-farley', only('U'))?.farley_index, 1.67, 0.006)) failed.push('divisor');
  if (!near(result(dir, 'compute-farley', only('F'))?.farley_index, 0.83, 0.006)) failed.push('divisor');
  if (!near(result(dir, 'normalize-property', { prop: 'U', neg_count: 0, pos_count: 0, total_methods: 20 })?.score, 5)) failed.push('base');
  if (!near(result(dir, 'normalize-property', { prop: 'U', neg_count: 0, pos_count: 0, total_methods: 0 })?.score, 5)) failed.push('base');
  return [...new Set(failed)];
}

h.section('AC-1 / AC-3 guarded formulas');
h.equal('the unmodified calculator passes every guard', guards(SCRIPTS).join(','), '');
h.equal('all properties at 9 give index 9.0', result(SCRIPTS, 'compute-farley', all(9))?.farley_index, 9);

h.section('AC-2 rating boundaries');
for (const [index, rating] of [[10, 'Exemplary'], [9.0, 'Exemplary'], [8.99, 'Excellent'], [7.5, 'Excellent'],
  [7.49, 'Good'], [6.0, 'Good'], [5.99, 'Fair'], [4.5, 'Fair'], [4.49, 'Poor'], [3.0, 'Poor'], [2.99, 'Critical'], [0, 'Critical']]) {
  h.equal(`${index} rates ${rating}`, result(SCRIPTS, 'get-rating', { farley_index: index })?.rating, rating);
}

h.section('AC-4 sigmoid normalization');
{
  const neg = (1 - sigmoid(2 / 20, 0.30, 8)) * 10;
  const pos = sigmoid(8 / 20, 0.50, 8) * 10;
  const got = result(SCRIPTS, 'normalize-property', { prop: 'U', neg_count: 2, pos_count: 8, total_methods: 20 })?.score;
  h.check('U with 2 negative and 8 positive of 20 matches the documented formula', near(got, 0.5 * neg + 0.5 * pos), `got ${got}`);
  const huge = result(SCRIPTS, 'normalize-property', { prop: 'R', neg_count: 1e9, pos_count: 0, total_methods: 1 })?.score;
  h.check('an extreme negative density stays finite and inside 0..10', Number.isFinite(huge) && huge >= 0 && huge <= 10, `got ${huge}`);
}

h.section('AC-5 blend');
h.check('7.5 static and 8.0 LLM blend to 7.7', near(result(SCRIPTS, 'blend-scores', { static_score: 7.5, llm_score: 8.0 })?.score, 7.7));

h.section('AC-6 refusals');
for (const [label, args] of [
  ['invalid JSON', ['compute-farley', '{nope']],
  ['a missing field', ['normalize-property', '{"prop":"U"}']],
  ['an unknown command', ['divide-by-zero', '{}']],
  ['mismatched aggregate-suite lengths', ['aggregate-suite', JSON.stringify({ file_scores: [all(8)], file_locs: [10, 20] })]],
]) {
  const r = call(SCRIPTS, args);
  h.check(`${label} yields ok:false and exit 1`, r.code === 1 && r.json?.ok === false, `exit ${r.code}, ${r.stdout}`);
}
h.check('equal aggregate-suite lengths still aggregate',
  near(result(SCRIPTS, 'aggregate-suite', { file_scores: [all(8), all(6)], file_locs: [30, 10] })?.U, 7.5));

h.section('AC-7 version');
{
  const version = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  h.equal('--version prints the manifest version', call(SCRIPTS, ['--version']).stdout.trim(), `cli_calculator.py ${version}`);
}

h.section('AC-8 documented commands run');
{
  const doc = readFileSync(join(SKILL, 'references', 'calculator.md'), 'utf8');
  const commands = [...doc.matchAll(/^python3 "\$CALC" (\S+) '(.+)'$/gm)];
  h.check('calculator.md quotes at least seven commands', commands.length >= 7, `found ${commands.length}`);
  for (const [, cmd, data] of commands) {
    const r = call(SCRIPTS, [cmd, data]);
    h.check(`documented ${cmd} returns ok`, r.code === 0 && r.json?.ok === true, r.stdout);
  }
}

h.section('AC-9 named scripts exist');
{
  const docs = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? (e.name !== 'assets' && walk(join(d, e.name))) : e.name.endsWith('.md') && docs.push(join(d, e.name)));
  walk(join(PLUGIN, 'skills'));
  const named = new Set(docs.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/scripts\/([\w-]+\.py)/g)].map((m) => m[1])));
  h.check('skill documents name at least one script', named.size > 0);
  for (const name of named) h.check(`scripts/${name} exists`, readdirSync(SCRIPTS).includes(name));
}

h.section('AC-10 mutation');
for (const [label, from, to, guard] of [
  ['an 8.0 divisor', 'WEIGHT_SUM = 9.0', 'WEIGHT_SUM = 8.0', 'divisor'],
  ['a 6.0 no-signal base', '    if neg_count == 0 and pos_count == 0:\n        return 5.0', '    if neg_count == 0 and pos_count == 0:\n        return 6.0', 'base'],
]) {
  const dir = h.mkTemp('farley-mutant-');
  cpSync(SCRIPTS, dir, { recursive: true });
  const src = readFileSync(join(dir, 'scoring.py'), 'utf8');
  h.check(`mutant source for ${label} applies`, src.includes(from));
  writeFileSync(join(dir, 'scoring.py'), src.replace(from, to));
  h.check(`${label} is caught by the ${guard} guard`, guards(dir).includes(guard));
}

h.done();
