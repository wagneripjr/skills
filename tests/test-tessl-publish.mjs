#!/usr/bin/env node
// test-tessl-publish.mjs — the Tessl publish manifests and their discovery, asserted with no
// account, no network and no credits (FR-TESSL-3).
//   AC-1 discovery scope — every manifest discovery returns sits at a skill dir or a plugin root
//   AC-2 ignored paths   — a gitignored vendored manifest is NEVER returned
//   AC-3 manifest shape  — name, version, description present; private:false; skills self-scoped
//   AC-4 no version drift— a .claude-plugin twin, where one exists, agrees on version
//   AC-5 evals excluded  — a skill dir holding evals/ also holds a .tesslignore naming it
//   AC-6 no literals     — the publish script hardcodes no plugin name and no version
//   AC-7 mutants         — each guard flags a planted defect and clears the real tree
//
// AC-2 is the point of the suite. `tessl install` leaves other workspaces' plugins on disk under
// .tessl/plugins/, each with its own .tessl-plugin/plugin.json. A filesystem walk finds them and
// would publish somebody else's plugin out of this repository. Discovery is git-anchored so that
// .gitignore hides them; this asserts the anchoring rather than trusting it.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, skip } from './lib/harness.mjs';
import { discover, manifestOf, classifyInfo } from '../scripts/tessl-publish.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST = join('.tessl-plugin', 'plugin.json');
const SKILL_ROOTS = ['skills', 'doc-this/skills'];

const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
if (git(['rev-parse', '--git-dir'], ROOT).status !== 0) {
  skip('git is required: discovery is anchored on `git ls-files`');
}

// A foreign enumerator over the tree, independent of what discovery returns.
function skillDirs(root = ROOT) {
  const found = [];
  for (const base of SKILL_ROOTS) {
    const dir = resolve(root, base);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md'))) found.push(join(base, e.name));
    }
  }
  return found;
}

const h = new Harness('tessl publish manifests, discovery and its ignored-path guard');
const found = discover();
const skills = skillDirs();
// doc-this is a plugin root without being a skill dir; skills/* are both.
const PLUGIN_ROOTS = new Set([...skills, 'doc-this']);

h.section('AC-1 discovery scope');
h.check('discovery returned at least one plugin', found.length > 0, `found ${found.length}`);
const stray = found.filter((p) => !PLUGIN_ROOTS.has(p));
h.check('every discovered plugin is a skill dir or the doc-this root', stray.length === 0,
  `unexpected: ${stray.join(', ')}`);

h.section('AC-2 ignored paths are never discovered');
const ignored = found.filter((p) => p.split('/').some((seg) => seg.startsWith('.')));
h.check('no discovered plugin sits under a dot-directory', ignored.length === 0,
  `would publish another workspace's plugin: ${ignored.join(', ')}`);

h.section('AC-3 manifest shape');
for (const p of found) {
  const raw = JSON.parse(readFileSync(resolve(ROOT, p, MANIFEST), 'utf8'));
  h.check(`${p}: name is workspace-scoped`, /^[^/]+\/[^/]+$/.test(raw.name || ''), `name=${raw.name}`);
  h.check(`${p}: has version and description`, Boolean(raw.version && raw.description));
  h.equal(`${p}: private is false`, raw.private, false);
  const declared = [].concat(raw.skills ?? []);
  const escapes = declared.filter((s) => s.startsWith('..') || s.startsWith('/'));
  h.check(`${p}: skills stays inside the plugin root`, escapes.length === 0, escapes.join(', '));
}

h.section('AC-4 no version drift against a .claude-plugin twin');
for (const p of found) {
  let ok = true;
  try { manifestOf(p); } catch (e) { ok = false; h.bad(`${p}: ${e.message}`); }
  if (ok) h.ok(`${p}: manifest resolves with no drift`);
}

// A .tesslignore sits at a PLUGIN root, which is the skill's own directory for a solo plugin and
// the bundle root for a skill inside one. Walk up and accept an ignore at any level that names
// the evals path relative to itself, so the check survives a skill moving between the two shapes.
export function evalsIgnored(skillDir, root = ROOT) {
  const parts = skillDir.split('/');
  for (let i = parts.length; i > 0; i -= 1) {
    const owner = parts.slice(0, i).join('/');
    const file = resolve(root, owner, '.tesslignore');
    if (!existsSync(file)) continue;
    const rel = [...parts.slice(i), 'evals'].join('/');
    const wanted = new RegExp(`^\\s*${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?\\s*$`, 'm');
    if (wanted.test(readFileSync(file, 'utf8'))) return owner;
  }
  return null;
}

h.section('AC-5 in-skill evals are excluded from the pack');
for (const dir of skills) {
  if (!existsSync(resolve(ROOT, dir, 'evals'))) continue;
  const owner = evalsIgnored(dir);
  h.check(`${dir}: evals/ is named in a .tesslignore (at ${owner ?? 'nowhere'})`, owner !== null,
    'packed evals become input to the judge that grades this same skill');
}

h.section('AC-6 the script carries no plugin name or version literal');
const script = readFileSync(resolve(ROOT, 'scripts', 'tessl-publish.mjs'), 'utf8');
const code = script.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
h.check('no semver literal in code', !/["'`]\d+\.\d+\.\d+["'`]/.test(code));
h.check('no plugin name literal in code', !/wagneripjr\/[a-z]/.test(code));

h.section('AC-7 mutants (each must be flagged)');
const tmp = h.mkTemp('tessl-publish-');
git(['init', '-q'], tmp);
writeFileSync(join(tmp, '.gitignore'), '.tessl/plugins/\n');
const plant = (rel, body) => {
  mkdirSync(join(tmp, dirname(rel)), { recursive: true });
  writeFileSync(join(tmp, rel), body);
};
// The real hazard: a vendored plugin installed by `tessl install`, gitignored but on disk.
plant(join('.tessl', 'plugins', 'vendor', 'thing', MANIFEST), '{"name":"vendor/thing"}');
plant(join('skills', 'mine', MANIFEST), '{"name":"me/mine","version":"1.0.0"}');
const mutantFound = discover({ root: tmp });
h.check('AC-7a the gitignored vendored manifest is NOT discovered',
  !mutantFound.includes(join('.tessl', 'plugins', 'vendor', 'thing')),
  `discovered: ${mutantFound.join(', ')}`);
h.check('AC-7b the ordinary manifest IS discovered', mutantFound.includes(join('skills', 'mine')),
  `discovered: ${mutantFound.join(', ')}`);

plant(join('drift', MANIFEST), '{"name":"me/drift","version":"1.0.0","description":"d"}');
plant(join('drift', '.claude-plugin', 'plugin.json'), '{"name":"drift","version":"2.0.0"}');
let drifted = false;
try { manifestOf('drift', { root: tmp }); } catch { drifted = true; }
h.check('AC-7c a version disagreeing with its .claude-plugin twin is rejected', drifted);

plant(join('nover', MANIFEST), '{"name":"me/nover","description":"d"}');
let missing = false;
try { manifestOf('nover', { root: tmp }); } catch { missing = true; }
h.check('AC-7d a manifest with no version is rejected', missing);

h.check('AC-7e a "could not find plugin" exit is a publish signal, not an error',
  classifyInfo({ status: 1, stderr: 'Could not find plugin "x/y".' }).state === 'absent');
h.check('AC-7f any other non-zero exit is an error, not a publish signal',
  classifyInfo({ status: 1, stderr: 'network unreachable' }).state === 'error');
h.check('AC-7g exit 0 means published', classifyInfo({ status: 0 }).state === 'published');

h.done();
