#!/usr/bin/env node
// tessl-publish.mjs — publish this repository's plugins to the Tessl registry (FR-TESSL-3).
//
// Why a script rather than two `run:` lines: publishing an already-published version is an error,
// so an unconditional workflow would go red on every commit that does not bump. The fix is a
// runtime idempotency check, never a `paths:` filter — CD runs unconditionally.
//
// A publish also triggers a paid auto-review server-side ("When you publish a plugin to the
// registry, Tessl lints and reviews it automatically"), so skipping an unchanged version is what
// keeps every master push from spending credits against a cap with no overage.
//
// Zero dependencies. spawnSync with an argv array, never a shell (ADR-014). Node >= 18.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKSPACE = 'wagneripjr';
const MANIFEST = join('.tessl-plugin', 'plugin.json');

// Discovery is ANCHORED ON GIT, not a filesystem walk, and that is load-bearing rather than
// stylistic. A plain walk for .tessl-plugin/plugin.json also finds
// .tessl/plugins/<vendor>/<plugin>/.tessl-plugin/plugin.json — a plugin installed by
// `tessl install`, belonging to somebody else's workspace, still on disk because it is
// gitignored rather than deleted. Publishing that would push another workspace's plugin out of
// this one.
//
// --cached --others --exclude-standard is the FR-OKF-3 combination, for the same two reasons:
// --exclude-standard honours .gitignore so the vendored copy is invisible, and --others still
// sees a manifest added in the very commit being published, which plain --cached would miss.
export function discover({ root = ROOT, git = runGit } = {}) {
  const out = git(['ls-files', '--cached', '--others', '--exclude-standard', `*${MANIFEST}`], root);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rel) => rel.slice(0, rel.length - MANIFEST.length - 1) || '.')
    .sort();
}

function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim() || r.status}`);
  }
  return r.stdout;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Where a plugin also ships through the Claude Code marketplace, the same bytes carry two version
// numbers in two manifests. Two hand-edited copies of one number is drift waiting to happen, so
// the disagreement fails here, at the moment it would ship, not only in a harness someone skipped.
export function manifestOf(pluginPath, { root = ROOT } = {}) {
  const base = resolve(root, pluginPath);
  const tessl = readJson(join(base, MANIFEST));
  for (const key of ['name', 'version', 'description']) {
    if (!tessl[key]) throw new Error(`${pluginPath}: ${MANIFEST} has no ${key}`);
  }
  let claude;
  try { claude = readJson(join(base, '.claude-plugin', 'plugin.json')); } catch { claude = null; }
  if (claude?.version && claude.version !== tessl.version) {
    throw new Error(
      `${pluginPath}: version drift — .claude-plugin says ${claude.version}, ` +
      `.tessl-plugin says ${tessl.version}. Realign both before publishing.`,
    );
  }
  return { name: tessl.name, version: tessl.version };
}

const runTessl = (args) =>
  spawnSync('tessl', args, { encoding: 'utf8', env: { ...process.env, AGENT: '1' } });

// `plugin info` exits non-zero both when the version is genuinely absent and when the call failed.
// Only the first is a publish signal; treating every non-zero exit as "not published" turns an
// outage or an expired token into a spurious publish attempt.
//
// Absence has TWO spellings and only one of them was known before the first version bump. A
// plugin nobody has ever published answers "Could not find plugin"; one that exists at an older
// version answers `Plugin "w/p" exists, but it has no version "1.1.0"`. Reading the second as an
// outage makes every bump after the initial publish refuse to ship — which is exactly what the
// 1.0.0 -> 1.1.0 repackaging hit, on all nine plugins at once.
const ABSENT = [/could not find plugin/i, /exists, but it has no version/i];

export function classifyInfo({ status, stdout = '', stderr = '', error }) {
  if (error) return { state: 'error', detail: String(error.message || error) };
  if (status === 0) return { state: 'published' };
  const text = `${stdout}${stderr}`;
  if (ABSENT.some((re) => re.test(text))) return { state: 'absent' };
  return { state: 'error', detail: text.trim() || `exit ${status}` };
}

// --dry-run exists because the only other way to exercise this script is to publish for real,
// and a publish is irreversible: `private: false` cannot be undone and `unpublish` closes after
// two days. A script whose sole mode is the irreversible one will eventually be run by hand as a
// "quick check". This one was, on 2026-09-06, and the plugin had to be unpublished.
function main(argv = []) {
  const dryRun = argv.includes('--dry-run');
  const plugins = discover();
  if (plugins.length === 0) {
    process.stderr.write(`no ${MANIFEST} found — nothing to publish\n`);
    return 1;
  }
  process.stdout.write(`discovered ${plugins.length} plugin(s): ${plugins.join(', ')}\n`);

  let failed = false;
  for (const pluginPath of plugins) {
    const { name, version } = manifestOf(pluginPath);
    const ref = `${name}@${version}`;

    const info = classifyInfo(runTessl(['plugin', 'info', ref, '--json']));
    if (info.state === 'error') {
      process.stderr.write(`${ref}: cannot determine registry state — ${info.detail}\n`);
      failed = true;
      continue;
    }
    if (info.state === 'published') {
      process.stdout.write(`${ref}: already published, nothing to do\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(`${ref}: would publish (--dry-run)\n`);
      continue;
    }

    process.stdout.write(`${ref}: publishing\n`);
    // No --version: the CLI refuses the flag when the manifest declares one, and it always does
    // here — `tessl plugin pack` hard-refuses a manifest without a version.
    // Evals upload on purpose, so no --skip-evals. A skill with no eval coverage is shown at 80%
    // of its review score on the registry, ramping to full weight at three or more scenarios, and
    // search ranking is docked with it (Tessl web changelog, 2026-05-13). Publish reads evals/
    // through the same scenario reader `tessl eval lint` uses, NOT through the pack, so the
    // `evals/` line in each .tesslignore still keeps them out of the review bundle, where they
    // would otherwise be handed to the judge grading the skill they belong to.
    const published = runTessl([
      'plugin', 'publish', pluginPath,
      '--workspace', WORKSPACE,
    ]);
    process.stdout.write(published.stdout || '');
    if (published.status !== 0) {
      process.stderr.write(published.stderr || `publish exited ${published.status}\n`);
      failed = true;
      continue;
    }
    process.stdout.write(`${ref}: published\n`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
