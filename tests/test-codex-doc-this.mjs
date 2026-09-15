#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from './lib/harness.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS = join(ROOT, 'plugins/doc-this/hooks');
const ADAPTER = join(HOOKS, 'codex-hook-adapter.mjs');
const h = new Harness('Codex doc-this native hook contracts');
const WORK = h.mkTemp('codex-doc-this-');
const TEMP = join(WORK, 'tmp');
mkdirSync(TEMP);
const env = { CODEX_HOME: join(WORK, 'codex'), TMPDIR: TEMP, TEMP, TMP: TEMP };
const session = `native-doc-this-${process.pid}`;
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
};
const state = (root, value) => write(join(root, '.doc-this/state.json'), value);
const complete = { phase: 'analysis', doc_level: 'standard', database_ownership: 'owned', checkpoints: { scout: true, code_analyst: true, detective: true, architect: true, writer: true } };
const project = (name, value) => {
  const root = join(WORK, name);
  mkdirSync(root);
  if (value) state(root, value);
  return root;
};
const fire = (root, tool, input, extra = {}) => {
  const result = runNode(ADAPTER, {
    cwd: root, env,
    input: JSON.stringify({ session_id: session, cwd: root, tool_name: tool, tool_input: input, hook_event_name: 'PreToolUse', ...extra }),
  });
  let output;
  try { output = JSON.parse(result.stdout); } catch { h.bad('adapter emits exactly one JSON envelope', result.stdout); output = {}; }
  h.equal(`${tool} exits 0 for the native JSON decision contract`, result.code, 0);
  return output.hookSpecificOutput || {};
};
const spawn = (root, worker, extra = {}) => fire(root, 'multi_agent_v1spawn_agent', { message: `DOC_THIS_WORKER=${worker}\nRead the worker instructions and execute the current phase.` }, extra);
const blocked = (name, result, reason) => h.check(name, result.permissionDecision === 'deny' && (!reason || result.permissionDecisionReason?.includes(reason)), JSON.stringify(result));
const allowed = (name, result) => h.check(name, result.permissionDecision !== 'deny', JSON.stringify(result));

h.section('Native dispatch normalizes every gate');
const absent = project('no-state');
for (const worker of ['scout', 'code-analyst', 'archaeologist', 'detective', 'architect', 'writer', 'reviewer']) {
  blocked(`${worker} cannot run without the anchor`, spawn(absent, `doc-this-${worker}`), 'dispatch-gate');
}
allowed('optional tracer remains independent', spawn(absent, 'doc-this-tracer'));
allowed('unrelated agent remains independent', fire(absent, 'collaboration.spawn_agent', { task_name: 'explorer', message: 'Inspect files.' }));
allowed('unrelated agent may quote a marker inline', fire(absent, 'spawn_agent', { task_name: 'audit_runtime', message: 'Review the host runtime documentation and explain the DOC_THIS_WORKER=doc-this-writer example.' }));
allowed('unrelated agent may quote a fenced marker example', fire(absent, 'spawn_agent', { task_name: 'audit_runtime', message: 'Review this documented example:\n```text\nDOC_THIS_WORKER=doc-this-writer\n```' }));
blocked('reserved worker task cannot omit the marker', fire(absent, 'collaboration.spawn_agent', { task_name: 'doc_this_writer', message: 'Execute the phase.' }), 'first message line');
blocked('reserved worker marker must be on first line', fire(absent, 'spawn_agent', { task_name: 'doc_this_writer', message: 'Please run\nDOC_THIS_WORKER=doc-this-writer' }), 'first message line');
blocked('unknown marked worker cannot silently bypass', spawn(absent, 'doc-this-unregistered'), 'supported');
const pipeline = project('pipeline', { checkpoints: { scout: true } });
blocked('missing handshakes reach the phase gate', spawn(pipeline, 'doc-this-code-analyst'), 'phase-gate');
state(pipeline, { ...complete, checkpoints: {} });
blocked('missing predecessor reaches the checkpoint gate', spawn(pipeline, 'doc-this-writer'), 'checkpoint-gate');
state(pipeline, complete);
write(join(pipeline, '.doc-this/context/file-manifest.json'), { files: [{ path: 'src/a.ts', class: 'source', subclass: 'code' }] });
blocked('unread source reaches coverage gate', spawn(pipeline, 'doc-this-detective'), 'analysis coverage');
write(join(pipeline, '.doc-this/context/coverage-ledger.json'), { files_analyzed: ['src/a.ts'] });
write(join(pipeline, '.doc-this/context/modules.json'), { modules: [{ name: 'a', all_files: ['src/a.ts'], entities: ['Entity'] }] });
blocked('missing data dictionary reaches artifact gate', spawn(pipeline, 'doc-this-detective'), 'artifact-completeness');
write(join(pipeline, '.doc-this-sdd/data-dictionary/a.md'), 'Entity exists.');
allowed('completed prerequisite artifacts allow detective', spawn(pipeline, 'doc-this-detective'));

