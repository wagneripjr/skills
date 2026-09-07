#!/usr/bin/env node
// FR-PROTO-1 acceptance matrix — structural criteria for skills/prototype-spike.
// Structural because the skill's real output is judged by tessl + the with/without benchmark;
// this harness locks the properties a future edit could silently break.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness } from './lib/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'plugins', 'prototype-spike', 'skills', 'prototype-spike');
const SKILL_MD = join(SKILL, 'SKILL.md');

const h = new Harness('FR-PROTO-1 acceptance matrix');
const nonEmpty = (p) => { try { return statSync(p).size > 0; } catch { return false; } };
const skillText = existsSync(SKILL_MD) ? readFileSync(SKILL_MD, 'utf8') : '';

h.section('AC-1  skill layout + bare-slash slot');
h.check('SKILL.md exists', existsSync(SKILL_MD));
h.check('frontmatter name matches folder', /^name: prototype-spike$/m.test(skillText));
h.check('no same-name command file (keeps the bare /prototype-spike slot)',
  !existsSync(join(ROOT, 'commands', 'prototype-spike.md')));

h.section('AC-2  description contract');
const descLine = skillText.split('\n').find((l) => l.startsWith('description: '));
const desc = descLine ? descLine.slice('description: '.length) : '';
h.check(`description ${desc.length} chars (<= 1024)`, desc.length > 0 && desc.length <= 1024,
  `description length ${desc.length} outside 1..1024`);
h.check('description is double-quoted (tessl YAML strictness)', desc.startsWith('"') && desc.endsWith('"'));
// Referents are capabilities, not plugin-namespaced skill names: this repo ships neither a
// generative-design skill nor the SDLC plugin, so naming them would be a dangling reference.
for (const clause of ['generative-design skill', 'spec-playback step', 'NOT an ADR writer']) {
  h.check(`NOT-clause names '${clause}'`, skillText.includes(clause));
}
h.check('clickable trigger phrase present', skillText.includes('clickable prototype of FR-NNN'));

h.section('AC-3  three fidelity axes');
for (const axis of ['**UI**', '**Token**', '**Data**']) {
  h.check(`axis ${axis} in the ladder table`, skillText.includes(axis));
}
h.check('data ladder has no rung below a labeled stub', /no rung below a labeled stub/i.test(skillText));

