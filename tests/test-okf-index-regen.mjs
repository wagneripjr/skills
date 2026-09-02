#!/usr/bin/env node
// test-okf-index-regen.mjs — acceptance matrix for hooks/okf-index-regen.mjs (FR-OKF-6 (ii))
//
// The hook writes files in a repository it derives itself, which is the whole risk: derive the
// wrong repository and it rewrites one tree's indexes while the edited tree stays stale, with no
// error on either side. So every assertion here names WHICH repository was written, never just
// that something was.
//
// git is a hard prerequisite — the root is resolved with `git rev-parse --show-toplevel` — so this
// suite owns its own 77 rather than reporting a pass it never earned.
//
//   AC-47 a document edit in an OKF repository regenerates that repository's indexes
//   AC-48 CANARY: the root comes from the EDITED FILE, never the session cwd. Two repositories,
//              the payload's cwd pointing at the wrong one: the edited repo is written and the
//              session repo is untouched. Covers a linked worktree and a submodule, which are
//              the two shapes this actually takes in a session
//   AC-49 a relative file_path is resolved against the payload's cwd, not the process cwd
//   AC-50 refusals write nothing: a non-markdown file, an index.md (which would recurse), a
//              repository with no okf.yaml (it never adopted OKF), a path named in .okfignore
//   AC-51 an index carrying no generation marker is never rewritten — the hook is a client of
//              the same ownsIndex rule, so a dialect's richer rows survive an edit beside them
//   AC-52 version skew is refused BEFORE any write and says why on stderr: an older installed
//              plugin regenerating a repository that declares a newer dialect drops every row
//              that dialect carries. The marker is versionless, so the declaration is the
//              only evidence there is. CANARY both ways — an equal or older declaration writes
//   AC-53 fail-open and quiet: every path exits 0 with `{}` on stdout, including garbage input,
//              a file that does not exist, and a payload with no file_path. A PostToolUse hook
//              that can block an edit trades a stale index for a stuck session
//   AC-54 a regeneration that changes nothing leaves mtime alone — a no-op write churns the
//              working tree and re-fires every watcher downstream of it
//
// Exit: 0 pass · 1 fail · 77 skipped. See tests/lib/harness.mjs.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, skip } from './lib/harness.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(DIR, '..', 'hooks', 'okf-index-regen.mjs');

if (!existsSync(HOOK)) skip(`okf-index-regen.mjs not found at ${HOOK}`);
if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) {
  skip('git is unavailable; the hook resolves its root with git rev-parse');
}

const h = new Harness('okf-index-regen — the edited repository is the one that gets written');
const WORK = h.mkTemp('okf-hook-');

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
const doc = (p, title, description) =>
  write(p, `---\ntype: Note\ntitle: ${title}\ndescription: ${description}\n---\n\nbody\n`);
const eq = (name, actual, expected) =>
  h.check(name, actual === expected, `expected [${expected}] got [${actual}]`);
const has = (name, hay, needle) => h.check(name, hay.includes(needle), `got: ${hay.trim()}`);
const hasNot = (name, hay, needle) => h.check(name, !hay.includes(needle), `unexpectedly found: ${needle}`);

// The hook's whole contract on the wire: a payload on stdin, `{}` on stdout, exit 0.
const fire = (cwd, filePath) => {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd, tool_name: 'Edit', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    cwd,
  });
  return { rc: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
};

// An adopted OKF repository with one document and no indexes yet.
function repo(name, { manifest = 'okf_version: "0.2"\n' } = {}) {
  const r = join(WORK, name);
  mkdirSync(r, { recursive: true });
  git(r, 'init', '-q', '.');
  if (manifest !== null) write(join(r, 'docs/okf.yaml'), manifest);
  doc(join(r, 'docs/alpha.md'), 'Alpha', 'The alpha document.');
  return r;
}

const indexed = (r) => existsSync(join(r, 'docs/index.md'));

// ---------- AC-47 the ordinary case ----------
let R = repo('plain');
let res = fire(R, join(R, 'docs/alpha.md'));
eq('AC-47 exits 0', res.rc, 0);
eq('AC-47 emits an empty JSON envelope', res.out.trim(), '{}');
h.check('AC-47 the folder index was written', indexed(R));
h.check('AC-47 and the root index too', existsSync(join(R, 'index.md')));
has('AC-47 the document is listed by title', readFileSync(join(R, 'docs/index.md'), 'utf8'), '[Alpha](alpha.md)');