h.section('Successful V1 and V2 identities protect untagged continuations');
const agents = project('agents', complete);
const v1 = 'native-fixture-agent';
const v2 = '/root/native_fixture_writer';
spawn(agents, 'doc-this-writer', { hook_event_name: 'PostToolUse', tool_response: JSON.stringify({ agent_id: v1, nickname: null }) });
fire(agents, 'collaboration.spawn_agent', { task_name: 'native_fixture_writer', message: 'DOC_THIS_WORKER=doc-this-writer\nExecute the writer.' }, {
  hook_event_name: 'PostToolUse', tool_response: JSON.stringify({ task_name: v2, nickname: null }),
});
state(agents, { ...complete, checkpoints: {} });
for (const [tool, input] of [
  ['multi_agent_v1send_input', { target: v1, message: 'Continue.' }],
  ['multi_agent_v1resume_agent', { id: v1 }],
  ['collaboration.followup_task', { target: v2, message: 'Continue.' }],
  ['collaboration.send_message', { target: v2, message: 'Continue.' }],
  ['followup_task', { target: 'native_fixture_writer', message: 'Continue.' }],
]) blocked(`${tool} cannot bypass gates by omitting its marker`, fire(absent, tool, input), 'checkpoint-gate');
blocked('continuation cannot relabel a registered writer', fire(agents, 'send_input', { target: v1, message: 'DOC_THIS_WORKER=doc-this-tracer\nContinue.' }), 'identity cannot change');
allowed('unrelated continuation is unaffected', fire(agents, 'send_input', { target: 'other-agent', message: 'Continue.' }));
fire(agents, 'spawn_agent', { task_name: 'failed_writer', message: 'DOC_THIS_WORKER=doc-this-writer\nExecute.' }, {
  hook_event_name: 'PostToolUse', tool_response: JSON.stringify({ error: 'spawn failed' }),
});
allowed('failed spawn does not register an agent identity', fire(agents, 'followup_task', { target: 'failed_writer', message: 'Continue.' }));
allowed('session identity is isolated', fire(agents, 'send_input', { target: v1, message: 'Continue.' }, { session_id: `${session}-other` }));
state(agents, complete);
allowed('restored prerequisites allow an untagged known continuation', fire(agents, 'resume_agent', { id: v1 }));

