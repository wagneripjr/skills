#!/usr/bin/env node
// test-farley-score-jev.mjs — acceptance matrix for the opt-in Jev signal judge (FR-FARLEY-2)
//
// The judge's value is in what code does with Jev's answers, so that is what is asserted here,
// on stdlib python alone: no uv, no typesafe-sdk, no network, no credits. The SDK's own request
// and retry behaviour is its job, not this suite's.
//
//   AC-1 eight Noul questions, each with instructions and both criteria
//   AC-2 state carries only the method's name, source, setup, framework and imports
//   AC-3 overlapping tautology questions count a defect once per property per method
//   AC-4 an answer inside [0.35, 0.65] escalates the method and keeps it out of the counts;
//        CANARY both sides: 0.34 and 0.66 are judged
//   AC-5 a method without setup escalates rather than being judged blind
//   AC-6 no key -> exit 77 with a fallback reason, before anything imports the SDK
//   AC-7 bad input -> exit 2; --version reports the manifest version and the pinned model
//   AC-8 MUTATION: dropping the per-method dedup or the escalation gate each flip a check
//   AC-9 real answers recorded from one live run on the bundled sample suite: every planted
//        tautology is labelled, and the interaction tests that do run real code are not

import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness, skip } from './lib/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'farley-score');
const SCRIPTS = join(PLUGIN, 'skills', 'farley-score', 'scripts');

if (spawnSync('python3', ['--version']).error) skip('python3 not found on PATH');

const h = new Harness('farley-score Jev judge');

const py = (dir, code) => {
  const r = spawnSync('python3', ['-c', `import sys, json; sys.dont_write_bytecode = True; sys.path.insert(0, ${JSON.stringify(dir)}); import jev_judge as j\n${code}`], { encoding: 'utf8' });
  if (r.status !== 0) return { error: r.stderr };
  return JSON.parse(r.stdout);
};
const cli = (args, env = {}) => {
  const e = { ...process.env, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete e[k];
  const r = spawnSync('python3', [join(SCRIPTS, 'jev_judge.py'), ...args], { encoding: 'utf8', env: e });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* reported by the caller */ }
  return { code: r.status, stdout: r.stdout, json };
};

const KEYS = ['production_code_drives_assertions', 'mock_tautology', 'mock_only', 'framework_test',
  'over_specified_interactions', 'inspects_internal_details', 'name_states_behaviour', 'single_outcome'];
const clean = { production_code_drives_assertions: 0.95, mock_tautology: 0.05, mock_only: 0.05, framework_test: 0.05,
  over_specified_interactions: 0.05, inspects_internal_details: 0.05, name_states_behaviour: 0.95, single_outcome: 0.95 };
const tautology = { ...clean, production_code_drives_assertions: 0.05, mock_tautology: 0.95, mock_only: 0.95, name_states_behaviour: 0.1 };
const method = (name, extra = {}) => ({ file: 't.py', line: 1, name, source: 'assert True', setup: '', ...extra });
const compose = (dir, methods, answers) => py(dir, `print(json.dumps(j.compose(${JSON.stringify(methods)}, ${JSON.stringify(answers)})))`);

h.section('AC-1 / AC-2 request shape');
{
  const q = py(SCRIPTS, 'print(json.dumps(j.build_questions()))');
  h.equal('exactly the eight signal questions', Object.keys(q).sort().join(','), [...KEYS].sort().join(','));
  h.check('every question is a Noul with instructions and true/false criteria',
    Object.values(q).every((x) => x.type === 'noul' && x.instructions.length > 20 && x.criteria.true && x.criteria.false));
  const s = py(SCRIPTS, `print(json.dumps(j.state_for({"file":"a.py","line":3,"name":"n","source":"s","setup":"","framework":"pytest","imports":"import a","secret":"x"})))`);
  h.equal('state carries only name, source, setup, framework and imports',
    Object.keys(s).sort().join(','), 'framework,imports,setup_and_fixtures,test_name,test_source');
  h.equal('the pinned model is a versioned id, not an alias', py(SCRIPTS, 'print(json.dumps(j.MODEL))'), 'jev-1.13.0');
}

h.section('AC-3 composition');
{
  const r = compose(SCRIPTS, [method('taut'), method('good')], [tautology, clean]);
  h.equal('three overlapping tautology hits count one N negative', r.counts.N.neg_count, 1);
  h.equal('...one M negative', r.counts.M.neg_count, 1);
  h.equal('...and one T negative', r.counts.T.neg_count, 1);
  h.equal('the clean method contributes one U positive', r.counts.U.pos_count, 1);
  h.equal('both single-outcome methods contribute a G positive each', r.counts.G.pos_count, 2);
  h.equal('a property Jev never judges stays at zero', r.counts.R.neg_count + r.counts.R.pos_count, 0);
  h.equal('both methods judged', r.judged_methods, 2);
  h.check('a fired inverted question reports the defect, not the question',
    r.methods[0].fired.includes('production_code_not_exercised') && !r.methods[0].fired.includes('production_code_drives_assertions'));
}