// ---------- AC-48 CANARY: the root is the edited file's, never the session's ----------
// This is the defect the hook exists not to have. A cwd default writes the session repository's
// indexes and leaves the edited one stale — the wrong tree changed, the right tree not, silently.
const SESSION = repo('session');
const OTHER = repo('other');
res = fire(SESSION, join(OTHER, 'docs/alpha.md'));
eq('AC-48 still exits 0', res.rc, 0);
h.check('AC-48 CANARY: the EDITED repository is the one written', indexed(OTHER));
h.check('AC-48 and the session repository is untouched', !indexed(SESSION),
  'the hook resolved its root from cwd — this is the bug it exists to not have');

// a linked worktree: a real second work tree of the same repository, on disk elsewhere
const WT = join(WORK, 'session-wt');
git(SESSION, 'add', '-A');
git(SESSION, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'base');
const wtAdded = git(SESSION, 'worktree', 'add', '-q', '-b', 'side', WT).status === 0;
if (!wtAdded) {
  h.bad('AC-48 could not create a linked worktree', 'git worktree add failed');
} else {
  doc(join(WT, 'docs/beta.md'), 'Beta', 'Only in the worktree.');
  res = fire(SESSION, join(WT, 'docs/beta.md'));
  has('AC-48 a linked worktree indexes its own tree',
    readFileSync(join(WT, 'docs/index.md'), 'utf8'), '[Beta](beta.md)');
  const mainIndex = existsSync(join(SESSION, 'docs/index.md'))
    ? readFileSync(join(SESSION, 'docs/index.md'), 'utf8') : '';
  hasNot('AC-48 and the document it does not contain stays out of the main tree', mainIndex, 'beta.md');
}

