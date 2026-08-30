#!/usr/bin/env node
// test-okf-coverage.mjs — acceptance matrix for `okf.mjs coverage` (FR-OKF-3)
//
// Separate from test-okf-maintain.mjs because git is not optional here: the whole point of
// the command is that its enumerator is `git ls-files` rather than the tool's own walk. A
// machine without git cannot evaluate any of this, so this suite owns its own 77 instead of
// dragging the other 98 assertions down with it.
//
// What is under test is a specific failure mode, not a feature. `check` regenerates the
// index and compares it to the committed one — but both sides come from the same walk, so a
// document the walk never reaches is missing from both and compares equal. A projection
// checked against itself reports CLEAN having never seen the input. Every assertion below is
// therefore paired: the canary is a document the walk genuinely cannot reach, and the control
// proves the same run does not simply flag everything.
//
//   AC-31 coverage: a fully indexed tree exits 0 (control — the check can pass)
//   AC-32 coverage: CANARY — a document the walk never reaches is named, on the very tree
//              that `check` and a full regeneration both call clean, and the finding carries its
//              remedy: the walk skips dot-directories by design, so `index` will never satisfy it
//              and a hand-written index.md would be the very drift this command exists to find
//   AC-33 coverage: declaring the unreachable path unowned is what clears it, and the line
//              responsible is reported; deleting the index brings the finding back
//   AC-34 coverage: a document written but not yet staged is reported (the enumeration is
//              --cached --others --exclude-standard, deliberately), while a git-ignored one is not
//   AC-35 coverage: a subdirectory index that exists but omits one of its own documents is
//              caught — the case a byte-comparison against a regenerated copy cannot see
//   AC-36 coverage: outside a git work tree it exits 77, never 0
//   AC-37 coverage: a real submodule is invisible to git's enumeration (one gitlink) and is not
//              written into either — the two sides agree, which is why the walk's refusal to
//              enter had to be structural: no check could have caught those writes
//   AC-38 coverage: a tracked document inside a separate work tree (a vendored copy carrying its
//              .git pointer) is demanded but unreachable, so the finding carries its remedy

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, skip } from './lib/harness.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const OKF = resolve(DIR, '..', 'skills', 'okf-maintain', 'scripts', 'okf.mjs');

if (!existsSync(OKF)) skip(`okf.mjs not found at ${OKF}`);
if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) {
  skip('git is unavailable; the coverage command has nothing to enumerate with');
}

const h = new Harness('okf.mjs coverage — a missing input is named, not agreed with');
const WORK = h.mkTemp('okf-cov-');

const run = (...args) => {
  const r = spawnSync(process.execPath, [OKF, ...args], { encoding: 'utf8' });
  return { rc: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, err: r.stderr ?? '' };
};
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const eq = (name, actual, expected) =>
  h.check(name, actual === expected, `expected [${expected}] got [${actual}]`);
const has = (name, hay, needle) => h.check(name, hay.includes(needle), `got: ${hay.trim()}`);
const hasNot = (name, hay, needle) => h.check(name, !hay.includes(needle), `unexpectedly found: ${needle}`);
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
const doc = (p, type, title, description) =>
  write(p, `---\ntype: ${type}\ntitle: ${title}\ndescription: ${description}\n---\n\nbody\n`);

// A repository whose documents are all reachable by the walk, plus one that is not.
// `.hidden/` is the honest shape of the blind spot: the walk skips dot-directories so it
// never descends there, and no amount of regenerating will ever mention what is inside.
function repo(name, { unreachable = true } = {}) {
  const r = join(WORK, name);
  rmSync(r, { recursive: true, force: true });
  mkdirSync(r, { recursive: true });
  git(r, 'init', '-q', '.');
  doc(join(r, 'docs/requirements/FR-001.md'), 'Requirement', 'Place an order', 'User submits a cart.');
  doc(join(r, 'docs/adr/ADR-001.md'), 'ADR', 'JWT authentication', 'Endpoints authenticate via JWT.');
  write(join(r, 'README.md'), '# Project\n');
  if (unreachable) write(join(r, '.hidden/note.md'), '# A note the walk never reaches\n');
  git(r, 'add', '-A');
  return r;
}

const describeAll = (r) => run('index', r,
  '--describe', `${join(r, 'docs')}=Project documentation.`,
  '--describe', `${join(r, 'docs/requirements')}=Functional requirements.`,
  '--describe', `${join(r, 'docs/adr')}=Decision records.`);

