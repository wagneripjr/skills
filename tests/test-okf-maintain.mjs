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
//   AC-39 boundary: the walk stops at another repository's work tree — a submodule (.git as a
//              FILE) or a nested clone (.git as a directory). Writing inside one edits a repo the
//              caller does not own, and coverage cannot catch it because git reports a submodule
//              as a single gitlink, so the refusal has to be structural
//   AC-40 ownership: an index.md carrying no generation marker is never overwritten. A dialect's
//              rows can hold an id, a status or a shape v0.2 does not project; regenerating over
//              it is a silent lossy downgrade of the catalog the index exists to be
//   AC-41 payload: at a Claude Code plugin root — a directory holding .claude-plugin/plugin.json
//              or marketplace.json — the commands/, agents/ and skills/ children are the loader's,
//              not OKF's. No index.md is written inside one (a document where payload is expected)
//              and no frontmatter is demanded of one (SKILL.md's schema belongs to the loader,
//              and a progressively-disclosed reference file would pay context for keys nobody
//              reads). The anchor is the manifest, never the directory name: removing the manifest
//              brings every finding straight back, and a docs/commands/ folder that documents a
//              CLI stays ordinary knowledge (FR-OKF-4)
//   AC-45 core: okf.mjs is importable — the tail no longer terminates the host process, and the
//              generator surface a client needs is exported. The guard IS the feature: a bare
//              process.exit(main(...)) runs the CLI the instant anything imports the file, which
//              is why the regeneration hook could not reuse the generator it is a client of
//              (FR-OKF-6 (i)). CANARY: importing must not exit, and the CLI must still behave
//   AC-46 contract: the frontmatter reader is pinned by a fixture corpus with a hand-written
//              expectation per file, PER CONSUMER — agentic-sdlc vendors the same files and its
//              lenient reader disagrees with this strict one on malformed input by design
//              (FR-OKF-6 (iii)). An expectation generated from the implementation would be the
//              projection-checked-against-itself fail-open all over again, so none of these were
//
// AC-31..38, the completeness half of FR-OKF-3, live in test-okf-coverage.mjs, which needs a
// real git work tree and therefore owns its own 77. Numbers do not repeat across the two files.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, skip } from './lib/harness.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OKF = resolve(DIR, '..', 'plugins', 'okf-maintain', 'skills', 'okf-maintain', 'scripts', 'okf.mjs');
const SKILLDIR = resolve(DIR, '..', 'plugins', 'okf-maintain', 'skills', 'okf-maintain');

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
// DESC_MAX is not exported, so the cap is restated here on purpose: a silent change to it
// must move a fixture, not pass unnoticed. Pitching both fixtures at the cap is the point —
// one comfortably past it, one exactly on it — because a canary that sits 200 chars below
// the boundary stops testing the boundary the moment the boundary moves, which is what
// happened when DESC_MAX went 160 -> 512 and this AC's over-cap fixture became a control.
const CAP = 512;
R = join(WORK, 'longdesc'); mkdirSync(join(R, 'docs'), { recursive: true });
const LONG = 'word '.repeat(160).trim();
const ATCAP = 'a'.repeat(CAP);
write(join(R, 'docs/overlong.md'), `---\ntype: Requirement\ntitle: Overlong\ndescription: ${LONG}\n---\n\nbody\n`);
write(join(R, 'docs/atcap.md'), `---\ntype: Requirement\ntitle: Atcap\ndescription: ${ATCAP}\n---\n\nbody\n`);
res = run('index', R);
idx = read(join(R, 'docs/index.md'));
h.check('AC-20 over-cap description drops to a bare link', /^\* \[Overlong\]\(overlong\.md\)$/m.test(idx));
h.check('AC-20 no dangling separator or trailing space', !/^\* \[Overlong\]\(overlong\.md\)[ -]/m.test(idx));
has('AC-20 names the file it dropped', res.err, 'long-description: docs/overlong.md');
has('AC-20 check reports it as a note', run('check', R).out, 'note: docs/overlong.md');
eq('AC-20 an over-long description is never a conformance violation', run('check', R).rc, 0);
// negative control — a description exactly at the cap must survive verbatim
h.check(`AC-20 control: a ${CAP}-char description survives verbatim`,
  idx.includes(`* [Atcap](atcap.md) - ${ATCAP}`));
hasNot('AC-20 control: and the one at the cap is not reported', res.err, 'docs/atcap.md');
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

// ---------- AC-39 the walk stops at another repository's working tree ----------
// A submodule's working tree carries `.git` as a FILE holding a gitdir: pointer; a nested clone
// carries it as a directory. Either way the parent repo only pins it, and writing inside edits a
// repository the caller does not own. It is invisible twice: nothing in the output distinguishes
// those files from the caller's own, and `coverage` cannot catch it because git reports a
// submodule as one gitlink. So the boundary is structural, not an .okfignore line nobody can add
// before the first run does the damage.
R = fixture('boundary');
doc(join(R, 'vendor/sub/docs/THEIRS.md'), 'Requirement', 'Not ours', 'Lives in another repo.');
write(join(R, 'vendor/sub/.git'), 'gitdir: ../../.git/modules/sub\n');
doc(join(R, 'vendor/clone/NOTES.md'), 'Note', 'Also not ours', 'A nested clone.');
mkdirSync(join(R, 'vendor/clone/.git'), { recursive: true });
res = run('index', R);
h.check('AC-39 canary: nothing is written inside a submodule work tree',
  !existsSync(join(R, 'vendor/sub/docs/index.md')) && !existsSync(join(R, 'vendor/sub/index.md')));