h.section('Native patches scan every changed target');
const patchRoot = project('patches', complete);
const patch = (body) => `*** Begin Patch\n${body}\n*** End Patch`;
blocked('later file cannot hide behind an earlier safe file', fire(patchRoot, 'functions.apply_patch', patch('*** Add File: notes.md\n+Safe.\n*** Add File: .doc-this-sdd/bad.md\n+🟡 inferred')));
allowed('removed violating text is not new content', fire(patchRoot, 'apply_patch', { input: patch('*** Update File: .doc-this-sdd/a.md\n@@\n-🟡 inferred\n+Observed behavior.') }));
blocked('removed exemption does not exempt added content', fire(patchRoot, 'apply_patch', { patch: patch('*** Update File: .doc-this-sdd/a.md\n@@\n-<!-- DOC-THIS-EXEMPT : reason="old" -->\n+🟡 inferred') }));
blocked('move destination is inspected', fire(patchRoot, 'apply_patch', { command: patch('*** Update File: notes.md\n*** Move to: .doc-this-sdd/moved.md\n@@\n-old\n+Recommend refactoring.') }));
write(join(patchRoot, 'incoming.md'), '🟡 inferred\n');
blocked('zero-addition move checks the incoming existing content', fire(patchRoot, 'apply_patch', patch('*** Update File: incoming.md\n*** Move to: .doc-this-sdd/incoming.md')), 'pact violation');
allowed('move may remove the violating text', fire(patchRoot, 'apply_patch', patch('*** Update File: incoming.md\n*** Move to: .doc-this-sdd/incoming.md\n@@\n-🟡 inferred\n+Observed behavior.')));
blocked('unverifiable move cannot silently bypass inspection', fire(patchRoot, 'apply_patch', patch('*** Update File: incoming.md\n*** Move to: .doc-this-sdd/incoming.md\n@@\n-nonexistent context\n+Observed behavior.')), 'cannot verify');
write(join(patchRoot, '.doc-this-sdd/outgoing.md'), '🟡 inferred\n');
allowed('move out of staging does not scan removed source content', fire(patchRoot, 'apply_patch', patch('*** Update File: .doc-this-sdd/outgoing.md\n*** Move to: notes.md')));
allowed('delete remains permitted', fire(patchRoot, 'apply_patch', patch('*** Delete File: .doc-this-sdd/a.md')));
allowed('forward-design docs remain outside describe-only scope', fire(patchRoot, 'apply_patch', patch('*** Add File: docs/adr/ADR-001.md\n+## Consequences')));
blocked('malformed patch cannot produce a silent allow', fire(patchRoot, 'apply_patch', { input: 'unparseable' }), 'cannot inspect');
allowed('malformed unrelated edit retains fail-open behavior', fire(absent, 'apply_patch', { input: 'unparseable' }));
write(join(patchRoot, '.doc-this-sdd/exists.md'), 'Staging exists.');
const advisory = fire(patchRoot, 'apply_patch', patch('*** Add File: docs/requirements/FR-001.md\n+Observed behavior.\n*** Add File: docs/adr/ADR-001.md\n+## Consequences'));
h.check('multiple advisories become one native output', advisory.additionalContext?.includes('FR-001.md') && advisory.additionalContext?.includes('ADR-001.md'));
const moved = fire(patchRoot, 'apply_patch', patch('*** Update File: docs/requirements/FR-001.md\n*** Move to: docs/requirements/FR-002.md'));
h.check('move source and destination receive promote advisories', moved.additionalContext?.includes('FR-001.md') && moved.additionalContext?.includes('FR-002.md'));

h.section('Available LSP operations keep budgets and timing');
const lsp = fire(patchRoot, 'LSP', { operation: 'hover', filePath: 'src/a.ts' });
h.check('LSP budget produces an advisory', lsp.additionalContext?.includes('LSP call 1/60'));
const tracker = join(TEMP, `.codex-doc-this-lsp-${session}.json`);
h.check('native LSP tracker is host-specific', existsSync(tracker));
write(tracker, { calls: { code_analyst: { hover: 60 } }, total_time_ms: 0 });
blocked('LSP hard limit remains blocking', fire(patchRoot, 'LSP', { operation: 'hover', filePath: 'src/a.ts' }), 'budget exhausted');
write(join(TEMP, `.codex-doc-this-lsp-start-${session}`), String(Math.floor(Date.now() / 1000) - 20));
const timing = fire(patchRoot, 'LSP', { operation: 'hover', filePath: 'src/a.ts' }, { hook_event_name: 'PostToolUse' });
h.check('post LSP timing keeps its event envelope', timing.hookEventName === 'PostToolUse' && timing.additionalContext?.includes('slow-call'));