let R, res;

// ---------- AC-31 control: a tree with nothing hidden must come back clean ----------
R = repo('clean', { unreachable: false });
describeAll(R);
// Deliberately before staging: an index you have just written but not yet committed is
// the state you want to verify in, so the indexes are read from disk while the documents
// they must account for come from git.
res = run('coverage', R);
eq('AC-31 freshly written, unstaged indexes already count', res.rc, 0);
git(R, 'add', '-A');
res = run('coverage', R);
eq('AC-31 a fully indexed tree exits 0', res.rc, 0);
has('AC-31 and says how much it actually looked at', res.out, '3 tracked document(s)');
has('AC-31 reporting zero unreachable', res.out, '0 reachable only by ls');

// ---------- AC-32 CANARY: the document the projection cannot see ----------
R = repo('hidden');
describeAll(R);
git(R, 'add', '-A');
eq('AC-32 control: check calls this tree conformant', run('check', R).rc, 0);
const before = readFileSync(join(R, 'docs/index.md'), 'utf8');
describeAll(R);
h.check('AC-32 control: regeneration reproduces the committed index byte-for-byte',
  readFileSync(join(R, 'docs/index.md'), 'utf8') === before);
res = run('coverage', R);
eq('AC-32 coverage still exits 1 on the same tree', res.rc, 1);
has('AC-32 and names the document reachable only by ls', res.out, 'unindexed: .hidden/note.md');
hasNot('AC-32 control: it does not flag the documents that are indexed', res.out, 'unindexed: docs/');
hasNot('AC-32 control: nor the project readme', res.out, 'unindexed: README.md');
// Naming a file the generator can never reach, without naming the remedy, leaves one obvious
// next move: hand-write the index. That is the drift this command exists to find, reappearing
// at the one place the tool declines to go. So the remedy has to travel with the finding.
has('AC-32 the dead end is named, not just the file', res.out, 'the walk does not descend into');
has('AC-32 and both real remedies are given', res.out, 'move the document out, or name the path in .okfignore');
has('AC-32 including the one to avoid', res.out, 'do not hand-write an index.md');

// ---------- AC-33 the only thing that clears it is declaring the path unowned ----------
write(join(R, '.okfignore'), '# owned by nothing here\n.hidden/\n');
res = run('coverage', R);
eq('AC-33 a declared path is out of scope, and the run exits 0', res.rc, 0);
has('AC-33 the line responsible is named, never silently dropped', res.out, 'ignored: .hidden/ (.okfignore:2)');
has('AC-33 the tracked count drops to what remains', res.out, '3 tracked document(s)');
// and the finding must come back the moment the index it relies on disappears
unlinkSync(join(R, 'docs/adr/index.md'));
res = run('coverage', R);
eq('AC-33 canary: deleting an index makes its documents unreachable again', res.rc, 1);
has('AC-33 and the orphaned document is named', res.out, 'unindexed: docs/adr/ADR-001.md');

// ---------- AC-34 the enumeration includes the working tree, and it is the whole point ----------
// `git ls-files` alone reads the INDEX. A document written but not yet staged is invisible to
// it — and that is precisely the document at risk, the one being added right now. A check that
// cannot see it passes, the commit lands with no row for it, and the next commit belatedly adds
// the previous document's row. That is the projection-against-itself defect reproducing itself
// inside its own fix, so the unstaged case is a canary here, not an edge case.
R = repo('worktree', { unreachable: false });
describeAll(R);
git(R, 'add', '-A');
eq('AC-34 control: the staged, indexed tree is clean', run('coverage', R).rc, 0);
write(join(R, 'docs/scratch.md'), '# a document written but never staged\n');
res = run('coverage', R);
eq('AC-34 canary: an unstaged new document is reported, not skipped', res.rc, 1);
has('AC-34 and named', res.out, 'unindexed: docs/scratch.md');
git(R, 'add', 'docs/scratch.md');
res = run('coverage', R);
eq('AC-34 staging changes nothing — it was always owed', res.rc, 1);
has('AC-34 and it is still named', res.out, 'unindexed: docs/scratch.md');
// control: the repo's own ignore rules stay authoritative, or every build tree is a finding
write(join(R, '.gitignore'), 'build/\n');
write(join(R, 'build/generated.md'), '# generated output\n');
res = run('coverage', R);
hasNot('AC-34 control: a git-ignored document is not demanded', res.out, 'build/generated.md');

