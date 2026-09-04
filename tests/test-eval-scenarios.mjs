#!/usr/bin/env node
// test-eval-scenarios.mjs — structural checks on the eval scenario tree, and a guard against
// `tessl eval lint`'s documented fail-open.
//
// The tool's own help says it: "A directory is recognized as a scenario only when it contains
// task.md. Directories without task.md are silently skipped and recursed into, so a scenario
// directory missing task.md will not produce a lint error." Verified against 0.105.0 — a folder
// holding only criteria.json lints as "✔ 0 scenarios valid", exit 0. A rename or a typo therefore
// removes a scenario from every future run while every signal stays green.
//
//   AC-1 pairing      — every dir holding criteria.json also holds task.md
//   AC-2 rubric shape — criteria.json is a weighted_checklist of {name, description, max_score}
//   AC-3 no category  — 0.105.0 warns on the `category` key the published docs describe
//   AC-4 non-empty    — task.md carries content; a scenario the agent cannot read is not one
//   AC-5 agreement    — our walk and `tessl eval lint` count the same scenarios (skipped without tessl)
//   AC-6 canary       — a scenario dir stripped of task.md is caught here and NOT by eval lint
//
// Structural checks run with no tessl account, no network and no credits, so this suite exits 0
// on a bare clone. Only AC-5 needs the CLI, and it degrades to a reported skip rather than 77:
// an unconditional 77 would pin tests/run-all.mjs at permanent INCOMPLETE for every contributor.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness } from './lib/harness.mjs';
import { resolveTessl } from './lib/tessl.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, '..');
const EVALS = join(ROOT, 'evals');

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// Every directory under the tree, so a scenario is found by what it CONTAINS rather than by
// where someone remembered to put it.
function walk(dir, acc = []) {
  if (!isDir(dir)) return acc;
  acc.push(dir);
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'resources') continue;
    walk(join(dir, name), acc);
  }
  return acc;
}

const h = new Harness('eval scenario tree: shape, rubric contract, and the lint fail-open guard');

if (!isDir(EVALS)) {
  h.bad('AC-0 evals/ does not exist — nothing to check', EVALS);
  h.done();
}

const dirs = walk(EVALS);
const withCriteria = dirs.filter((d) => existsSync(join(d, 'criteria.json')));
const withTask = dirs.filter((d) => existsSync(join(d, 'task.md')));
const rel = (p) => relative(ROOT, p);

// AC-1 pairing — the fail-open case
const unpaired = withCriteria.filter((d) => !existsSync(join(d, 'task.md')));
h.check(`AC-1 every criteria.json sits beside a task.md (${withCriteria.length} scenario dir(s))`,
  unpaired.length === 0, unpaired.map(rel).join('\n        '));

// The mirror: a task.md with no rubric is scored by nothing.
const rubricless = withTask.filter((d) => !existsSync(join(d, 'criteria.json')));
h.check('AC-1b every task.md sits beside a criteria.json', rubricless.length === 0,
  rubricless.map(rel).join('\n        '));