h.check('AC-39 canary: nor inside a nested clone',
  !existsSync(join(R, 'vendor/clone/index.md')));
has('AC-39 the boundary is reported, not silently crossed', res.err, 'separate-repo: vendor/sub/');
has('AC-39 for a nested clone too', res.err, 'separate-repo: vendor/clone/');
h.check('AC-39 and their documents are absent from the parent index',
  !read(join(R, 'index.md')).includes('THEIRS') && !read(join(R, 'index.md')).includes('NOTES'));
// control: an ordinary directory in the same position is still walked and written
doc(join(R, 'vendor/ours/MINE.md'), 'Note', 'Ours', 'Lives in this repo.');
run('index', R);
h.check('AC-39 control: an ordinary sibling directory is still indexed',
  existsSync(join(R, 'vendor/ours/index.md')));

// ---------- AC-40 an index this tool did not write is never overwritten ----------
// A dialect's index carries rows v0.2 does not project — an id, a status, a richer description.
// Regenerating replaces that catalog with a poorer one and destroys the lookup the index exists
// for. This used to be prevented by refusing profiled repos outright; that instrument was wrong
// (FR-OKF-3) and took the protection with it, so the replacement turns on evidence in the file.
R = fixture('foreign');
const hand = '# Requirements\n\n* FR-001 — stable — Place an order.\n';
write(join(R, 'docs/requirements/index.md'), hand);
res = run('index', R);
eq('AC-40 canary: an index with no generation marker is left byte-identical',
  read(join(R, 'docs/requirements/index.md')), hand);
has('AC-40 and it is named', res.err, 'foreign-index: docs/requirements/index.md');
has('AC-40 with the downgrade spelled out', res.err, 'lossy downgrade');
has('AC-40 and both ways to resolve it', res.err, 'Delete the file to hand this tool the directory');
h.check('AC-40 control: the indexes it does own are still written',
  read(join(R, 'docs/adr/index.md')).includes('JWT authentication'));
// control: once the foreign file is gone, the directory is generated normally
rmSync(join(R, 'docs/requirements/index.md'));
res = run('index', R);
h.check('AC-40 control: deleting it hands the directory over',
  read(join(R, 'docs/requirements/index.md')).includes('Place an order'));
hasNot('AC-40 control: and nothing is reported any more', res.err, 'foreign-index:');

// ---------- AC-41 a plugin's payload directories are the loader's, not OKF's ----------
// Every .md under commands/ IS a slash command and every .md under agents/ IS an agent
// definition; a skill folder's entry point is SKILL.md, carrying Claude Code's frontmatter
// schema. Indexing them puts a document where the loader expects payload, and checking them
// demands keys that are not their schema. Neither is a per-repo preference, so — exactly as
// with another repository's work tree — the refusal is structural rather than an .okfignore
// line nobody can write before the first run has already done the damage.
R = fixture('payload');
write(join(R, '.claude-plugin/plugin.json'), '{"name":"demo","version":"1.0.0"}\n');
write(join(R, 'skills/thing/SKILL.md'), '---\nname: thing\ndescription: Does a thing.\n---\n\nbody\n');
write(join(R, 'skills/thing/references/guide.md'), '# Guide\n\nno frontmatter, by design\n');
write(join(R, 'commands/speak.md'), '# speak\n');
write(join(R, 'agents/Explore.md'), '# Explore\n');
// controls: the same directory names where no plugin manifest sits above them
doc(join(R, 'tools/skills/other/GUIDE.md'), 'Note', 'A guide', 'Not a plugin skill folder.');
doc(join(R, 'docs/commands/deploy.md'), 'Playbook', 'Deploy', 'How the CLI deploy command is run.');
res = run('index', R);
h.check('AC-41 canary: no index is written inside a plugin skills/ folder',
  !existsSync(join(R, 'skills/index.md')) && !existsSync(join(R, 'skills/thing/index.md'))
  && !existsSync(join(R, 'skills/thing/references/index.md')));
h.check('AC-41 canary: nor inside commands/ or agents/',
  !existsSync(join(R, 'commands/index.md')) && !existsSync(join(R, 'agents/index.md')));
