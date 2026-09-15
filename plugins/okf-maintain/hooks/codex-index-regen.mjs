#!/usr/bin/env node
import { regenerateFile } from './okf-index-regen.mjs';
import { toolEdits } from './lib/codex-tools.mjs';
import { readFileSync } from 'node:fs';

if (process.argv.includes('--version')) {
  const manifest = JSON.parse(readFileSync(new URL('../.codex-plugin/plugin.json', import.meta.url), 'utf8'));
  process.stdout.write(`${manifest.version}\n`);
  process.exit(0);
}

try {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const event = JSON.parse(input);
  const paths = new Set(toolEdits(event).flatMap((edit) => [edit.file_path, edit.old_path].filter(Boolean)));
  for (const file of paths) {
    try { regenerateFile(file); } catch (error) {
      process.stderr.write(`okf-index-regen: ${error.message}\n`);
    }
  }
} catch (error) {
  process.stderr.write(`okf-index-regen: ${error.message}\n`);
}
process.stdout.write('{}\n');