// ---------- AC-35 a partial index is a real gap, and the byte comparison cannot see it ----------
// An index that exists but omits one of its own documents is the exact case where
// "regenerate and diff" agrees with itself: the omission is in both copies.
R = repo('partial', { unreachable: false });
describeAll(R);
const idx = join(R, 'docs/requirements/index.md');
writeFileSync(idx, readFileSync(idx, 'utf8').replace(/^\* \[Place an order\].*\n/m, ''));
git(R, 'add', '-A');
res = run('coverage', R);
eq('AC-35 a document missing from its own index is caught', res.rc, 1);
has('AC-35 and named', res.out, 'unindexed: docs/requirements/FR-001.md');
// control for AC-32's hint: an ordinary path is fixed by regenerating, so the dot-directory
// advice would be wrong here and must not appear
hasNot('AC-35 control: no dot-directory advice on a path the walk reaches fine',
  res.out, 'the walk does not descend into');

// ---------- AC-37 a real submodule is invisible to both sides, and stays that way ----------
// git reports a submodule as one gitlink, so coverage cannot see the documents inside it — which
// is exactly why the walk refusing to enter had to be structural: no check would have caught the
// writes. Assert the two agree, so a submodule is neither written into nor demanded.
const upstream = join(WORK, 'upstream');
mkdirSync(upstream, { recursive: true });
git(upstream, 'init', '-q', '.');
doc(join(upstream, 'docs/THEIRS.md'), 'Requirement', 'Not ours', 'Belongs to the other repo.');
git(upstream, 'add', '-A');
git(upstream, '-c', 'user.email=t@e.st', '-c', 'user.name=T', 'commit', '-qm', 'seed');

R = repo('submodule', { unreachable: false });
const added = git(R, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'vendor/sub');
if (added.status !== 0) {
  h.check('AC-37 submodule fixture could not be created — skipped, not assumed', true,
    'git submodule add failed; the two assertions below did not run');
} else {
  describeAll(R);
  git(R, 'add', '-A');
  h.check('AC-37 canary: nothing was written inside the submodule work tree',
    !existsSync(join(R, 'vendor/sub/docs/index.md')) && !existsSync(join(R, 'vendor/sub/index.md')));
  res = run('coverage', R);
  eq('AC-37 and coverage does not demand what it cannot see', res.rc, 0);
  hasNot('AC-37 the submodule document is never named', res.out, 'THEIRS.md');
}

// ---------- AC-38 a tracked document inside a separate work tree gets the remedy ----------
// The reachable version of this: a vendored tree the parent tracks, materialised from upstream by
// a copy that brings the `.git` pointer along with it. The parent's index still lists the files,
// so coverage demands them, while the walk refuses to enter — an unclearable finding, the same
// dead end as the dot-directory case, and it needs the same treatment.
R = repo('vendored', { unreachable: false });
write(join(R, 'vendor/copy/GUIDE.md'), '# Vendored guide\n');
git(R, 'add', '-A');
write(join(R, 'vendor/copy/.git'), 'gitdir: ../../.git/modules/copy\n');
describeAll(R);
res = run('coverage', R);
eq('AC-38 the tracked document inside it is still demanded', res.rc, 1);
has('AC-38 and named', res.out, 'unindexed: vendor/copy/GUIDE.md');
has('AC-38 the reason the walk cannot clear it is stated', res.out, 'separate git work tree');
has('AC-38 with the remedy, and where indexing it belongs instead', res.out, 'never from here');
hasNot('AC-38 control: the dot-directory advice does not fire here', res.out, 'dot-directory');
write(join(R, '.okfignore'), 'vendor/copy/\n');
eq('AC-38 control: declaring it unowned is what clears it', run('coverage', R).rc, 0);

// ---------- AC-36 no repository means nothing was verified ----------
const bare = join(WORK, 'not-a-repo');
mkdirSync(bare, { recursive: true });
write(join(bare, 'docs/thing.md'), '# thing\n');
res = run('coverage', bare);
eq('AC-36 outside a git work tree the answer is 77, never 0', res.rc, 77);
has('AC-36 and says nothing was verified', res.out, 'nothing was verified');

h.done();
