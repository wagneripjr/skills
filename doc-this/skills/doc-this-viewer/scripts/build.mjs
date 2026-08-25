#!/usr/bin/env node
// Maintenance-only: compile the Svelte viewer into assets/dist/ (the prebuilt bundle
// that ships with the skill and is served at runtime — runtime never builds).
//
// Requires npm on PATH. After running, commit the refreshed assets/dist/.
//
// Usage: build.mjs

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(SCRIPT_DIR, '..');
const APP_DIR = join(SKILL_DIR, 'app');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (args) => spawnSync(npm, args, { cwd: APP_DIR, stdio: 'inherit' });

if (run(['--version']).status !== 0) {
  process.stderr.write('error: npm not found on PATH (Node + npm are required to build the viewer).\n');
  process.exit(1);
}

if (!existsSync(APP_DIR)) {
  process.stderr.write(`error: app dir missing: ${APP_DIR}\n`);
  process.exit(1);
}

const install = existsSync(join(APP_DIR, 'package-lock.json')) ? ['ci'] : ['install'];
if (run(install).status !== 0) process.exit(1);
if (run(['run', 'build']).status !== 0) process.exit(1);

if (!existsSync(join(SKILL_DIR, 'assets', 'dist', 'index.html'))) {
  process.stderr.write('error: build did not produce assets/dist/index.html\n');
  process.exit(1);
}

process.stdout.write(`built viewer → ${join(SKILL_DIR, 'assets', 'dist')}/\n`);