h.section('AC-4  six gated phases, in order');
const phases = [...skillText.matchAll(/^### \d\. ([A-Z]+)/gm)].map((m) => m[1]);
const expect = ['ANCHOR', 'HARVEST', 'FRAME', 'BUILD', 'DRIVE', 'CLOSE'];
h.check('ANCHOR phase present', /^### 0\. ANCHOR/m.test(skillText));
h.check(`phases 0-5 in order: ${expect.join(' ')}`, phases.join(' ') === expect.join(' '),
  `phase order was '${phases.join(' ')}'`);
for (const g of ['G0', 'G1', 'G2', 'G3', 'G4', 'G5']) {
  h.check(`gate ${g} declared`, skillText.includes(`${g}:`));
}

h.section('AC-5  spike report is opened at ANCHOR, not composed at the end');
h.check('declared as opened at ANCHOR', skillText.includes('opened at ANCHOR'));
const anchorBlock = skillText.split(/^### 0\. ANCHOR/m)[1]?.split(/^### 1\./m)[0] ?? '';
h.check('ANCHOR instructs opening it', /Open .spike-report\.md. now/.test(anchorBlock));
h.check('named as a file among deliverables', skillText.includes('`spike-report.md`'));

h.section('AC-6  reference bundle');
const refsDir = join(SKILL, 'references');
for (const r of ['anatomy', 'ui-fidelity', 'harvest-playbook', 'control-derivation', 'fidelity-tiers', 'verification', 'exemplar-visit-report']) {
  h.check(`references/${r}.md exists`, nonEmpty(join(refsDir, `${r}.md`)));
}
// index.md is generated navigation (FR-OKF-3), not a reference file — it is not authored here
// and counting it would make every regeneration look like a bundle change.
const refCount = existsSync(refsDir)
  ? readdirSync(refsDir).filter((f) => f.endsWith('.md') && f !== 'index.md').length : 0;
h.check('exactly 7 reference files', refCount === 7, `found ${refCount} reference files, expected 7`);
const refLinks = (skillText.match(/references\/[a-z-]*\.md/g) ?? []).length;
h.check('SKILL.md points at every reference', refLinks >= 7, `found ${refLinks} reference links`);

h.section('AC-7  publication safety scan');
const denylistPath = process.env.SKILLS_DENYLIST ?? '';
if (!nonEmpty(denylistPath)) {
  // Opt-in input, kept outside the repo: a guard states what is allowed, never what it rejects,
  // so the token list must never live in the tree it scans. Absent SKILLS_DENYLIST, SKIP — never
  // fail. A public suite that is red on a fresh clone trains contributors to ignore red.
  process.stdout.write('  SKIP  SKILLS_DENYLIST not set — opt-in scan, point it at a token list to run it\n');
} else {
  const tokens = readFileSync(denylistPath, 'utf8').split('\n')
    .map((t) => t.trim()).filter((t) => t !== '' && !t.startsWith('#'));
  let hits = 0;
  for (const tok of tokens) {
    const n = walk(SKILL).reduce((acc, f) => {
      const lines = readFileSync(f, 'utf8').toLowerCase().split('\n');
      return acc + lines.filter((l) => l.includes(tok.toLowerCase())).length;
    }, 0);
    if (n > 0) { hits += n; process.stdout.write(`      leak: [${tok}]\n`); }
  }
  h.check('zero denylisted terms in the bundle', hits === 0, `${hits} denylisted-term hits in the bundle`);
}

// Structural, never nominal. An earlier revision listed the literal client config keys it was
// guarding against, which made this harness the sole carrier of those identifiers in the tree —
// the same guard-is-the-bug defect test-fr-bundle-3's AC-2 already fixed. Match the CLASS:
// a credential-ish key assigned a literal value. A placeholder ($VAR, <..>, {..}) is not a leak.
const SEC_RE = /[A-Za-z0-9_-]*(passwd|password|secret|api[_-]?key|access[_-]?token|client[_-]?secret)[A-Za-z0-9_-]*[ \t]*[:=][ \t]*[^$<{\s]/i;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

// Both directions before trusting a verdict: the scan must flag a planted canary AND must not
// flag benign text. One control is not enough — a pattern matching everything and one matching
// nothing both look green from a single side.
const canaryFlagged = SEC_RE.test('api_key: AKIAEXAMPLENOTREAL');
const benignFlagged = SEC_RE.test('the api_key is configured in the environment');
if (!canaryFlagged) {
  h.bad('secret scan failed its own canary — the check is inert, treat as UNVERIFIED');
} else if (benignFlagged) {
  h.bad('secret scan flags benign prose — the pattern is too broad, treat as UNVERIFIED');
} else {
  const hits = [];
  for (const f of walk(SKILL)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (SEC_RE.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  if (hits.length === 0) h.ok('zero secret-shaped tokens (scan verified in both directions)');
  else h.bad(`${hits.length} secret-shaped token hits`, hits.join('\n        '));
}

// AC-8 used to assert a hand-rolled evals/evals.json inside the skill directory, counting its
// prose `assertions`. That file was deleted once real Tessl scenarios existed: it was judged by
// eye, produced no comparable number, and — unlike a scenario — contributed nothing to the eval
// coverage the registry scores. Three is not a round number: a skill with no coverage is shown at
// 80% of its review score, ramping to full weight at three or more scenarios, so the threshold is
// the thing worth pinning.
h.section('AC-8  the plugin carries real eval scenarios, at the coverage threshold');
const EVALS = join(ROOT, 'plugins', 'prototype-spike', 'evals');
const scenarioDirs = existsSync(EVALS)
  ? readdirSync(EVALS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => join(EVALS, e.name))
    .filter((d) => nonEmpty(join(d, 'task.md')) && nonEmpty(join(d, 'criteria.json')))
  : [];
h.check(`>= 3 complete scenarios at the plugin root (found ${scenarioDirs.length})`,
  scenarioDirs.length >= 3,
  'below three, the registry shows an adjusted score: 80% of the review score at zero evals');
h.check('the legacy in-skill evals.json is gone', !existsSync(join(SKILL, 'evals', 'evals.json')),
  'superseded by the scenarios above; two records of the same thing drift apart');
// A rubric with no discriminating weight measures nothing, so require real checklists rather than
// merely well-formed JSON. Shape itself is asserted by tests/test-eval-scenarios.mjs.
let thinnest = Infinity;
for (const d of scenarioDirs) {
  try {
    const c = JSON.parse(readFileSync(join(d, 'criteria.json'), 'utf8'));
    thinnest = Math.min(thinnest, (c.checklist || []).length);
  } catch { thinnest = 0; }
}
h.check(`every rubric carries >= 8 checklist items (thinnest has ${thinnest})`, thinnest >= 8,
  'a short rubric scores the obvious and leaves the discriminating behaviour unmeasured');

h.done();
