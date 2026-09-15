#!/usr/bin/env node
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from './lib/harness.mjs';

const h = new Harness('Native entry points execute through installed symlink paths');
const temporary = h.mkTemp('host-entrypoints-');
const plugins = fileURLToPath(new URL('../plugins', import.meta.url));
const installed = join(temporary, 'installed plugins');
symlinkSync(plugins, installed, process.platform === 'win32' ? 'junction' : 'dir');
const entries = [
  ['okf-maintain/skills/okf-maintain/scripts/okf.mjs', '--version', /^okf\.mjs \d+\.\d+\.\d+ \(OKF v[^)]+\)\s*$/],
  ['doc-this/skills/doc-this-viewer/scripts/launch.mjs', '--help', /doc-this-viewer launcher/],
  ['doc-this/hooks/doc-this-dispatch-gate.mjs', '--version', /^\d+\.\d+\.\d+\s*$/],
  ['doc-this/hooks/codex-hook-adapter.mjs', '--version', /^\d+\.\d+\.\d+\s*$/],
  ['okf-maintain/hooks/codex-index-regen.mjs', '--version', /^\d+\.\d+\.\d+\s*$/],
];
for (const [path, flag, output] of entries) {
  const result = runNode(join(installed, path), { args: [flag], cwd: temporary });
  h.equal(`${path} exits successfully`, result.code, 0);
  h.check(`${path} actually executes rather than silently exiting`, output.test(result.stdout), result.stderr || result.stdout);
}
const hook = runNode(join(installed, 'okf-maintain/hooks/okf-index-regen.mjs'), { input: '{}', cwd: temporary });
h.equal('Claude OKF hook executes through an installed symlink', hook.stdout.trim(), '{}');
h.done();