has('AC-41 the pruning is reported, not silent', res.err, 'plugin-payload: skills/');
has('AC-41 for commands/ too', res.err, 'plugin-payload: commands/');
has('AC-41 and agents/', res.err, 'plugin-payload: agents/');
hasNot('AC-41 and payload never reaches the root index', read(join(R, 'index.md')), 'skills/index.md');
res = run('check', R);
eq('AC-41 check stops demanding OKF keys of the loader\'s files', res.rc, 0);
hasNot('AC-41 so SKILL.md is never named', res.out, 'skills/thing/SKILL.md');
h.check('AC-41 control: a skills/ directory with no plugin manifest above it is still indexed',
  existsSync(join(R, 'tools/skills/other/index.md')));
h.check('AC-41 control: and a docs/commands/ folder documenting a CLI stays knowledge',
  read(join(R, 'docs/commands/index.md')).includes('Deploy'));
// the discriminating half: the manifest is the whole anchor, so removing it must bring
// every finding back. A rule that fired on the directory name would not notice.
rmSync(join(R, '.claude-plugin'), { recursive: true, force: true });
res = run('check', R);
eq('AC-41 canary: with no manifest the same tree is checked again', res.rc, 1);
has('AC-41 and SKILL.md is named after all', res.out, 'skills/thing/SKILL.md');
res = run('index', R);
h.check('AC-41 and the index returns to the same directory', existsSync(join(R, 'skills/thing/index.md')));
// marketplace.json anchors a plugin root just as plugin.json does
write(join(R, '.claude-plugin/marketplace.json'), '{"name":"demo-marketplace"}\n');
rmSync(join(R, 'skills/thing/index.md'));
res = run('index', R);
h.check('AC-41 control: marketplace.json is an anchor too',
  !existsSync(join(R, 'skills/thing/index.md')));

// A manifest at the package root, with no .claude-plugin/ directory at all, is the shape every
// installed plugin under ~/.claude/plugins/cache/ actually has, and a marketplace entry pointing
// at such a directory loads its commands and skills normally. Probing only the nested form was
// stricter than the loader being modelled, and let the payload straight back in.
R = fixture('payload-flat');
write(join(R, 'plugin.json'), '{"name":"flat","version":"1.0.0"}\n');
write(join(R, 'skills/thing/SKILL.md'), '---\nname: thing\ndescription: Does a thing.\n---\n\nbody\n');
write(join(R, 'commands/speak.md'), '# speak\n');
res = run('index', R);
h.check('AC-41 canary: a manifest at the package root anchors a plugin root too',
  !existsSync(join(R, 'skills/thing/index.md')) && !existsSync(join(R, 'commands/index.md')));
has('AC-41 and is reported the same way', res.err, 'plugin-payload: commands/');
eq('AC-41 and check leaves its SKILL.md alone', run('check', R).rc, 0);
rmSync(join(R, 'plugin.json'));
res = run('check', R);
eq('AC-41 canary: removing the root manifest brings the demand back', res.rc, 1);
has('AC-41 and names the SKILL.md again', res.out, 'skills/thing/SKILL.md');


// ---------- AC-45 the core is importable, the CLI still is one ----------
// Proven from a SEPARATE process, because an import that calls process.exit takes the harness
// with it — the failure would read as a crashed suite, not a failed assertion.
const probe = `
  import * as okf from ${JSON.stringify(OKF)};
  const want = ['cmdIndex', 'parseBlock', 'readDoc', 'declaredProfile', 'readIgnores',
                'ignoredFile', 'declaredOkfVersion', 'OKF_VERSION', 'GEN_MARKER'];
  const missing = want.filter((k) => okf[k] === undefined);
  process.stdout.write(JSON.stringify({ alive: true, missing }));
`;
const imported = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' });
eq('AC-45 importing okf.mjs does not exit the host process', imported.status, 0);
let surface = {};
try { surface = JSON.parse(imported.stdout || '{}'); } catch { surface = {}; }
h.check('AC-45 the import completed', surface.alive === true, imported.stderr);
h.check('AC-45 and the client surface is exported',
  Array.isArray(surface.missing) && surface.missing.length === 0,
  `missing: ${(surface.missing || ['<no answer>']).join(', ')}`);
// control: the guard did not disable the CLI. AC-14 covers usage codes; this is the entry point.
eq('AC-45 control: run as a script it still executes', run('--version').rc, 0);
has('AC-45 control: and still prints its version', run('--version').out, 'okf.mjs ');

