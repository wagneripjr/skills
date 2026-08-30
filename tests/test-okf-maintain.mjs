#!/usr/bin/env node
// test-okf-maintain.mjs — acceptance matrix for skills/okf-maintain/scripts/okf.mjs (FR-OKF-1)
//
// The conformance check is an ABSENCE check, the shape that reports CLEAN having read nothing.
// So the scan itself is the thing under test: every canary case is paired with a negative control
// proving the same assertion does NOT fire on benign input. A gate that only ever passes and a
// gate that only ever fails look identical from one side.
//
//   AC-1  check: conformant tree exits 0                       (negative control)
//   AC-2  check: missing frontmatter exits 1 and names it      (canary)
//   AC-3  check: empty type exits 1 and names it               (canary)
//   AC-4  check: reserved filenames are not concept violations
//   AC-5  check: non-root index.md with frontmatter exits 1
//   AC-6  check: zero concept documents exits 77, never 0      (the real fail-open)
//   AC-7  check: discriminating — removing the canary flips AC-2/AC-3 back to 0
//   AC-8  index: idempotent across two runs (byte-identical)
//   AC-9  index: --describe survives regeneration (round-trip store)
//   AC-10 index: grammar — sorted headings, sorted titles, one trailing newline
//   AC-11 index: only the bundle-root index carries okf_version frontmatter
//   AC-12 index: single described child is inherited, not reported as pending
//   AC-13 index: zero concept documents exits 77
//   AC-14 cli: usage errors exit 64; --version exits 0
//   AC-15 profile: a manifest declaring profile: is reported and indexed like any other
//              repo — the refusal it replaces was a guard no profile could satisfy (FR-OKF-3)
//   AC-16 wire: entry block added once and only once across repeated runs; pre-existing
//              content preserved; refuses before an index exists
//   AC-17 docs: the entry block shown in SKILL.md and adoption.md is byte-identical to the one
//              okf.mjs actually writes — three copies of a byte-level contract drift silently
//   AC-18 parse: the reader fails CLOSED on YAML it cannot parse (canary), and does not
//              false-positive on the nested maps, flow maps, flow lists and lists-of-maps
//              that real OKF frontmatter uses (negative control — the risk a strict reader adds)
//   AC-19 parse: YAML block scalars (> and |) carry their text into the index, never the bare
//              sigil (canary), while a plain single-line description is untouched (control)
//   AC-20 index: a description over DESC_MAX is DROPPED to a bare link and reported, never
//              truncated into a summary nobody wrote (canary); one at the cap survives (control)
//   AC-21 ignore: a directory line prunes the subtree — no index inside it, absent from parent
//   AC-22 ignore: a file line removes it from the index AND from check, which then exits 0
//   AC-23 ignore: negative control — the same tree without .okfignore still exits 1, so AC-22
//              cannot be satisfied by a checker that simply stopped looking
//   AC-24 ignore: .okfignore never appears as an index entry
//   AC-25 ignore: a line matching nothing is reported (unused-ignore), never silently inert —
//              a renamed folder otherwise re-enters the walk with no one told
//   AC-26 ignore: blank, whitespace-only and comment lines match NOTHING. A blank line that
//              matched everything is the grep -F -f failure mode, and it fails OPEN: the corpus
//              would vanish behind a green exit
//   AC-27 ignore: an .okfignore that swallows the corpus lands on 77, never a quiet 0
//   AC-28 ignore: index stays byte-idempotent with an .okfignore present
//   AC-29 listing: a document is listed because it exists — project-meta files and files
//              with no frontmatter get rows (FR-OKF-3), while the required-keys scope does
//              not move: a concept document with no type still fails check (canary)
//   AC-30 listing: title degrades frontmatter -> first body heading -> filename stem, and
//              a # inside a fenced block is a shell comment, not a heading
//
// The completeness half of FR-OKF-3 lives in test-okf-coverage.mjs, which needs a real git
// work tree and therefore owns its own 77.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, skip } from './lib/harness.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OKF = resolve(DIR, '..', 'skills', 'okf-maintain', 'scripts', 'okf.mjs');
const SKILLDIR = resolve(DIR, '..', 'skills', 'okf-maintain');

if (!existsSync(OKF)) skip(`okf.mjs not found at ${OKF}`);

const h = new Harness('okf.mjs — conformance check fails closed, index generation is stable');
const WORK = h.mkTemp('okf-test-');

