#!/usr/bin/env node
// test-fr-bundle-3.mjs — structural tree check: each plugin holds exactly the skill dirs it is
// supposed to, nothing unexpected has appeared under skills/, and no retained SKILL.md carries a
// dangling <plugin>:<name> reference to a skill this repo no longer ships.
//   AC-1 core removed     — the 7 core skill dirs are absent from plugins/
//   AC-2 tree shape       — all 14 doc-this* present; plugins/ holds exactly the expected 9
//   AC-3 no dangling ref  — zero <plugin>:<removed> refs in any retained SKILL.md
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
// Every plugin is a root under plugins/, the layout Tessl documents for a repository holding
// more than one. A solo plugin's single skill sits at plugins/<name>/skills/<name>/SKILL.md;
// doc-this keeps 14 under its own root because they share a hook set.
const PL = join(SKILLS_ROOT, 'plugins');
const DT = join(PL, 'doc-this', 'skills');

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

// AC-1 probe — how many of the 7 core dirs are present as plugin roots (0 == fully removed)
const corePresent = () => CORE_7.filter((s) => isDir(join(PL, s))).length;

// AC-1 (core removed)
const n1 = corePresent();
h.check(n1 === 0 ? 'AC-1 the 7 core SDLC skill dirs are absent from plugins/' : `AC-1 ${n1} of the 7 core dirs still present`, n1 === 0);

// AC-2 (tree shape) — the 14 doc-this* are present, plugins/ holds exactly the expected 9, and
// every solo plugin carries its skill at the convention path the Tessl manifest relies on.
let a2 = true;
for (const s of DOC_THIS_14) {
  if (!isDir(join(DT, s))) { process.stdout.write(`    missing retained skill: plugins/doc-this/skills/${s}\n`); a2 = false; }
}
for (const b of readdirSync(PL).filter((n) => isDir(join(PL, n)))) {
  if (b !== 'doc-this' && !PUBLIC_8.includes(b)) { process.stdout.write(`    unexpected plugin dir: plugins/${b} (not in the expected 9)\n`); a2 = false; }
}
for (const b of PUBLIC_8) {
  if (!existsSync(join(PL, b, 'skills', b, 'SKILL.md'))) { process.stdout.write(`    missing plugins/${b}/skills/${b}/SKILL.md\n`); a2 = false; }
}
const nd = readdirSync(DT).filter((n) => n.startsWith('doc-this') && isDir(join(DT, n))).length;
if (nd !== 14) { process.stdout.write(`    doc-this* dir count is ${nd} (want 14)\n`); a2 = false; }
h.check('AC-2 the 14 doc-this* present, plugins/ holds exactly the expected 9', a2);

// AC-3 (no dangling ref) — zero <plugin>:<removed> refs in any retained SKILL.md. The namespace
// prefix is the plugin name, which after the split is the skill's own name for a solo plugin.
const DANGLE_RE = new RegExp(`(wagner-skills|${CORE_7.join('|')}):(${CORE_7.join('|')})`);
const dangling = [];
const skillFiles = [
  ...PUBLIC_8.map((b) => join(PL, b, 'skills', b, 'SKILL.md')),
  ...DOC_THIS_14.map((s) => join(DT, s, 'SKILL.md')),
];
for (const p of skillFiles) {
  if (!existsSync(p)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (DANGLE_RE.test(line)) dangling.push(`${p}:${i + 1}: ${line.trim()}`);
  });
}
h.check('AC-3 no dangling wagner-skills:<removed> ref in retained SKILL.md', dangling.length === 0,
  dangling.slice(0, 10).join('\n        '));

// AC-4 (discriminating) — re-adding a removed core dir must flip AC-1 non-zero, then clean up
const TMP = join(PL, 'atdd');
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