// ---------- AC-46 the frontmatter contract corpus ----------
const CORPUS = resolve(DIR, 'fixtures', 'okf-frontmatter');
if (!existsSync(CORPUS)) {
  h.bad('AC-46 the fixture corpus is missing', CORPUS);
} else {
  const cases = readdirSync(CORPUS).filter((f) => f.endsWith('.expected.json')).sort();
  h.check('AC-46 the corpus is not empty', cases.length >= 12, `${cases.length} case(s)`);
  const readCase = `
    import { readDoc } from ${JSON.stringify(OKF)};
    const [data, err, heading] = readDoc(process.argv[1]);
    process.stdout.write(JSON.stringify({ data, err, heading }));
  `;
  for (const name of cases) {
    const stem = name.slice(0, -'.expected.json'.length);
    const docPath = join(CORPUS, `${stem}.md`);
    const expected = JSON.parse(readFileSync(join(CORPUS, name), 'utf8'));
    if (!existsSync(docPath)) { h.bad(`AC-46 ${stem}: expectation without a fixture`, docPath); continue; }
    // Both halves are required to exist. A corpus that records only the consumer it happens to
    // run against is not a contract — it is this repository's behaviour with a filename.
    h.check(`AC-46 ${stem}: an expectation is recorded for both consumers`,
      !!(expected.consumers && expected.consumers.okf && expected.consumers['agentic-sdlc']),
      `keys: ${Object.keys(expected.consumers || {}).join(', ')}`);
    const want = (expected.consumers || {}).okf || {};
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', readCase, docPath], { encoding: 'utf8' });
    let got = {};
    try { got = JSON.parse(r.stdout || '{}'); } catch { got = {}; }
    if (want.ok) {
      h.check(`AC-46 ${stem}: parses`, got.err === null, `error: ${got.err}`);
      h.check(`AC-46 ${stem}: keys match the hand-written expectation`,
        JSON.stringify(got.data) === JSON.stringify(want.data),
        `expected ${JSON.stringify(want.data)} got ${JSON.stringify(got.data)}`);
    } else {
      h.check(`AC-46 ${stem}: is rejected, not read as an empty document`, got.err === want.error,
        `expected ${JSON.stringify(want.error)} got ${JSON.stringify(got.err)}`);
    }
    if (want.heading !== undefined) {
      h.check(`AC-46 ${stem}: heading survives regardless`, got.heading === want.heading,
        `expected ${JSON.stringify(want.heading)} got ${JSON.stringify(got.heading)}`);
    }
  }

  // declaredProfile's accepted spellings, and the near-misses it must reject. A profile scopes
  // which documents carry required keys, so misreading a line silently changes what check means.
  const spellings = JSON.parse(readFileSync(join(CORPUS, 'profile-spellings.json'), 'utf8'));
  const P = join(WORK, 'profile-spellings');
  for (const { line, expected } of spellings.cases) {
    rmSync(P, { recursive: true, force: true });
    write(join(P, 'docs/okf.yaml'), `${line}\n`);
    write(join(P, 'docs/one.md'), '---\ntype: Note\ndescription: d\n---\n\nbody\n');
    const out = run('index', P).err;
    const declared = /declares profile (.+?) - proceeding/.exec(out);
    const got = declared ? declared[1] : null;
    h.check(`AC-46 profile spelling ${JSON.stringify(line)}`, got === expected,
      `expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`);
  }
}


// ---------- AC-55..AC-65 the profiled dialect (FR-OKF-7) ----------
// One generator, two dialects. The default one is what every unprofiled repository already has on
// disk, so its rows are a compatibility contract and the first AC here is a negative control that
// they did not move. The profiled one exists because a bundle whose manifest requires an id and a
// status of every concept document has two fields the default row cannot carry, and a catalog that
// silently drops them answers none of the questions it is opened for.
//
// The three markers are READ OUT OF the generator, never restated. A fixture built from a mistyped
// marker is not recognised, the adoption path never runs, and every assertion below passes having
// exercised nothing — the fail-open shape this repo keeps meeting. Read from a CHILD process for
// the same reason AC-45 is: if the import guard regresses, a top-level import takes the whole
// suite down as a crash instead of reporting it as a failure.
const markerProbe = `
  import { GEN_MARKER, GEN_MARKER_V1, RETIRED_V1_MARKER } from ${JSON.stringify(OKF)};
  process.stdout.write(JSON.stringify({ GEN_MARKER, GEN_MARKER_V1, RETIRED_V1_MARKER }));
`;
const markerRun = spawnSync(process.execPath, ['--input-type=module', '-e', markerProbe], { encoding: 'utf8' });
let MARK = {};
try { MARK = JSON.parse(markerRun.stdout || '{}'); } catch { MARK = {}; }
const DEFAULT_MARKER = MARK.GEN_MARKER;
const PROFILED_MARKER = MARK.GEN_MARKER_V1;
const RETIRED_MARKER = MARK.RETIRED_V1_MARKER;
// Asserted before anything uses them: undefined markers would make every fixture below a string
// containing "undefined", which no code path recognises and no assertion could distinguish from
// a generator that simply never adopts.
h.check('AC-55 the three markers are exported and distinct',
  [DEFAULT_MARKER, PROFILED_MARKER, RETIRED_MARKER].every((m) => typeof m === 'string' && m.length > 10)
  && new Set([DEFAULT_MARKER, PROFILED_MARKER, RETIRED_MARKER]).size === 3,
  `got: ${JSON.stringify(MARK)} ${markerRun.stderr}`);

const pdoc = (p, id, type, status, title, description) =>
  write(p, `---\nid: ${id}\ntype: ${type}\nstatus: ${status}\ntitle: ${title}\ndescription: ${description}\n---\n\nbody\n`);