// run(...args) -> { rc, out } with stdout+stderr merged; runErr() isolates stderr.
const run = (...args) => {
  const r = spawnSync(process.execPath, [OKF, ...args], { encoding: 'utf8' });
  return { rc: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, err: r.stderr ?? '' };
};
const eq = (name, actual, expected) =>
  h.check(name, actual === expected, `expected [${expected}] got [${actual}]`);
const has = (name, hay, needle) => h.check(name, hay.includes(needle), `got: ${hay.trim()}`);
const hasNot = (name, hay, needle) => h.check(name, !hay.includes(needle), `unexpectedly found: ${needle}`);
const read = (p) => readFileSync(p, 'utf8');
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
const countIndexes = (root) => {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.md') out.push(p);
    }
  })(root);
  return out.length;
};

const doc = (p, type, title, description) =>
  write(p, `---\ntype: ${type}\ntitle: ${title}\ndescription: ${description}\n---\n\nbody\n`);

function fixture(name) {
  const r = join(WORK, name);
  rmSync(r, { recursive: true, force: true });
  mkdirSync(r, { recursive: true });
  doc(join(r, 'docs/requirements/FR-001.md'), 'Requirement', 'Place an order', 'User submits a cart and receives an order ID.');
  doc(join(r, 'docs/requirements/FR-002.md'), 'Requirement', 'Cancel an order', 'User cancels an unshipped order.');
  doc(join(r, 'docs/adr/ADR-001.md'), 'ADR', 'JWT authentication', 'All endpoints authenticate via JWT bearer tokens.');
  doc(join(r, 'docs/oncall.md'), 'Playbook', 'Freshness alert', 'Steps to triage a freshness alert.');
  write(join(r, 'README.md'), 'not a concept\n');
  write(join(r, 'LICENSE.md'), 'MIT\n');
  return r;
}

let R, res;

// ---------- AC-1 negative control: a clean tree must come back clean ----------
R = fixture('clean');
res = run('check', R);
eq('AC-1 conformant tree exits 0', res.rc, 0);
has('AC-1 reports zero violations', res.out, '0 violation(s)');

// ---------- AC-2 canary: a document with no frontmatter ----------
R = fixture('nofm'); write(join(R, 'docs/orphan.md'), '# orphan\n\nno frontmatter here\n');
res = run('check', R);
eq('AC-2 missing frontmatter exits 1', res.rc, 1);
has('AC-2 names the offending file', res.out, 'docs/orphan.md');

// ---------- AC-3 canary: type present but empty ----------
R = fixture('emptytype'); write(join(R, 'docs/hollow.md'), '---\ntype:\ntitle: Hollow\n---\n\nbody\n');
res = run('check', R);
eq('AC-3 empty type exits 1', res.rc, 1);
h.check('AC-3 names the file and the key',
  res.out.includes('docs/hollow.md') && res.out.includes('type'), `got: ${res.out.trim()}`);

// ---------- AC-4 reserved filenames are not concepts ----------
R = fixture('reserved');
write(join(R, 'docs/log.md'), '# Directory Update Log\n\n## 2026-05-22\n* **Update**: something\n');
write(join(R, 'docs/requirements/index.md'), '# Requirement\n\n* [x](FR-001.md)\n');
res = run('check', R);
eq('AC-4 log.md + frontmatter-free index.md keep exit 0', res.rc, 0);
has('AC-4 log.md surfaces as a note, not a violation', res.out, 'note: docs/log.md');

// ---------- AC-5 a non-root index.md must not carry frontmatter ----------
R = fixture('fmindex');
write(join(R, 'docs/requirements/index.md'), '---\nokf_version: "0.2"\n---\n\n# Requirement\n');
eq('AC-5 non-root index.md with frontmatter exits 1', run('check', R).rc, 1);

// ---------- AC-6 the real fail-open: nothing evaluated is not a pass ----------
R = join(WORK, 'barren'); mkdirSync(join(R, 'docs'), { recursive: true });
write(join(R, 'README.md'), 'readme\n');
res = run('check', R);
eq('AC-6 zero concept documents exits 77, not 0', res.rc, 77);
has('AC-6 says nothing was verified', res.out, 'nothing was verified');

