#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.argv.includes('--version')) {
  const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
  process.stdout.write(`${manifest.metadata.version}\n`);
  process.exit(0);
}
const source = readFileSync(join(root, 'scripts/lib/codex-tools.mjs'), 'utf8');
const check = process.argv.includes('--check');
for (const plugin of ['doc-this', 'okf-maintain']) {
  const target = join(root, 'plugins', plugin, 'hooks/lib/codex-tools.mjs');
  let actual;
  try { actual = readFileSync(target, 'utf8'); } catch {}
  if (actual === source) continue;
  if (check) {
    process.stderr.write(`Host adapter copy differs: ${target}\n`);
    process.exitCode = 1;
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
}