const manifest = (root, body) => write(join(root, 'docs/okf.yaml'), body);
const retiredIndex = (p, heading, rows) =>
  write(p, `# ${heading}\n\n${RETIRED_MARKER}\n\n${rows.join('\n')}\n`);
// Block and flow are the two live spellings of the same declaration; a reader that knows only one
// returns [] for the other, which reads a profiled bundle as an unprofiled one and rewrites its
// whole catalog in the poorer dialect.
const BLOCK_KEYS = 'required_keys:\n  - id\n  - type\n  - status\n  - description\n';
const FLOW_KEYS = 'required_keys: [id, type, status, description]\n';
const BLOCK_KEYS_PLAIN = 'required_keys:\n  - type\n  - description\n';
const FLOW_KEYS_PLAIN = 'required_keys: [type, description]\n';
const subdirRows = (text) => text.split('\n')
  .filter((l) => /^\* \[[^\]]+\]\([^)]+\/index\.md\)/.test(l))
  .map((l) => /^\* \[([^\]]+)\]/.exec(l)[1]);
const differingLines = (before, after) => {
  const a = before.split('\n');
  const b = after.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (a[i] !== b[i]) out.push([a[i], b[i]]);
  return out;
};

// ---------- AC-55 the default dialect did not move, and the one honest exception ----------
// Every unprofiled repository regenerates through this path on the next edit, so a change here is
// a change to files already committed elsewhere. The exception is deliberate and must be visible:
// DESC_MAX moved 160 -> 512, so a description in that band now renders where it used to be dropped.
R = fixture('dialect-default');
doc(join(R, 'docs/midband.md'), 'Note', 'Midband', 'x'.repeat(300));
res = run('index', R);
idx = read(join(R, 'docs/index.md'));
h.check('AC-55 the default index still opens with the default marker, before any heading',
  idx.startsWith(`${DEFAULT_MARKER}\n\n# `));
h.check('AC-55 rows are still * [title](link) - description under a # <Type> heading',
  read(join(R, 'docs/requirements/index.md'))
    .includes('# Requirement\n\n* [Cancel an order](FR-002.md) - User cancels an unshipped order.'));
h.check('AC-55 subdirectories still live under their own # Subdirectories heading',
  idx.includes('# Subdirectories\n\n* [adr](adr/index.md)'));
h.check('AC-55 and only the bundle root carries okf_version frontmatter',
  read(join(R, 'index.md')).startsWith('---\nokf_version: "0.2"\n---\n\n') && !idx.startsWith('---'));
// the honest exception — a 300-char description is now carried, not dropped
h.check('AC-55 a 300-char description now RENDERS, where the old 160 cap dropped it',
  idx.includes(`* [Midband](midband.md) - ${'x'.repeat(300)}`));
hasNot('AC-55 and it is not reported as over-cap any more', res.err, 'long-description: docs/midband.md');

// ---------- AC-56 a profiled repository round-trips, and the root gains frontmatter ----------
// Adoption must be a marker swap and nothing else when the rows are already right. Anything more
// is the tool rewriting a catalog it claims only to be re-stamping.
R = join(WORK, 'dialect-profiled');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'User submits a cart.');
pdoc(join(R, 'docs/requirements/FR-002.md'), 'FR-002', 'Requirement', 'Draft', 'Cancel an order', 'User cancels it.');
retiredIndex(join(R, 'docs/requirements/index.md'), 'requirements', [
  '* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.',
  '* [FR-002 — Cancel an order](FR-002.md) - **Draft** — User cancels it.',
]);
const beforeRT = read(join(R, 'docs/requirements/index.md'));
res = run('index', R);
const afterRT = read(join(R, 'docs/requirements/index.md'));
const rtDiff = differingLines(beforeRT, afterRT);
h.check('AC-56 an already-correct profiled index changes by exactly one line', rtDiff.length === 1,
  JSON.stringify(rtDiff));
h.check('AC-56 and that line is the marker swap, nothing else',
  rtDiff.length === 1 && rtDiff[0][0] === RETIRED_MARKER && rtDiff[0][1] === PROFILED_MARKER,
  JSON.stringify(rtDiff));
has('AC-56 the adoption is reported', res.err, 'adopted-index: docs/requirements/index.md');
h.check('AC-56 the heading is the directory basename and the marker sits AFTER it',
  afterRT.startsWith(`# requirements\n\n${PROFILED_MARKER}\n\n`));
h.check('AC-56 the bundle root gains okf_version frontmatter, above its heading',
  read(join(R, 'index.md')).startsWith(`---\nokf_version: "0.2"\n---\n\n# ${basename(R)}\n\n${PROFILED_MARKER}\n`));
h.check('AC-56 a non-root profiled index carries no frontmatter', !afterRT.startsWith('---'));
h.check('AC-56 subdirectory rows are inline in the same list, with no description slot',
  read(join(R, 'docs/index.md')).includes('* [requirements](requirements/index.md)\n')
  && !/\* \[requirements\]\(requirements\/index\.md\) -/.test(read(join(R, 'docs/index.md'))));