// ---------- AC-7 discriminating: the canaries are what flipped the verdict ----------
R = fixture('discrim'); write(join(R, 'docs/orphan.md'), '# orphan\n\nno frontmatter\n');
const withCanary = run('check', R).rc;
rmSync(join(R, 'docs/orphan.md'), { force: true });
const withoutCanary = run('check', R).rc;
h.check('AC-7 verdict tracks the canary (1 with, 0 without)',
  withCanary === 1 && withoutCanary === 0, `got ${withCanary} then ${withoutCanary}`);

// ---------- AC-8 index is idempotent ----------
R = fixture('idem');
const triple = (r) => read(join(r, 'index.md')) + read(join(r, 'docs/index.md')) + read(join(r, 'docs/requirements/index.md'));
run('index', R); const first8 = triple(R);
run('index', R); const second8 = triple(R);
h.check('AC-8 two runs are byte-identical', first8 === second8);

// ---------- AC-9 --describe round-trips through the generated index ----------
R = fixture('roundtrip');
run('index', R);
run('index', R, '--describe', `${join(R, 'docs/requirements')}=Functional and non-functional requirements.`);
h.check('AC-9 --describe lands in the parent index',
  read(join(R, 'docs/index.md')).includes('Functional and non-functional requirements.'));
run('index', R);
h.check('AC-9 description survives a plain regeneration',
  read(join(R, 'docs/index.md')).includes('Functional and non-functional requirements.'));
hasNot('AC-9 described dir no longer pending', run('index', R).err, 'needs-description: docs/requirements');

// ---------- AC-10 grammar ----------
R = fixture('grammar');
run('index', R);
let idx = read(join(R, 'docs/requirements/index.md'));
eq('AC-10 one type heading for one type', idx.split('\n').filter((l) => l.startsWith('# ')).length, 1);
h.check('AC-10 entries sorted by title',
  idx.indexOf('* [Cancel an order]') < idx.indexOf('* [Place an order]'));