// AC-2 / AC-3 rubric shape. 0.105.0 accepts exactly {name, description, max_score}; the
// category enum in the published docs is warned about as an extra field, so it must not appear.
const shapeErrors = [];
const categoryHits = [];
for (const d of withCriteria) {
  const p = join(d, 'criteria.json');
  let c;
  try { c = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { shapeErrors.push(`${rel(p)}: unparseable — ${e.message}`); continue; }
  if (c.type !== 'weighted_checklist') shapeErrors.push(`${rel(p)}: type is ${JSON.stringify(c.type)}, want "weighted_checklist"`);
  if (typeof c.context !== 'string' || !c.context.trim()) shapeErrors.push(`${rel(p)}: context is missing or blank`);
  if (!Array.isArray(c.checklist) || c.checklist.length === 0) { shapeErrors.push(`${rel(p)}: checklist is missing or empty`); continue; }
  for (const [i, item] of c.checklist.entries()) {
    const at = `${rel(p)}[${i}]`;
    if (typeof item?.name !== 'string' || !item.name.trim()) shapeErrors.push(`${at}: name is missing or blank`);
    if (typeof item?.description !== 'string' || !item.description.trim()) shapeErrors.push(`${at}: description is missing or blank`);
    if (typeof item?.max_score !== 'number' || !Number.isFinite(item.max_score) || item.max_score <= 0) shapeErrors.push(`${at}: max_score must be a positive number`);
    for (const k of Object.keys(item ?? {})) {
      if (!['name', 'description', 'max_score'].includes(k)) {
        (k === 'category' ? categoryHits : shapeErrors).push(`${at}: extra key ${JSON.stringify(k)}`);
      }
    }
  }
}
h.check(`AC-2 every criteria.json is a well-formed weighted_checklist`, shapeErrors.length === 0,
  shapeErrors.slice(0, 12).join('\n        '));
h.check('AC-3 no checklist item carries the `category` key 0.105.0 warns about', categoryHits.length === 0,
  categoryHits.slice(0, 8).join('\n        '));

// AC-4 non-empty task
const emptyTasks = withTask.filter((d) => readFileSync(join(d, 'task.md'), 'utf8').trim().length === 0);
h.check('AC-4 every task.md carries content', emptyTasks.length === 0, emptyTasks.map(rel).join('\n        '));

// AC-5 agreement — the whole reason AC-1 exists is that lint cannot see the failure AC-1 catches,
// so the two counts must be compared rather than trusted separately.
// Never the npx fallback here: this suite runs in the default test run, and npx would
// fetch tessl from the registry on a cold CI machine.
const bin = resolveTessl({ allowNpx: false });
if (!bin) {
  process.stdout.write('  note: tessl CLI not found — AC-5 (count agreement) not evaluated; structural checks above still ran.\n');
} else {
  const r = spawnSync(bin.cmd, [...bin.prefix, 'eval', 'lint', EVALS], { encoding: 'utf8' });
  const m = /(\d+)\s+scenarios?\s+valid/.exec(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  if (!m) {
    process.stdout.write(`  note: could not read a scenario count from tessl eval lint — AC-5 not evaluated (exit ${r.status}).\n`);
  } else {
    h.equal(`AC-5 tessl eval lint counts what the walk counts`, Number(m[1]), withTask.length);
  }
}

// AC-6 canary — prove AC-1 discriminates, and that eval lint does NOT. Both directions, in a
// throwaway copy: a guard that has never seen the failure it guards is not a guard.
const tmp = h.mkTemp('eval-scenarios-');
const probe = join(tmp, 'stripped');
mkdirSync(probe, { recursive: true });
const donor = withCriteria[0];
if (!donor) {
  h.bad('AC-6 cannot run — no scenario to copy from');
} else {
  copyFileSync(join(donor, 'criteria.json'), join(probe, 'criteria.json'));
  const control = join(tmp, 'intact');
  mkdirSync(control, { recursive: true });
  copyFileSync(join(donor, 'criteria.json'), join(control, 'criteria.json'));
  writeFileSync(join(control, 'task.md'), '# Control\nA well-formed scenario.\n');

  const probeDirs = walk(tmp).filter((d) => existsSync(join(d, 'criteria.json')));
  const caught = probeDirs.filter((d) => !existsSync(join(d, 'task.md')));
  h.check('AC-6a the stripped scenario is caught, the intact one is not', caught.length === 1 && caught[0] === probe,
    `caught ${caught.length}: ${caught.map((d) => relative(tmp, d)).join(', ')}`);

  if (bin) {
    const r = spawnSync(bin.cmd, [...bin.prefix, 'eval', 'lint', probe], { encoding: 'utf8' });
    const m = /(\d+)\s+scenarios?\s+valid/.exec(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    h.check('AC-6b tessl eval lint reports the stripped scenario as 0-valid, exit 0 (the fail-open this suite exists for)',
      (r.status ?? 1) === 0 && m?.[1] === '0',
      `exit=${r.status} out=${(r.stdout ?? '').trim().replace(/\n/g, ' | ')}`);
  } else {
    process.stdout.write('  note: tessl CLI not found — AC-6b (fail-open reproduction) not evaluated.\n');
  }
}

if (h.fail === 0) process.stdout.write('\neval-scenario suite: GREEN\n');
h.done();
