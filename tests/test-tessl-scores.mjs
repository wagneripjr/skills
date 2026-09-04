#!/usr/bin/env node
// test-tessl-scores.mjs — the committed score table, asserted with no account, no network and
// no credits (FR-TESSL-2).
//   AC-1 shape        — tests/tessl-scores.json parses and every row carries the five fields
//   AC-2 coverage     — every skill directory in the tree has a row, enumerated from the TREE
//   AC-3 no stale row — every row points at a skill that still exists
//   AC-4 no ids       — no run id or workspace id is committed to this public repository
//   AC-5 comparable   — every row names a rubric and a date, so two numbers can be compared
//   AC-6 discriminating — each checker flags a planted mutant, and clears the real file
//
// AC-2 is the point of the suite. The generator writes the file from the API, so regenerating
// and diffing it would be a projection checked against itself: a skill the API never returned
// is missing from both sides and compares equal. The enumerator here is FOREIGN — it walks the
// working tree for SKILL.md — which is the only way a never-reviewed skill can be reported.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness } from './lib/harness.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCORES = resolve(ROOT, 'tests', 'tessl-scores.json');
const SKILL_ROOTS = ['skills', 'doc-this/skills'];

// The foreign enumerator: what the TREE says exists, independent of what the API returned.
export function skillPaths(root = ROOT) {
  const found = [];
  for (const base of SKILL_ROOTS) {
    const dir = resolve(root, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const skill = join(base, entry.name, 'SKILL.md');
      if (existsSync(resolve(root, skill))) found.push(skill);
    }
  }
  return found;
}

export const uncovered = (rows, paths) => {
  const scored = new Set(rows.map((r) => r?.path));
  return paths.filter((p) => !scored.has(p));
};

export const stale = (rows, root = ROOT) => rows.filter((r) => !existsSync(resolve(root, String(r?.path))));

// A UUID in a published file is a run id or a workspace id. Neither belongs in a public repo.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const idsIn = (text) => [...String(text).matchAll(UUID)].map((m) => m[0]);

export function malformed(rows) {
  const bad = [];
  for (const r of rows) {
    const problems = [];
    if (typeof r?.skill !== 'string' || !r.skill) problems.push('skill');
    if (typeof r?.path !== 'string' || !r.path.endsWith('SKILL.md')) problems.push('path');
    if (typeof r?.rubric !== 'string' || !r.rubric || r.rubric === 'unknown') problems.push('rubric');
    if (typeof r?.score !== 'number' || !Number.isFinite(r.score) || r.score < 0 || r.score > 100) problems.push('score');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r?.date))) problems.push('date');
    if (problems.length) bad.push(`${r?.skill ?? r?.path ?? '?'}: ${problems.join(', ')}`);
  }
  return bad;
}

const h = new Harness('tessl score table — coverage, shape, and no committed ids');

// AC-1 shape
if (!existsSync(SCORES)) { h.bad('AC-1 tests/tessl-scores.json exists', 'run: node tests/tessl-scores.mjs'); h.done(); }
const raw = readFileSync(SCORES, 'utf8');
let doc;
try { doc = JSON.parse(raw); } catch (e) { h.bad('AC-1 tessl-scores.json parses', e.message); h.done(); }
const rows = Array.isArray(doc?.rows) ? doc.rows : [];
h.check('AC-1a rows is a non-empty array', rows.length > 0, `got ${rows.length}`);
h.equal('AC-1b the file names its generator', doc?.generator, 'tests/tessl-scores.mjs');

// AC-2 coverage, from the tree
const paths = skillPaths();
h.check('AC-2a the tree enumerator found skills', paths.length > 0, `found ${paths.length}`);
const missing = uncovered(rows, paths);
h.check(`AC-2b all ${paths.length} skills in the tree have a score row`, missing.length === 0, missing.join(', '));

// AC-3 no stale rows
const gone = stale(rows);
h.check('AC-3 no row points at a deleted skill', gone.length === 0, gone.map((r) => r.path).join(', '));

// AC-4 no run ids or workspace ids
const ids = idsIn(raw);
h.check('AC-4 no run id or workspace id is committed', ids.length === 0, ids.slice(0, 3).join(', '));

// AC-5 every row is comparable
const bad = malformed(rows);
h.check('AC-5 every row names a rubric, a date and a valid score', bad.length === 0, bad.slice(0, 5).join(' | '));

// AC-6 discriminating — a checker that clears everything is not a checker
h.section('AC-6 mutants (each must be flagged)');
h.check('AC-6a a skill with no row is reported', uncovered(rows, [...paths, 'skills/canary/SKILL.md']).length === 1);
h.check('AC-6b a row for a deleted skill is reported', stale([{ path: 'skills/no-such-skill/SKILL.md' }]).length === 1);
h.check('AC-6c a planted uuid is reported', idsIn('runId 01a06d2f-81c3-70cf-b176-4711110473ba').length === 1);
h.check('AC-6d an unnamed rubric is reported',
  malformed([{ skill: 'x', path: 'skills/x/SKILL.md', rubric: 'unknown', score: 90, date: '2026-09-04' }]).length === 1);
h.check('AC-6e a score of 0 is NOT reported as malformed',
  malformed([{ skill: 'x', path: 'skills/x/SKILL.md', rubric: 'r', score: 0, date: '2026-09-04' }]).length === 0);

h.done();