// The profiled dialect has nowhere to put a folder description, so asking for one is asking for
// something the format cannot hold. Control below proves the prompt still exists where it can.
hasNot('AC-56 needs-description never fires under the profiled dialect', res.err, 'needs-description:');
rmSync(join(R, 'docs/okf.yaml'));
rmSync(join(R, 'docs/requirements/index.md'));
has('AC-56 control: the same tree unprofiled still asks for one', run('index', R).err,
  'needs-description: docs/requirements');

// ---------- AC-57 a retired index is refused where the manifest cannot express its rows ----------
// The default renderer has no slot for an id or a status, so adopting here would silently downgrade
// a catalog that answers "which requirement is which, and where is it up to" into one that cannot.
R = join(WORK, 'retired-unprofiled');
rmSync(R, { recursive: true, force: true });
manifest(R, 'okf_version: "0.2"\nrequired_keys: [type, description]\n');
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'User submits a cart.');
retiredIndex(join(R, 'docs/requirements/index.md'), 'requirements', [
  '* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.',
]);
const beforeUP = read(join(R, 'docs/requirements/index.md'));
res = run('index', R);
eq('AC-57 canary: the retired index is left byte-identical',
  read(join(R, 'docs/requirements/index.md')), beforeUP);
has('AC-57 and the reason is the dialect, not the documents', res.err,
  'foreign-index: docs/requirements/index.md (carries the retired v1 marker; the default dialect projects no id or status');
has('AC-57 with the advice NOT to delete it', res.err, 'Do not delete the index');
// control: the same tree, the same index, one line added to the manifest
manifest(R, `okf_version: "0.2"\n${FLOW_KEYS}`);
res = run('index', R);
has('AC-57 control: declaring id and status makes the same file adoptable', res.err,
  'adopted-index: docs/requirements/index.md');
h.check('AC-57 control: and the adopted rows keep the id and the status',
  read(join(R, 'docs/requirements/index.md'))
    .includes('* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.'));

// ---------- AC-58 one concept document without id/status holds the whole directory ----------
// Adoption is per directory because an index is: half a catalog in the richer dialect and half in
// the poorer one is not a catalog, it is two grammars in one file that no reader survives.
R = join(WORK, 'profiled-degraded');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'User submits a cart.');
write(join(R, 'docs/requirements/FR-002.md'),
  '---\ntype: Requirement\ntitle: No status here\ndescription: User cancels it.\n---\n\nbody\n');
retiredIndex(join(R, 'docs/requirements/index.md'), 'requirements', [
  '* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.',
]);
const beforeDeg = read(join(R, 'docs/requirements/index.md'));
res = run('index', R);
eq('AC-58 canary: the directory is left byte-identical', read(join(R, 'docs/requirements/index.md')), beforeDeg);
has('AC-58 and the offending document is named in the refusal', res.err,
  '1 document(s) carry no id/status: docs/requirements/FR-002.md');
has('AC-58 it is reported on its own line too', res.err,
  'unprofiled-document: docs/requirements/FR-002.md (no id/status - rendered in the default row shape)');
// the default row shape is observable in a directory with no index in the way
write(join(R, 'docs/notes/loose.md'), '---\ntype: Note\ntitle: Loose\ndescription: A loose note.\n---\n\nbody\n');
run('index', R);
h.check('AC-58 and such a document renders in the default row shape, never **** — around nothing',
  read(join(R, 'docs/notes/index.md')).includes('* [Loose](loose.md) - A loose note.'));
// control: give it the two keys and the same directory adopts
pdoc(join(R, 'docs/requirements/FR-002.md'), 'FR-002', 'Requirement', 'Draft', 'Cancel an order', 'User cancels it.');
res = run('index', R);
has('AC-58 control: supplying id and status clears the refusal', res.err,
  'adopted-index: docs/requirements/index.md');
hasNot('AC-58 control: and nothing is foreign any more', res.err, 'foreign-index:');

