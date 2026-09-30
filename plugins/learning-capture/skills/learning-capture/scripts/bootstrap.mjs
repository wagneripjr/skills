#!/usr/bin/env node
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEMPLATES = ['LEARNINGS.md', 'ERRORS.md', 'FEATURE_REQUESTS.md'];
export const ABSENT_BY_DECISION_EXIT = 3;

const ASSETS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function gitignoreLines(root) {
  try {
    return readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

export function learningsDecision(root) {
  if (isDirectory(join(root, '.learnings'))) return 'present';
  if (gitignoreLines(root).some((line) => /^\/?\.learnings\/?$/.test(line.trim()))) return 'absent-by-decision';
  return 'may-create';
}

export function bootstrap(root, assets = ASSETS) {
  const decision = learningsDecision(root);
  if (decision === 'absent-by-decision') return { decision, created: [], kept: [] };
  const dir = join(root, '.learnings');
  mkdirSync(dir, { recursive: true });
  const created = [];
  const kept = [];
  for (const name of TEMPLATES) {
    const target = join(dir, name);
    if (existsSync(target)) {
      kept.push(name);
      continue;
    }
    try {
      copyFileSync(join(assets, name), target, constants.COPYFILE_EXCL);
      created.push(name);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      kept.push(name);
    }
  }
  return { decision, created, kept };
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write('Usage: bootstrap.mjs [repo-root]\n\nCreate .learnings/ with the entry templates, unless the repository removed it by decision.\nExit: 0 created or already present, 1 error, 3 absent-by-decision (nothing written).\n');
    return 0;
  }
  if (argv.length > 1) {
    process.stderr.write(`error: expected at most one argument, got ${argv.length}\n`);
    return 1;
  }
  const root = resolve(argv[0] ?? process.cwd());
  if (!isDirectory(root)) {
    process.stderr.write(`error: not a directory: ${root}\n`);
    return 1;
  }
  let result;
  try {
    result = bootstrap(root);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 1;
  }
  process.stdout.write(`decision: ${result.decision}\n`);
  if (result.decision === 'absent-by-decision') {
    process.stdout.write(
      `${join(root, '.gitignore')} lists .learnings/ and the directory is absent: the corpus was removed on purpose.\n` +
      'Nothing was written. Capture to machine-local memory instead: write the full entry to learnings.md in the\n' +
      "host's per-project memory directory outside the repository, then tell the user that path and why.\n",
    );
    return ABSENT_BY_DECISION_EXIT;
  }
  for (const name of result.created) process.stdout.write(`created: .learnings/${name}\n`);
  for (const name of result.kept) process.stdout.write(`kept: .learnings/${name}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