h.check('AC-10 exactly one trailing newline', idx.endsWith('\n') && !idx.endsWith('\n\n'));
h.check('AC-10 subdirectories collected under one heading',
  /^# Subdirectories$/m.test(read(join(R, 'docs/index.md'))));
h.check('AC-10 subdirectory links to its index',
  read(join(R, 'docs/index.md')).includes('](requirements/index.md)'));

// ---------- AC-11 okf_version only at the bundle root ----------
h.check('AC-11 root index carries frontmatter', read(join(R, 'index.md')).split('\n')[0] === '---');
h.check('AC-11 root declares okf_version 0.2', read(join(R, 'index.md')).includes('okf_version: "0.2"'));
h.check('AC-11 child index has no frontmatter', read(join(R, 'docs/index.md')).split('\n')[0] !== '---');
eq('AC-11 a freshly generated tree passes its own check', run('check', R).rc, 0);

// ---------- AC-12 single described child is inherited ----------
R = join(WORK, 'solo');
doc(join(R, 'docs/only/SOLO.md'), 'Reference', 'Solo', 'The only document in its folder.');
res = run('index', R);
h.check('AC-12 single child description inherited by parent',
  read(join(R, 'docs/index.md')).includes('The only document in its folder.'));
hasNot('AC-12 inherited dir not reported pending', res.err, 'needs-description: docs/only');

// ---------- AC-13 index over an empty tree ----------
R = join(WORK, 'empty-index'); mkdirSync(join(R, 'docs'), { recursive: true });
eq('AC-13 index with no concept documents exits 77', run('index', R).rc, 77);

// ---------- AC-14 cli surface ----------
eq('AC-14 no command exits 64', run().rc, 64);
eq('AC-14 unknown command exits 64', run('bogus', WORK).rc, 64);
eq('AC-14 check rejects options exits 64', run('check', WORK, '--stdout').rc, 64);
eq('AC-14 missing directory exits 64', run('index', join(WORK, 'nope')).rc, 64);
eq('AC-14 malformed --describe exits 64', run('index', WORK, '--describe', 'bad').rc, 64);
eq('AC-14 --version exits 0', run('--version').rc, 0);

// ---------- AC-15 a declared profile is reported, never a refusal ----------
// The refusal it replaces was justified by a generator the profile would ship and a
// commit gate that would reject v0.2 bytes. Neither was ever verified, and a guard no
// profile can satisfy is not a guard — it left exactly the repositories that declare a
// profile with no index at all. The key still names an enforcement dialect, so it is
// still reported; it just stops deciding what gets enumerated.
R = fixture('profiled');
write(join(R, 'docs/okf.yaml'), 'profile: example-profile/v1\nokf_version: "0.1"\n');
res = run('index', R);
eq('AC-15 index proceeds on a profiled repo', res.rc, 0);
has('AC-15 the profile is still named', res.err, 'declares profile example-profile/v1');
h.check(`AC-15 and it actually wrote indexes (${countIndexes(R)})`, countIndexes(R) > 0);
eq('AC-15 check proceeds on a profiled repo', run('check', R).rc, 0);

R = fixture('unprofiled');
write(join(R, 'docs/okf.yaml'), 'okf_version: "0.2"\nindex_filename: index.md\n');
res = run('index', R);
eq('AC-15 control: an unprofiled repo behaves identically', res.rc, 0);
hasNot('AC-15 control: nothing is said about a profile', res.err, 'declares profile');

// ---------- AC-16 entry wiring is idempotent ----------
R = fixture('wiring');
write(join(R, 'CLAUDE.md'), '# Project\n\nExisting guidance.\n');
write(join(R, 'GEMINI.md'), '@CLAUDE.md\n');
eq('AC-16 wire refuses before an index exists', run('wire', R).rc, 1);
run('index', R);
eq('AC-16 wire exits 0 once an index exists', run('wire', R).rc, 0);
run('wire', R);
run('wire', R);
const countOf = (s, needle) => s.split(needle).length - 1;
for (const f of ['CLAUDE.md', 'AGENTS.md']) {
  const body = read(join(R, f));
  const o = countOf(body, '<!-- okf:entry -->');
  const c = countOf(body, '<!-- /okf:entry -->');
  h.check(`AC-16 ${f} holds exactly one entry block after three runs`, o === 1 && c === 1,
    `open=${o} close=${c}`);
}
eq('AC-16 GEMINI.md gains one @index.md import', countOf(read(join(R, 'GEMINI.md')), '@index.md'), 1);
h.check('AC-16 pre-existing CLAUDE.md content preserved', read(join(R, 'CLAUDE.md')).includes('Existing guidance.'));
h.check('AC-16 pre-existing GEMINI.md import preserved', read(join(R, 'GEMINI.md')).includes('@CLAUDE.md'));

// ---------- AC-17 the documented entry block matches the one the script writes ----------
R = fixture('blockdoc');
run('index', R);
run('wire', R);
{
  const pat = /<!-- okf:entry -->[\s\S]*?<!-- \/okf:entry -->/;
  const want = pat.exec(read(join(R, 'AGENTS.md')))?.[0]?.trim();
  const docs = [join(SKILLDIR, 'SKILL.md'), join(SKILLDIR, 'references', 'adoption.md')];
  const bad = want ? docs.filter((d) => pat.exec(read(d))?.[0]?.trim() !== want) : docs;
  h.check('AC-17 SKILL.md and adoption.md show the block okf.mjs actually writes', bad.length === 0,
    bad.join(', '));
}

// ---------- AC-18 the frontmatter reader fails closed, without false positives ----------
R = join(WORK, 'parsing'); mkdirSync(join(R, 'docs'), { recursive: true });
write(join(R, 'docs/flowseq.md'), '---\ntype: Requirement\ntitle: [unclosed\n---\n\nbody\n');
write(join(R, 'docs/quote.md'), '---\ntype: Requirement\ntitle: "unterminated\n---\n\nbody\n');
write(join(R, 'docs/flowmap.md'), '---\ntype: Requirement\ngenerated: { by: x, at: y\n---\n\nbody\n');
write(join(R, 'docs/dup.md'), '---\ntype: Requirement\ntitle: a\ntitle: b\n---\n\nbody\n');
res = run('check', R);
eq('AC-18 malformed frontmatter exits 1', res.rc, 1);
for (const f of ['flowseq', 'quote', 'flowmap', 'dup']) {
  has(`AC-18 names docs/${f}.md`, res.out, `docs/${f}.md`);
}

// negative control — every optional OKF v0.2 family must parse clean
R = join(WORK, 'valid-families'); mkdirSync(join(R, 'docs'), { recursive: true });
write(join(R, 'docs/every-family.md'), [
  '---',
  'type: Attested Computation',
  'title: "Revenue: fiscal year"',
  'description: Recognized revenue for a fiscal year.',
  'tags: [finance, revenue]',
  'status: stable',
  'stale_after: 2026-12-31T00:00:00Z',
  'generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }',
  'verified:',
  '  - { by: human:jdoe, at: 2026-06-25T09:00:00Z }',
  '  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }',
  'parameters:',
  '  - { name: year, type: integer, required: true }',
  'executor:',
  '  resource: references/skills/run-on-bq.md',
  '  receipt: [job_id, executed_sql]',
  'sources:',
  '  - id: rev-policy',
  '    resource: https://wiki.example/policy',
  '    usage_count: 5000',
  'usage_window: { from: 2026-06-01T00:00:00Z, to: 2026-06-30T00:00:00Z }',
  '---',
  '',
  'body',
  '',
].join('\n'));
res = run('check', R);
h.check('AC-18 every optional v0.2 family parses clean (no false positive)', res.rc === 0,
  `rc=${res.rc}: ${res.out.trim()}`);

// ---------- AC-19 block scalars carry their text, not the sigil ----------
// A hand-rolled reader's risk is not the syntax it rejects; it is the syntax it accepts and
// misreads. "description: >" parsed to the string ">" and rendered "- >" into the index, while
// check still called the document conformant.
R = join(WORK, 'blockscalar'); mkdirSync(join(R, 'docs'), { recursive: true });
write(join(R, 'docs/folded.md'), '---\ntype: Requirement\ntitle: Folded\ndescription: >\n  Folded across\n  two lines.\n---\n\nbody\n');
write(join(R, 'docs/literal.md'), '---\ntype: Requirement\ntitle: Literal\ndescription: |\n  Literal block scalar.\n---\n\nbody\n');
write(join(R, 'docs/plain.md'), '---\ntype: Requirement\ntitle: Plain\ndescription: A plain single-line description.\n---\n\nbody\n');
write(join(R, 'docs/blocktype.md'), '---\ntype: >\n  Playbook\ntitle: Typed by block scalar\ndescription: Grouped by a folded type.\n---\n\nbody\n');
run('index', R);
idx = read(join(R, 'docs/index.md'));
h.check('AC-19 folded scalar renders its folded text',
  /^\* \[Folded\]\(folded\.md\) - Folded across two lines\.$/m.test(idx));
h.check('AC-19 literal scalar renders its text',
  /^\* \[Literal\]\(literal\.md\) - Literal block scalar\.$/m.test(idx));
h.check('AC-19 no entry ends in a bare sigil', !/ - [|>]$/m.test(idx));
h.check('AC-19 a block-scalar type is not a bare-sigil heading', !/^# [|>]$/m.test(idx));
h.check('AC-19 block-scalar type groups under its real heading', /^# Playbook$/m.test(idx));
// negative control — the ordinary single-line form must render exactly as before
h.check('AC-19 control: a plain description is unchanged',
  /^\* \[Plain\]\(plain\.md\) - A plain single-line description\.$/m.test(idx));

// ---------- AC-20 an over-long description is dropped, never truncated ----------
// Truncating would put a half-sentence nobody wrote into the field consumers trust most, which is
// the "inventing a description" anti-pattern arriving by another route. An absent description is
// already a visible gap; an unusable one becomes the same gap, and is reported for repair.
R = join(WORK, 'longdesc'); mkdirSync(join(R, 'docs'), { recursive: true });
const LONG = 'word '.repeat(60).trim();
const ATCAP = 'a'.repeat(159);
write(join(R, 'docs/overlong.md'), `---\ntype: Requirement\ntitle: Overlong\ndescription: ${LONG}\n---\n\nbody\n`);
write(join(R, 'docs/atcap.md'), `---\ntype: Requirement\ntitle: Atcap\ndescription: ${ATCAP}\n---\n\nbody\n`);
res = run('index', R);
idx = read(join(R, 'docs/index.md'));
h.check('AC-20 over-cap description drops to a bare link', /^\* \[Overlong\]\(overlong\.md\)$/m.test(idx));
h.check('AC-20 no dangling separator or trailing space', !/^\* \[Overlong\]\(overlong\.md\)[ -]/m.test(idx));
has('AC-20 names the file it dropped', res.err, 'long-description: docs/overlong.md');
has('AC-20 check reports it as a note', run('check', R).out, 'note: docs/overlong.md');
eq('AC-20 an over-long description is never a conformance violation', run('check', R).rc, 0);
// negative control — a description at the cap must survive verbatim
h.check('AC-20 control: a 159-char description survives verbatim',
  idx.includes(`* [Atcap](atcap.md) - ${ATCAP}`));
run('index', R); const first20 = read(join(R, 'docs/index.md'));
run('index', R); const second20 = read(join(R, 'docs/index.md'));
h.check('AC-20 gated output is still idempotent', first20 === second20);

// ---------- AC-21..AC-28 .okfignore — the ownership boundary ----------
// A bundle root in a real repo contains folders another tool owns (delivery logs, generated
// projections). Before .okfignore the only remedy the docs offered was "keep them outside the
// bundle root", which expires the moment that tool writes inside docs/. Exclusion is the one
// feature here that can fail SILENTLY and green, so every line below is paired with a control.
function owned(name) {
  const r = fixture(name);
  write(join(r, 'docs/plans/plan-1.md'), '# delivery log\n');
  write(join(r, 'docs/plans/plan-2.md'), '# delivery log\n');
  write(join(r, 'docs/evals/e1.md'), '# eval\n');
  write(join(r, 'docs/TRACEABILITY.md'), '# Traceability\n\n| FR | spec |\n');
  return r;
}
const ignorefile = (r) =>
  write(join(r, '.okfignore'), '# not knowledge\ndocs/plans/\ndocs/evals/\n\n# owned by another generator\ndocs/TRACEABILITY.md\n');

// ---------- AC-23 control FIRST: the tree must genuinely fail before it is made to pass ----------
R = owned('unowned_raw');
eq('AC-23 control: unowned files DO fail check before .okfignore exists', run('check', R).rc, 1);

// ---------- AC-21 / AC-22 / AC-24 the boundary holds ----------
R = owned('unowned'); ignorefile(R);
res = run('check', R);
eq('AC-22 check exits 0 once unowned paths are declared', res.rc, 0);
// must not appear as a VIOLATION line; it legitimately appears in the ignored: report
h.check('AC-22 the generator-owned file is no longer a violation',
  !/^docs\/TRACEABILITY\.md:/m.test(res.out));
h.check('AC-22 control: it is still reported as skipped, not silently dropped',
  /^ignored: docs\/TRACEABILITY\.md /m.test(res.out));
has('AC-22 every skip is reported with its source line', res.out, 'ignored: docs/plans/ (.okfignore:2)');

run('index', R);
h.check('AC-21 no index is written inside an ignored directory', !existsSync(join(R, 'docs/plans/index.md')));
h.check('AC-21 an ignored directory is absent from its parent index', !read(join(R, 'docs/index.md')).includes('plans'));
h.check('AC-22 an ignored file is absent from the index', !read(join(R, 'docs/index.md')).includes('TRACEABILITY'));
h.check('AC-24 .okfignore never appears as an index entry',
  !read(join(R, 'docs/index.md')).includes('okfignore') && !read(join(R, 'index.md')).includes('okfignore'));
// control: the documents the skill DOES own are still there
h.check('AC-21 control: owned documents are still indexed normally',
  /^\* \[Place an order\]\(FR-001\.md\)/m.test(read(join(R, 'docs/requirements/index.md'))));

// ---------- AC-25 a line that matches nothing must say so ----------
renameSync(join(R, 'docs/evals'), join(R, 'evals-gone'));
res = run('check', R);
has('AC-25 a stale ignore line is named', res.err, 'unused-ignore: docs/evals/ (.okfignore:3)');
hasNot('AC-25 control: a line still matching is NOT called unused', res.err, 'unused-ignore: docs/plans/');

// ---------- AC-26 CANARY: a blank line must match nothing, not everything ----------
// The grep -F -f failure mode: one empty pattern silently matches every line, the scan reports
// clean having excluded the whole corpus, and the green exit is indistinguishable from a real pass.
R = owned('blanks');
write(join(R, '.okfignore'), '\n   \n\t\n# just a comment\n\n');
res = run('index', R);
const ignoreLines = res.err.split('\n').filter((l) => /^(ignored|unused-ignore):/.test(l)).length;
eq('AC-26 blank/whitespace/comment lines match nothing at all', ignoreLines, 0);
eq('AC-26 a blank-only .okfignore behaves exactly like no .okfignore (still 1)', run('check', R).rc, 1);

// ---------- AC-27 CANARY: an over-broad line must not buy a quiet green ----------
R = owned('swallow'); write(join(R, '.okfignore'), 'docs/\n');
res = run('check', R);
eq('AC-27 ignoring the whole corpus exits 77, never 0', res.rc, 77);
has('AC-27 the line responsible is named', res.out, 'ignored: docs/ (.okfignore:1)');
res = run('index', R);
has('AC-27 index names the responsible line too', res.err, 'ignored: docs/ (.okfignore:1)');
h.check('AC-27 nothing is written inside the swallowed subtree',
  !existsSync(join(R, 'docs/index.md')));
R = fixture('swallow_all'); write(join(R, '.okfignore'), 'docs/\nREADME.md\nLICENSE.md\n');
eq('AC-27 an .okfignore that leaves nothing at all still exits 77', run('index', R).rc, 77);
eq('AC-27 and writes no index files', countIndexes(R), 0);

// ---------- AC-28 idempotency survives the new code path ----------
R = owned('idem2'); ignorefile(R);
run('index', R); const first28 = read(join(R, 'docs/index.md'));
run('index', R); const second28 = read(join(R, 'docs/index.md'));
h.check('AC-28 index stays byte-idempotent with .okfignore present', first28 === second28);

// ---------- AC-29 a document is listed because it exists ----------
// The old rule listed only "concept" documents, so a reader looking for the readme, the
// contributing guide or a plan found an index that confidently did not mention it. Being
// listed has to stay free of any obligation, or the rule collapses back into a registry.
R = fixture('listing');
write(join(R, 'docs/CONTRIBUTING.md'), 'how to contribute, no frontmatter at all\n');
run('index', R);
const rootIdx = read(join(R, 'index.md'));
h.check('AC-29 a project-meta file is listed', /^\* \[README\]\(README\.md\)$/m.test(rootIdx));
h.check('AC-29 a file with no frontmatter is listed',
  read(join(R, 'docs/index.md')).includes('](CONTRIBUTING.md)'));
eq('AC-29 control: listing imposes no frontmatter requirement — check still exits 0',
  run('check', R).rc, 0);
h.check('AC-29 control: an index is still never listed as an entry',
  !rootIdx.includes('](index.md)'));
// Enforcement scope does not move with the listing rule: a document that is a concept
// still owes `type`, and being newly visible in the index changes nothing about that.
write(join(R, 'docs/plan.md'), 'a plan with no frontmatter at all\n');
run('index', R);
h.check('AC-29 the same run lists a concept document with no frontmatter',
  read(join(R, 'docs/index.md')).includes('](plan.md)'));
eq('AC-29 canary: and check still fails it for the missing type', run('check', R).rc, 1);

// ---------- AC-30 the title degrades: frontmatter, then heading, then filename ----------
R = fixture('titles');
write(join(R, 'docs/from-heading.md'), '# Heading Wins\n\nbody\n');
write(join(R, 'docs/from-filename.md'), 'no heading, no frontmatter\n');
write(join(R, 'docs/fenced.md'), '```sh\n# not a heading\n```\n\n# Real Heading\n');
write(join(R, 'docs/typed-no-title.md'), '---\ntype: Playbook\n---\n\n# Body Heading\n');
run('index', R);
const titles = read(join(R, 'docs/index.md'));
h.check('AC-30 the first body heading is used when frontmatter has no title',
  titles.includes('* [Heading Wins](from-heading.md)'));
h.check('AC-30 the filename stem is the last resort',
  titles.includes('* [from-filename](from-filename.md)'));
h.check('AC-30 a # inside a fenced block is not mistaken for a heading',
  titles.includes('* [Real Heading](fenced.md)'));
h.check('AC-30 the heading fallback applies under a real type heading too',
  /# Playbook\n[\s\S]*\* \[Body Heading\]\(typed-no-title\.md\)/.test(titles));
// A bracketed title is ordinary in a template ("Gap analysis: [Feature Name]") and, left raw,
// produces a row every consumer here silently fails to parse — the round-trip description store
// drops it and coverage reports the document as indexed by nobody.
write(join(R, 'docs/bracketed.md'), '# Gap analysis: [Feature Name]\n');
run('index', R);
has('AC-30 a bracketed title is escaped, not emitted raw',
  read(join(R, 'docs/index.md')), '* [Gap analysis: \\[Feature Name\\]](bracketed.md)');
const bracket1 = read(join(R, 'index.md'));
run('index', R);
h.check('AC-30 control: an escaped row is read back unchanged, so regeneration stays idempotent',
  read(join(R, 'index.md')) === bracket1);

h.done();
