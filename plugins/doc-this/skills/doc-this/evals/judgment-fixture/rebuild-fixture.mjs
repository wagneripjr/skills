#!/usr/bin/env node
// rebuild-fixture.mjs — recreate the doc-this judgment-bait fixture as a standalone git
// repo, ready to run /doc-this against. The canonical (final) source lives in ./app/; this
// script replays it into a fresh repo WITH the git-history bait (a feat→revert pair and a
// fix: commit) that exercises Detective's git history mining.
//
// Usage:  node rebuild-fixture.mjs [target-dir]
//         With no argument a fresh temp directory is created and printed.
//         An explicit target-dir must NOT already exist — this script refuses to
//         overwrite, because it would otherwise recursively delete whatever path
//         the caller happened to pass.
//
// Then:   cd <target-dir> && claude   →   /doc-this   (expect 0 judgment violations)

import { existsSync, mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP = join(SCRIPT_DIR, 'app');
const EXEMPT = '<!-- SDLC-EXEMPT : reason="throwaway doc-this test fixture, no FR" -->';
const SVC = 'src/service/todoService.ts';

const die = (msg, hint) => {
  process.stderr.write(`${msg}\n`);
  if (hint) process.stderr.write(`${hint}\n`);
  process.exit(1);
};

if (!existsSync(join(APP, 'src'))) die(`error: canonical source not found at ${join(APP, 'src')}`);

// Never recursively delete a caller-supplied path. Either we create the directory
// ourselves or we refuse an existing one and let the caller delete it deliberately.
let target = process.argv[2];
if (!target) {
  target = mkdtempSync(join(tmpdir(), 'doc-this-judgment-fixture-'));
} else if (existsSync(target)) {
  die(`error: ${target} already exists — refusing to overwrite.`,
    '       Remove it yourself, or omit the argument for a fresh temp directory.');
} else {
  mkdirSync(target, { recursive: true });
}

cpSync(APP, target, { recursive: true });

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: target, encoding: 'utf8' });
  if (r.status !== 0) die(`git ${args[0]} failed: ${r.stderr?.trim()}`);
  return r.stdout ?? '';
};
const commit = (subject, ...bodies) =>
  git('commit', '-q', '-m', subject, ...bodies.flatMap((b) => ['-m', b]));

const svcPath = join(target, SVC);
const readSvc = () => readFileSync(svcPath, 'utf8');
const writeSvc = (s) => writeFileSync(svcPath, s);

git('init', '-q');
git('config', 'user.name', 'Fixture Author');
git('config', 'user.email', 'fixture@example.com');
git('config', 'core.hooksPath', '/dev/null'); // isolate from the host repo's git hooks

// C4 state: service WITHOUT the past-due-date validation (added later by the fix: commit).
// Delete the 3-line block triggered by its unique guard line.
{
  const lines = readSvc().split('\n');
  const out = [];
  let skip = 0;
  for (const line of lines) {
    if (skip > 0) { skip--; continue; }
    if (/if \(dueDate !== null/.test(line)) { skip = 2; continue; }
    out.push(line);
  }
  writeSvc(out.join('\n'));
}

git('add', 'package.json', 'tsconfig.json', 'README.md', '.gitignore');
commit('chore: scaffold project structure');

git('add', 'src/domain/todo.ts', 'src/domain/user.ts');
commit('feat: add todo domain, lifecycle, and completion rule', EXEMPT);

git('add', 'src/repository/todoRepository.ts');
commit('feat: persist todos with 30-day soft-delete retention', EXEMPT);

git('add', SVC);
commit('feat: enforce per-user active-todo limit in service layer', EXEMPT);

git('add', 'src/api/server.ts');
commit('feat: use stateless bearer-token auth so web and mobile share one API',
  'Sessions were dropped in favor of bearer tokens to support mobile clients.', EXEMPT);

// C6: lower the active cap (feat) — then C7 reverts it.
writeSvc(readSvc().replace('MAX_ACTIVE_TODOS = 50', 'MAX_ACTIVE_TODOS = 20'));
git('add', SVC);
commit('feat: lower active-todo cap to 20', EXEMPT);

writeSvc(readSvc().replace('MAX_ACTIVE_TODOS = 20', 'MAX_ACTIVE_TODOS = 50'));
git('add', SVC);
commit('revert: "feat: lower active-todo cap to 20"',
  'Users complained 20 was too restrictive; restoring the original 50.');

// C8 fix: restore the canonical service (re-adds the past-due-date validation).
copyFileSync(join(APP, SVC), svcPath);
git('add', SVC);
commit('fix: reject todos created with a due date in the past', EXEMPT);

process.stdout.write(`Rebuilt fixture at: ${target}\n`);
process.stdout.write('--- git history ---\n');
process.stdout.write(git('--no-pager', 'log', '--oneline'));
process.stdout.write('\n');

if (readFileSync(join(APP, SVC), 'utf8') === readSvc()) {
  process.stdout.write('final working tree matches canonical app/ ✓\n');
} else {
  die(`WARNING: final working tree differs from canonical app/ — inspect ${svcPath}`);
}
process.stdout.write(`Ready: cd ${target} && run /doc-this (expect 0 judgment violations — see FINDINGS.md)\n`);