h.section('Session bypass and standalone Claude behavior stay separate');
write(join(TEMP, `.claude-doc-this-bypass-${session}`), '');
blocked('Claude bypass marker does not exempt Codex', spawn(absent, 'doc-this-writer'));
write(join(TEMP, `.codex-doc-this-bypass-${session}`), '');
allowed('Codex session marker exempts its own session', spawn(absent, 'doc-this-writer'));
blocked('Codex bypass does not affect another session', spawn(absent, 'doc-this-writer', { session_id: `${session}-isolated` }));
const claude = runNode(join(HOOKS, 'doc-this-dispatch-gate.mjs'), {
  cwd: absent, env, input: JSON.stringify({ session_id: `${session}-claude`, cwd: absent, tool_input: { skill: 'doc-this:doc-this-writer' } }),
});
h.equal('Claude deny exit remains 2', claude.code, 2);
h.equal('Claude deny envelope remains unchanged', JSON.parse(claude.stdout).hookSpecificOutput.permissionDecision, 'deny');
h.check('Codex decisions write the Codex log', existsSync(join(env.CODEX_HOME, 'logs/doc-this-gates.log')));

h.section('Shared evaluators are importable and never launch child processes');
const imports = readdirSync(HOOKS).filter((name) => name.startsWith('doc-this-') && name.endsWith('.mjs'));
const imported = runNode('-e', { args: [imports.map((name) => `import(${JSON.stringify(join(HOOKS, name))})`).join(';')], env });
h.equal('importing all gate modules exits successfully', imported.code, 0);
h.equal('importing gate modules writes no hook envelope', imported.stdout, '');
const version = runNode(ADAPTER, { args: ['--version'], env });
h.check('native runtime exposes its plugin version', /^\d+\.\d+\.\d+\s*$/.test(version.stdout));
const importsSubprocess = (source) => /['"](?:node:)?child_process['"]/.test(source);
h.check('process-import scan detects a subprocess adapter', importsSubprocess("import { spawnSync } from 'node:child_process';"));
h.check('process-import scan allows filesystem helpers', !importsSubprocess("import { readFileSync } from 'node:fs';"));
for (const name of [...imports, 'codex-hook-adapter.mjs', ...readdirSync(join(HOOKS, 'lib')).filter((name) => name.endsWith('.mjs')).map((name) => `lib/${name}`)]) {
  h.check(`${name} invokes no subprocess adapter`, !importsSubprocess(readFileSync(join(HOOKS, name), 'utf8')));
}
const manifest = JSON.parse(readFileSync(join(HOOKS, 'codex-hooks.json'), 'utf8'));
for (const event of ['PreToolUse', 'PostToolUse']) {
  h.check(`${event} registers the native adapter`, manifest.hooks[event].some((group) => group.hooks.some((hook) => hook.command.includes('/hooks/codex-hook-adapter.mjs'))));
}
const pre = new RegExp(manifest.hooks.PreToolUse[0].matcher);
const post = new RegExp(manifest.hooks.PostToolUse[0].matcher);
for (const name of ['spawn_agent', 'functions.spawn_agent', 'collaboration.spawn_agent', 'multi_agent_v1spawn_agent', 'multi_agent_v2.spawn_agent', 'multi_agent_v1send_input', 'multi_agent_v1resume_agent', 'collaboration.followup_task', 'collaboration.send_message', 'functions.apply_patch', 'Edit', 'Write', 'LSP']) {
  h.check(`native matcher includes ${name}`, pre.test(name));
}
for (const name of ['spawn_agent', 'functions.spawn_agent', 'collaboration.spawn_agent', 'multi_agent_v1spawn_agent', 'LSP']) h.check(`post matcher includes ${name}`, post.test(name));
h.check('unrelated tools do not spawn the adapter', !pre.test('exec_command') && !post.test('apply_patch'));
h.done();