// ---------- AC-59 the capability gate is scoped by isConcept, in BOTH directions ----------
// This is the highest-value pair in the set. Scoped to every listable file instead of to concept
// documents, the gate refuses any folder containing a README — forever, with no action the author
// can take that clears it: a README cannot be given an id, and naming it in .okfignore deletes the
// row that FR-OKF-3 exists to guarantee. That is a condition nothing can satisfy, which is the
// exact shape of the refusal FR-OKF-3 removed, wearing a new costume. The other direction matters
// just as much: a genuine concept document with the identical lack MUST block and MUST be named,
// or the gate is not a gate.
R = join(WORK, 'isconcept-scope');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
pdoc(join(R, 'docs/withmeta/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'User submits a cart.');
write(join(R, 'docs/withmeta/README.md'), 'project furniture, no frontmatter\n');
retiredIndex(join(R, 'docs/withmeta/index.md'), 'withmeta', [
  '* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.',
]);
pdoc(join(R, 'docs/withconcept/FR-002.md'), 'FR-002', 'Requirement', 'Done', 'Cancel an order', 'User cancels it.');
write(join(R, 'docs/withconcept/notes.md'), '# Loose notes\n\nsame lack, not project furniture\n');
retiredIndex(join(R, 'docs/withconcept/index.md'), 'withconcept', [
  '* [FR-002 — Cancel an order](FR-002.md) - **Done** — User cancels it.',
]);
const beforeConcept = read(join(R, 'docs/withconcept/index.md'));
res = run('index', R);
has('AC-59 canary: a README with no frontmatter does NOT block adoption — scoped to every listable file, this folder would be refused forever with no action that clears it',
  res.err, 'adopted-index: docs/withmeta/index.md');
hasNot('AC-59 and the README is never named as a reason', res.err, 'docs/withmeta/README.md');
h.check('AC-59 yet it still gets its row — unreported is not unlisted',
  read(join(R, 'docs/withmeta/index.md')).includes('* [README](README.md)'));
h.check('AC-59 canary, other direction: a concept document with the IDENTICAL lack blocks adoption',
  read(join(R, 'docs/withconcept/index.md')) === beforeConcept);
has('AC-59 and it is named, where the README was not', res.err,
  '1 document(s) carry no id/status: docs/withconcept/notes.md');
has('AC-59 foreign-index names the directory it held back', res.err,
  'foreign-index: docs/withconcept/index.md');

// ---------- AC-60 a description past the cap blocks adoption, never a quiet drop ----------
// The cap already drops a description rather than truncating it (AC-20). Doing that while ALSO
// adopting would hand the retired catalog's own description away and stamp this tool's marker on
// the result — a lossy rewrite that then looks like a file this tool has always owned.
R = join(WORK, 'profiled-overcap');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
const OVERCAP = 'y'.repeat(CAP + 88);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', OVERCAP);
retiredIndex(join(R, 'docs/requirements/index.md'), 'requirements', [
  '* [FR-001 — Place an order](FR-001.md) - **Done** — the description the retired catalog carried.',
]);
const beforeCap = read(join(R, 'docs/requirements/index.md'));
res = run('index', R);
eq('AC-60 canary: the retired index is left byte-identical', read(join(R, 'docs/requirements/index.md')), beforeCap);
has('AC-60 and the cap is named as the reason, with the path', res.err,
  `1 description(s) over the ${CAP}-char cap: docs/requirements/FR-001.md`);
has('AC-60 the drop is reported on its own line too', res.err,
  `long-description: docs/requirements/FR-001.md (${OVERCAP.length} chars, max ${CAP})`);
// control: bring it inside the cap and the same file adopts, carrying the description
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'Within the cap.');
res = run('index', R);
has('AC-60 control: within the cap the same file adopts', res.err, 'adopted-index: docs/requirements/index.md');
h.check('AC-60 control: and the description is carried, not lost',
  read(join(R, 'docs/requirements/index.md')).includes('**Done** — Within the cap.'));

// ---------- AC-61 concept_folders is the author's running order ----------
// Sorting the declared folders alphabetically would discard the only ordering information the
// manifest carries, and it would do it invisibly: the index still lists everything.
R = join(WORK, 'concept-order');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}concept_folders:\n  - requirements\n  - adr\n`);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'd.');
pdoc(join(R, 'docs/adr/ADR-001.md'), 'ADR-001', 'ADR', 'Accepted', 'JWT authentication', 'd.');
pdoc(join(R, 'docs/bbb/N-001.md'), 'N-001', 'Note', 'Draft', 'Bee', 'd.');
pdoc(join(R, 'docs/zzz/N-002.md'), 'N-002', 'Note', 'Draft', 'Zed', 'd.');
run('index', R);
h.check('AC-61 declared folders keep their declared order, and the rest fall in alphabetically behind them',
  JSON.stringify(subdirRows(read(join(R, 'docs/index.md')))) === JSON.stringify(['requirements', 'adr', 'bbb', 'zzz']),
  JSON.stringify(subdirRows(read(join(R, 'docs/index.md')))));
// control: with nothing declared the order is purely alphabetical, which is what makes the
// assertion above discriminating — 'requirements' before 'adr' can only come from the manifest
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
run('index', R);
h.check('AC-61 control: with no concept_folders the order is alphabetical',
  JSON.stringify(subdirRows(read(join(R, 'docs/index.md')))) === JSON.stringify(['adr', 'bbb', 'requirements', 'zzz']),
  JSON.stringify(subdirRows(read(join(R, 'docs/index.md')))));

// ---------- AC-62 both manifest spellings select the profiled dialect ----------
// Both are live in adopted repositories. A reader that knows one spelling silently reads the other
// repository as unprofiled and rewrites its whole catalog in the poorer dialect on the next edit.
for (const [spelling, keys, plain] of [['block', BLOCK_KEYS, BLOCK_KEYS_PLAIN], ['flow', FLOW_KEYS, FLOW_KEYS_PLAIN]]) {
  const S = join(WORK, `spelling-${spelling}`);
  rmSync(S, { recursive: true, force: true });
  manifest(S, `okf_version: "0.2"\n${keys}`);
  pdoc(join(S, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'User submits a cart.');
  run('index', S);
  const si = read(join(S, 'docs/requirements/index.md'));
  h.check(`AC-62 the ${spelling} sequence selects the profiled dialect`,
    si.startsWith(`# requirements\n\n${PROFILED_MARKER}\n\n`), si);
  h.check(`AC-62 and the ${spelling} spelling's rows carry the id and the status`,
    si.includes('* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.'), si);
  // control: the same spelling without id and status stays on the default dialect
  manifest(S, `okf_version: "0.2"\n${plain}`);
  rmSync(join(S, 'docs/requirements/index.md'));
  run('index', S);
  h.check(`AC-62 control: the ${spelling} spelling without id/status stays default`,
    read(join(S, 'docs/requirements/index.md')).startsWith(`${DEFAULT_MARKER}\n\n# Requirement\n`));
}