h.section('AC-4 / AC-5 escalation');
for (const [value, escalated] of [[0.5, true], [0.35, true], [0.65, true], [0.34, false], [0.66, false]]) {
  const r = compose(SCRIPTS, [method('m')], [{ ...clean, mock_only: value }]);
  h.equal(`mock_only at ${value} ${escalated ? 'escalates' : 'is judged'}`, r.methods[0].escalated, escalated);
}
{
  const r = compose(SCRIPTS, [method('m')], [{ ...tautology, framework_test: 0.5 }]);
  h.equal('an escalated method adds nothing to the counts', r.counts.N.neg_count, 0);
  const { setup, ...noSetup } = method('m');
  const r2 = compose(SCRIPTS, [noSetup], [clean]);
  h.check('a method without setup escalates and says why', r2.methods[0].escalated && r2.methods[0].reasons.some((x) => x.includes('setup')));
}

h.section('AC-6 / AC-7 command line');
{
  const dir = h.mkTemp('farley-jev-');
  const input = join(dir, 'methods.json');
  writeFileSync(input, JSON.stringify([method('m')]));
  const r = cli([input], { TYPESAFE_API_KEY: undefined });
  h.check('no key exits 77 with a fallback reason, on stdlib python with no SDK installed',
    r.code === 77 && r.json?.skipped === true && /fall back/.test(r.json.error), `exit ${r.code}: ${r.stdout}`);
  writeFileSync(input, JSON.stringify([{ name: 'm' }]));
  h.equal('a method without source is bad input (exit 2)', cli([input], { TYPESAFE_API_KEY: 'x' }).code, 2);
  writeFileSync(input, '[]');
  h.equal('an empty method list is bad input (exit 2)', cli([input], { TYPESAFE_API_KEY: 'x' }).code, 2);
  const version = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  h.equal('--version reports manifest version and model', cli(['--version']).stdout.trim(), `jev_judge.py ${version} (jev-1.13.0)`);
}

h.section('AC-9 recorded real answers');
{
  const rec = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'farley-score', 'jev-sample-suite.json'), 'utf8'));
  const methods = rec.methods.map((m) => method(m.name, { file: m.file, line: m.line }));
  const r = compose(SCRIPTS, methods, rec.methods.map((m) => m.nouls));
  const by = Object.fromEntries(r.methods.map((m) => [m.name, m]));
  const planted = ['test_true_is_true', 'test_one_equals_one', 'test_mock_returns_configured_value',
    'test_python_addition', 'test_python_string_methods', 'test_mock_only_no_real_code'];
  const theatre = ['production_code_not_exercised', 'mock_tautology', 'mock_only', 'framework_test'];
  for (const name of planted) {
    h.check(`planted tautology ${name} is labelled as theatre`, by[name]?.fired.some((f) => theatre.includes(f)), JSON.stringify(by[name]?.fired));
  }
  for (const name of ['test_deactivate_sets_active_false', 'test_register_calls_everything_in_order', 'test_should_add_two_positive_numbers']) {
    h.check(`${name} runs real code and is not called tautology theatre`,
      by[name] && !by[name].fired.includes('production_code_not_exercised') && !by[name].fired.includes('mock_only'), JSON.stringify(by[name]?.fired));
  }
  h.check('the over-specified ordering test is flagged AP3', by.test_register_calls_everything_in_order?.fired.includes('over_specified_interactions'));
  h.check('the mega-test is not credited with a single outcome', !by.test_all_operations?.fired.includes('single_outcome'));
  h.check('the cryptic name is not credited as behaviour-describing', !by.test_it_works?.fired.includes('name_states_behaviour'));
}

h.section('AC-8 mutation');
for (const [label, from, to, check] of [
  ['per-method dedup removed',
    'effects = sorted({effect for key in hits for effect in SIGNALS[key]["effects"]})',
    'effects = [effect for key in hits for effect in SIGNALS[key]["effects"]]',
    (dir) => compose(dir, [method('taut')], [tautology]).counts.N.neg_count === 1],
  ['escalation gate removed', '        if not reasons:\n', '        if True:\n',
    (dir) => compose(dir, [method('m')], [{ ...tautology, framework_test: 0.5 }]).counts.N.neg_count === 0],
]) {
  const dir = h.mkTemp('farley-jev-mutant-');
  cpSync(SCRIPTS, dir, { recursive: true });
  const src = readFileSync(join(dir, 'jev_judge.py'), 'utf8');
  h.check(`mutant source for "${label}" applies`, src.includes(from));
  writeFileSync(join(dir, 'jev_judge.py'), src.replace(from, to));
  h.check(`"${label}" is caught`, !check(dir));
}

h.done();
