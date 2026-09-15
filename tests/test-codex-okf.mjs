#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, runNode, skip } from './lib/harness.mjs';

if (spawnSync('git', ['--version']).status !== 0) skip('git is required');
const h = new Harness('Codex patches regenerate the edited OKF repositories');
const work = h.mkTemp('codex-okf-');
const hook = fileURLToPath(new URL('../plugins/okf-maintain/hooks/codex-index-regen.mjs', import.meta.url));
const write = (path, body) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); };
function repo(name) {
  const root = join(work, name);
  mkdirSync(root);
  const result = spawnSync('git', ['init', '-q', root]);
  if (result.status !== 0) throw new Error('git init failed');
  write(join(root, 'docs/okf.yaml'), 'okf_version: "0.2"\n');
  write(join(root, 'docs/alpha.md'), '# Alpha\n');
  return root;
}
function fire(cwd, patch) {
  const result = runNode(hook, { input: JSON.stringify({ session_id: 'fixture', hook_event_name: 'PostToolUse', cwd, tool_name: 'apply_patch', tool_use_id: 'fixture-call', tool_input: { command: patch }, tool_response: 'Success. Updated the following files.' }), cwd });
  h.equal('post-tool hook exits successfully', result.code, 0);
  h.equal('post-tool hook preserves native empty output', result.stdout.trim(), '{}');
  return result;
}
const session = repo('session');
const a = repo('a');
const b = repo('b');
fire(session, `*** Begin Patch\n*** Add File: ${a}/docs/alpha.md\n+# Alpha\n*** Add File: ${b}/docs/alpha.md\n+# Alpha\n*** End Patch`);
h.check('first edited repository is regenerated', existsSync(join(a, 'docs/index.md')));
h.check('second edited repository is regenerated', existsSync(join(b, 'docs/index.md')));
h.check('unrelated session repository is untouched', !existsSync(join(session, 'index.md')));
renameSync(join(a, 'docs/alpha.md'), join(a, 'docs/beta.md'));
fire(a, '*** Begin Patch\n*** Update File: docs/alpha.md\n*** Move to: docs/beta.md\n@@\n # Alpha\n*** End Patch');
let index = readFileSync(join(a, 'docs/index.md'), 'utf8');
h.check('move adds the destination row', index.includes('(beta.md)'));
h.check('move removes the old row', !index.includes('(alpha.md)'));
rmSync(join(a, 'docs/beta.md'));
write(join(a, 'docs/remaining.md'), '# Remaining\n');
fire(a, '*** Begin Patch\n*** Delete File: docs/beta.md\n*** End Patch');
index = readFileSync(join(a, 'docs/index.md'), 'utf8');
h.check('deletion removes its row', !index.includes('(beta.md)'));
h.check('deletion preserves remaining documents', index.includes('(remaining.md)'));
const importCheck = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL('../plugins/okf-maintain/hooks/okf-index-regen.mjs', import.meta.url).href)}); console.log('imported');`], { encoding: 'utf8' });
h.equal('shared Claude module can be imported without consuming stdin or emitting hook output', importCheck.stdout.trim(), 'imported');
const invalid = runNode(hook, { input: 'invalid', cwd: work });
h.equal('invalid native input retains existing fail-open behavior', invalid.code, 0);
h.equal('invalid native input emits an empty response', invalid.stdout.trim(), '{}');
h.done();
