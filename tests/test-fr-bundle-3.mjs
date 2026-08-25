#!/usr/bin/env node
// test-fr-bundle-3.mjs — structural tree check: each plugin holds exactly the skill dirs it is
// supposed to, nothing unexpected has appeared under skills/, and no retained SKILL.md carries a
// dangling wagner-skills:<name> reference to a skill this repo no longer ships.
//   AC-1 core removed     — the 7 core skill dirs are absent from skills/
//   AC-2 tree shape       — all 14 doc-this* present; no unexpected dirs under skills/
//   AC-3 no dangling ref  — zero wagner-skills:<removed> refs in any retained SKILL.md
//   AC-4 discriminating   — re-adding a removed core dir flips AC-1 non-zero (the check inspects the tree)
// AC-2 asserts an ALLOWLIST of the expected skills rather than matching a rejected prefix, so
// this harness never becomes the leak it is meant to guard against. An earlier revision used a
// prefix glob, which put the very identifier being guarded against into a tracked file; the
// allowlist names nothing and is strictly stronger, catching any unexpected dir rather than one
// prefix.

import { existsSync, readdirSync, readFileSync, mkdirSync, rmdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness } from './lib/harness.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(DIR, '..');
const SK = join(SKILLS_ROOT, 'skills');
// doc-this* lives under the standalone doc-this plugin root (FR-DOC-PLUGIN-1), not skills/.
const DT = join(SKILLS_ROOT, 'doc-this', 'skills');

// Skill dirs that must NOT exist here. AC-1 asserts the count is 0 — this is a guard
// against them reappearing, not a manifest of anything this marketplace ships.
const CORE_7 = ['atdd', 'ddd', 'test-driven-development', 'exploratory-qa', 'qa-reconcile', 'playwright', 'self-improving-agent'];
const DOC_THIS_14 = ['doc-this', 'doc-this-scout', 'doc-this-code-analyst', 'doc-this-detective', 'doc-this-architect', 'doc-this-writer', 'doc-this-reviewer', 'doc-this-promote', 'doc-this-viewer', 'doc-this-visor', 'doc-this-tracer', 'doc-this-help', 'doc-this-design-system', 'doc-this-data-master'];
// Allowlist, not a denylist: naming a rejected prefix here would put the very identifier
// we are guarding against into a tracked file. An allowlist is also strictly stronger --
// it catches ANY unexpected skill dir, not just one prefix.
const PUBLIC_8 = ['agent-cli', 'airflow-dags', 'human-cli', 'okf-maintain', 'platform-sre-kubernetes', 'postmortem', 'prototype-spike', 'requirements-elicitation'];

const h = new Harness('tree shape intact, expected skill dirs only, no dangling refs');

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// AC-1 probe — how many of the 7 core dirs are present (0 == fully removed)
const corePresent = () => CORE_7.filter((s) => isDir(join(SK, s))).length;

// AC-1 (core removed)
const n1 = corePresent();
h.check(n1 === 0 ? 'AC-1 the 7 core SDLC skill dirs are absent from skills/' : `AC-1 ${n1} of the 7 core dirs still present`, n1 === 0);

// AC-2 (tree shape) — the 14 doc-this* are present and skills/ holds exactly the expected 8.
let a2 = true;
for (const s of DOC_THIS_14) {
  if (!isDir(join(DT, s))) { process.stdout.write(`    missing retained skill: doc-this/skills/${s}\n`); a2 = false; }
}
for (const b of readdirSync(SK).filter((n) => isDir(join(SK, n)))) {
  if (!PUBLIC_8.includes(b)) { process.stdout.write(`    unexpected skill dir: skills/${b} (not in the expected 8)\n`); a2 = false; }
}
const nd = readdirSync(DT).filter((n) => n.startsWith('doc-this') && isDir(join(DT, n))).length;
if (nd !== 14) { process.stdout.write(`    doc-this* dir count is ${nd} (want 14)\n`); a2 = false; }
h.check('AC-2 the 14 doc-this* present, skills/ holds exactly the expected 8', a2);

// AC-3 (no dangling ref) — zero wagner-skills:<removed> refs in any retained SKILL.md
const DANGLE_RE = new RegExp(`wagner-skills:(${CORE_7.join('|')})`);
const dangling = [];
for (const b of readdirSync(SK).filter((n) => isDir(join(SK, n)))) {
  const p = join(SK, b, 'SKILL.md');
  if (!existsSync(p)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (DANGLE_RE.test(line)) dangling.push(`${p}:${i + 1}: ${line.trim()}`);
  });
}
h.check('AC-3 no dangling wagner-skills:<removed> ref in retained SKILL.md', dangling.length === 0,
  dangling.slice(0, 10).join('\n        '));

// AC-4 (discriminating) — re-adding a removed core dir must flip AC-1 non-zero, then clean up
const TMP = join(SK, 'atdd');
if (existsSync(TMP)) {
  h.bad(`AC-4 cannot run — ${TMP} unexpectedly exists`);
} else {
  let n4 = 0;
  try {
    mkdirSync(TMP, { recursive: true });
    n4 = corePresent();
  } finally {
    try { rmdirSync(TMP); } catch { /* best effort */ }
  }
  h.check('AC-4 re-adding a removed dir flips AC-1 non-zero (discriminating)', n4 !== 0,
    're-adding atdd did NOT flip AC-1 — check is not discriminating');
}

if (h.fail === 0) process.stdout.write('\nbundle-3 tree/closure suite: 4/4 GREEN\n');
h.done();