// a submodule: a repository the parent only pins by SHA. Writing into it from the parent's
// session edits somebody else's repository, which is the same defect wearing a second hat.
const PARENT = repo('parent');
const SUB = repo('sub-src');
git(SUB, 'add', '-A');
git(SUB, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'sub');
const subAdded = git(PARENT, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', SUB, 'vendor/sub').status === 0;
if (!subAdded) {
  h.bad('AC-48 could not add a submodule', 'git submodule add failed');
} else {
  doc(join(PARENT, 'vendor/sub/docs/gamma.md'), 'Gamma', 'Inside the submodule.');
  fire(PARENT, join(PARENT, 'vendor/sub/docs/gamma.md'));
  h.check('AC-48 an edit inside a submodule indexes the SUBMODULE',
    existsSync(join(PARENT, 'vendor/sub/docs/index.md')));
  h.check('AC-48 and never the parent that only pins it', !indexed(PARENT),
    'the parent repository was regenerated for an edit that was not its own');
}

// ---------- AC-49 a relative file_path ----------
R = repo('relative');
res = fire(R, 'docs/alpha.md');
h.check('AC-49 a relative path is resolved against the payload cwd', indexed(R));

// ---------- AC-50 the refusals ----------
const refuses = (label, setup) => {
  const r = repo(`refuse-${label}`);
  const target = setup(r);
  const out = fire(r, target);
  eq(`AC-50 ${label}: exits 0`, out.rc, 0);
  h.check(`AC-50 ${label}: writes nothing`, !indexed(r));
};
refuses('non-markdown', (r) => { write(join(r, 'docs/data.json'), '{}\n'); return join(r, 'docs/data.json'); });
{
  // An index edit must not regenerate: the hook writes indexes, so reacting to one is a loop
  // waiting for a reason. Asserted on the bytes, since the file it must not touch already exists.
  const r = repo('refuse-index-edit');
  const HAND = '# Docs\n';
  write(join(r, 'docs/index.md'), HAND);
  const out = fire(r, join(r, 'docs/index.md'));
  eq('AC-50 an index.md edit: exits 0', out.rc, 0);
  eq('AC-50 an index.md edit: the index is left exactly as it was',
    readFileSync(join(r, 'docs/index.md'), 'utf8'), HAND);
  h.check('AC-50 an index.md edit: and no sibling index appeared either',
    !existsSync(join(r, 'index.md')));
}
refuses('an okfignored path', (r) => { write(join(r, '.okfignore'), 'docs/\n'); return join(r, 'docs/alpha.md'); });
{
  const r = repo('refuse-unadopted', { manifest: null });
  const out = fire(r, join(r, 'docs/alpha.md'));
  eq('AC-50 no okf.yaml: exits 0', out.rc, 0);
  h.check('AC-50 no okf.yaml: a repository that never adopted OKF is left alone', !indexed(r));
  // control: the same tree WITH a manifest is written, so the refusal is the manifest rule
  // and not the hook having quietly stopped working.
  write(join(r, 'docs/okf.yaml'), 'okf_version: "0.2"\n');
  fire(r, join(r, 'docs/alpha.md'));
  h.check('AC-50 control: adopting it brings the regeneration back', indexed(r));
}
{
  // control for the .okfignore refusal, same shape.
  const r = repo('refuse-ignored-control');
  fire(r, join(r, 'docs/alpha.md'));
  h.check('AC-50 control: without .okfignore the same edit is indexed', indexed(r));
}

// ---------- AC-51 a foreign index is never rewritten ----------
R = repo('foreign');
const FOREIGN = '# Docs\n\n* [Alpha](alpha.md) - id: FR-001, status: Accepted\n';
write(join(R, 'docs/index.md'), FOREIGN);
res = fire(R, join(R, 'docs/alpha.md'));
eq('AC-51 an index with no generation marker is left byte-identical',
  readFileSync(join(R, 'docs/index.md'), 'utf8'), FOREIGN);
has('AC-51 and the refusal is reported', res.err, 'foreign-index: docs/index.md');

// ---------- AC-52 version skew ----------
R = repo('skew', { manifest: 'okf_version: "0.9"\n' });
res = fire(R, join(R, 'docs/alpha.md'));
eq('AC-52 exits 0 — a refusal is not a failure', res.rc, 0);
h.check('AC-52 CANARY: a newer declared dialect is not regenerated by an older generator', !indexed(R));
has('AC-52 and the reason is on stderr', res.err, 'declares OKF v0.9');
has('AC-52 with what would have been lost', res.err, 'would drop every row');
has('AC-52 and what to do about it', res.err, 'Update the wagner-skills plugin');

// control: an equal declaration writes. Without this the canary is satisfied by a hook that
// simply never writes anything, which is the same green from the wrong side.
R = repo('skew-equal', { manifest: 'okf_version: "0.2"\n' });
fire(R, join(R, 'docs/alpha.md'));
h.check('AC-52 control: an equal declaration is regenerated normally', indexed(R));
// control: an OLDER declaration writes too — the refusal is one-directional on purpose
R = repo('skew-older', { manifest: 'okf_version: "0.1"\n' });
fire(R, join(R, 'docs/alpha.md'));
h.check('AC-52 control: an older declaration is regenerated, not refused', indexed(R));
// canary: the root index's own stamp counts as a declaration too — it is what the generator
// that last wrote the catalog claimed, and the manifest can be silent.
R = repo('skew-stamp', { manifest: 'name: demo\n' });
write(join(R, 'index.md'), '---\nokf_version: "0.9"\n---\n\n# Other\n');
res = fire(R, join(R, 'docs/alpha.md'));
h.check('AC-52 CANARY: the root index stamp is a declaration as well', !indexed(R));
has('AC-52 and it is named as the source', res.err, 'index.md declares OKF v0.9');

// ---------- AC-53 fail-open and quiet ----------
for (const [label, payload] of [
  ['garbage on stdin', 'not json at all'],
  ['an empty payload', '{}'],
  ['no file_path', JSON.stringify({ cwd: WORK, tool_input: {} })],
  ['a file that does not exist', JSON.stringify({ cwd: WORK, tool_input: { file_path: join(WORK, 'nope/x.md') } })],
]) {
  const r = spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8', cwd: WORK });
  eq(`AC-53 ${label}: exits 0`, r.status ?? 1, 0);
  eq(`AC-53 ${label}: still emits {}`, (r.stdout ?? '').trim(), '{}');
}

// ---------- AC-54 an unchanged index keeps its mtime ----------
R = repo('idempotent');
fire(R, join(R, 'docs/alpha.md'));
const target = join(R, 'docs/index.md');
const before = readFileSync(target, 'utf8');
const stamp = new Date(Date.now() - 60_000);
utimesSync(target, stamp, stamp);
const mtimeBefore = statSync(target).mtimeMs;
fire(R, join(R, 'docs/alpha.md'));
eq('AC-54 the content is unchanged', readFileSync(target, 'utf8'), before);
eq('AC-54 and so is mtime — a no-op write is not free', statSync(target).mtimeMs, mtimeBefore);
// control: a real change does rewrite it
doc(join(R, 'docs/delta.md'), 'Delta', 'A new document.');
fire(R, join(R, 'docs/delta.md'));
has('AC-54 control: a real change is written', readFileSync(target, 'utf8'), '[Delta](delta.md)');

h.done();