// ---------- AC-63 a merely STALE index adopts and heals ----------
// Pinned because it was a corrected design error: an earlier gate compared the committed text with
// the rendered text and refused when they differed, which turns the tool's entire purpose — making
// a stale index current — into a permanent refusal whose only escape is deleting the catalog.
R = join(WORK, 'profiled-stale');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'The current description.');
retiredIndex(join(R, 'docs/requirements/index.md'), 'requirements', [
  '* [FR-001 — A title nobody uses any more](FR-001.md) - **Draft** — a description three edits out of date.',
]);
const beforeStale = read(join(R, 'docs/requirements/index.md'));
res = run('index', R);
const afterStale = read(join(R, 'docs/requirements/index.md'));
h.check('AC-63 the stale index was rewritten, not refused', afterStale !== beforeStale);
h.check('AC-63 and it differs by MORE than the marker, which a text-diff gate would have refused',
  differingLines(beforeStale, afterStale).length > 1,
  JSON.stringify(differingLines(beforeStale, afterStale)));
has('AC-63 it is reported as an adoption', res.err, 'adopted-index: docs/requirements/index.md');
h.check('AC-63 the healed row carries the document\'s current truth',
  afterStale.includes('* [FR-001 — Place an order](FR-001.md) - **Done** — The current description.'));
hasNot('AC-63 and the stale title is gone', afterStale, 'A title nobody uses any more');

// ---------- AC-64 an index that OMITTED documents gains rows and still adopts ----------
// A superset of rows is not a loss. Listing a document the retired generator left out is FR-OKF-3
// working; counting it as a difference that blocks adoption would make the omission permanent.
R = join(WORK, 'profiled-omission');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'Listed already.');
pdoc(join(R, 'docs/requirements/FR-002.md'), 'FR-002', 'Requirement', 'Draft', 'Cancel an order', 'Never listed.');
retiredIndex(join(R, 'docs/requirements/index.md'), 'requirements', [
  '* [FR-001 — Place an order](FR-001.md) - **Done** — Listed already.',
]);
res = run('index', R);
idx = read(join(R, 'docs/requirements/index.md'));
has('AC-64 an index missing a document still adopts', res.err, 'adopted-index: docs/requirements/index.md');
h.check('AC-64 and the omitted document gains a row', idx.includes('* [FR-002 — Cancel an order](FR-002.md) - **Draft** — Never listed.'));
h.check('AC-64 while the row it already had survives', idx.includes('* [FR-001 — Place an order](FR-001.md) - **Done** — Listed already.'));

// ---------- AC-65 a 0.1 manifest is reported, never a refusal and never a dialect selector ----------
// required_keys selects the dialect; okf_version does not. Treating a stale version field as the
// evidence would read a bundle by a field that was never the evidence, and refusing on it would
// leave the repositories most in need of regeneration with no index at all.
R = join(WORK, 'retired-version');
rmSync(R, { recursive: true, force: true });
manifest(R, `okf_version: "0.1"\n${BLOCK_KEYS}`);
pdoc(join(R, 'docs/requirements/FR-001.md'), 'FR-001', 'Requirement', 'Done', 'Place an order', 'User submits a cart.');
res = run('index', R);
eq('AC-65 a 0.1 manifest is not a refusal', res.rc, 0);
has('AC-65 it is reported, with the repair', res.err, 'retired-okf-version: docs/okf.yaml (0.1 is retired; declare "0.2")');
h.check('AC-65 and the repository is indexed anyway', existsSync(join(R, 'docs/requirements/index.md')));
h.check('AC-65 the version selects no dialect — required_keys still does',
  read(join(R, 'docs/requirements/index.md')).includes('* [FR-001 — Place an order](FR-001.md) - **Done** — User submits a cart.'));
h.check('AC-65 and the root index is stamped with the current version, not the declared one',
  read(join(R, 'index.md')).startsWith('---\nokf_version: "0.2"\n---\n'));
// control: a current manifest says nothing at all
manifest(R, `okf_version: "0.2"\n${BLOCK_KEYS}`);
hasNot('AC-65 control: a 0.2 manifest is not reported', run('index', R).err, 'retired-okf-version:');


h.done();
