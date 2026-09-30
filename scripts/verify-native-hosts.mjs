#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log(catalog.metadata.version); process.exit(0); }
if (args.includes('--help')) {
  console.log('Usage: node scripts/verify-native-hosts.mjs [--marketplace FILE] [--codex PATH] [--claude PATH]\nChecks native loaders and Codex hook execution using disposable homes and a localhost mock model; makes no paid or external model requests.');
  process.exit(0);
}
const options = {};
while (args.length) {
  const key = args.shift();
  if (!['--marketplace', '--codex', '--claude'].includes(key) || !args.length) throw new Error(`Unknown or incomplete option: ${key}`);
  options[key] = args.shift();
}
const codex = options['--codex'] || process.env.CODEX_BIN || 'codex';
const claude = options['--claude'] || process.env.CLAUDE_BIN || 'claude';
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'skills-native-hosts-')));
const fixture = join(temp, 'repository');
const codexHome = join(temp, 'codex');
const claudeHome = join(temp, 'claude');
const env = { ...process.env, CODEX_HOME: codexHome, CLAUDE_CONFIG_DIR: claudeHome, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
if (process.env.VOLTA_HOME) env.PATH = `${join(process.env.VOLTA_HOME, 'bin')}${process.platform === 'win32' ? ';' : ':'}${env.PATH || ''}`;
let server;
let nextId = 0;
const pending = new Map();
const check = (condition, message) => { if (!condition) throw new Error(message); console.log(`PASS ${message}`); };
function run(command, argv) {
  const result = spawnSync(command, argv, { cwd: fixture, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
    pending.set(id, response => { clearTimeout(timer); response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result); });
    server.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}
async function verifyCodexHookExecution(bypassTrust) {
  const work = join(temp, bypassTrust ? 'reviewed-hook' : 'untrusted-hook');
  mkdirSync(join(work, '.doc-this'), { recursive: true });
  mkdirSync(join(work, '.doc-this-sdd'));
  writeFileSync(join(work, '.doc-this/state.json'), JSON.stringify({ phase: 'analysis', checkpoints: {} }));
  const destination = '.doc-this-sdd/native-deny.md';
  const patch = `*** Begin Patch\n*** Add File: ${destination}\n+🟡 inferred\n*** End Patch`;
  let requests = 0;
  let toolResult;
  const mock = createServer((request, response) => {
    let body = '';
    request.on('data', data => { body += data; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      requests++;
      toolResult = payload.input?.find(item => item.type === 'custom_tool_call_output')?.output || toolResult;
      const item = requests === 1
        ? { id: 'native_patch', call_id: 'native_patch', type: 'custom_tool_call', name: 'apply_patch', input: patch, status: 'completed' }
        : { id: 'native_done', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Native verification complete.', annotations: [] }] };
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const events = [
        { type: 'response.created', response: { id: `native_${requests}`, status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: `native_${requests}`, status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ];
      for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
      response.end();
    });
  });
  let child;
  try {
    await new Promise((resolve, reject) => { mock.once('error', reject); mock.listen(0, '127.0.0.1', resolve); });
    const config = [
      'model_provider="native_smoke"', 'model="gpt-5.4"', 'model_reasoning_effort="low"',
      `projects."${work}".trust_level="trusted"`,
      `model_providers.native_smoke={name="Native smoke",base_url="http://127.0.0.1:${mock.address().port}/v1",wire_api="responses",requires_openai_auth=false}`,
    ];
    const argv = ['exec', '--ephemeral', '--json', '--skip-git-repo-check', '--ignore-rules', '-s', 'workspace-write', '-C', work,
      ...(bypassTrust ? ['--dangerously-bypass-hook-trust'] : []), ...config.flatMap(value => ['-c', value]), 'Execute the supplied tool call once.'];
    child = spawn(codex, argv, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stdout.resume(); child.stderr.on('data', data => { errors += data; });
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Codex hook execution timed out')); }, 20000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve(code); });
    });
    check(status === 0 && requests === 2, `Codex completes ${bypassTrust ? 'reviewed' : 'untrusted'} hook control through localhost mock model: ${status === 0 ? 'success' : errors}`);
    if (bypassTrust) {
      check(!existsSync(join(work, destination)) && toolResult?.includes('Command blocked by PreToolUse hook: describe-only pact violation'), 'Codex native PreToolUse denies forbidden patch before writing');
    } else {
      check(typeof toolResult === 'string' && !toolResult.includes('Command blocked') && (existsSync(join(work, destination)) || toolResult.includes('Failed to write file')), 'Codex leaves untrusted hooks inactive and reaches the native patch operation');
      if (!existsSync(join(work, destination))) console.log('LIMITATION the enclosing sandbox prevented the untrusted control file write; native patch execution was reached.');
    }
  } finally {
    child?.kill();
    mock.closeAllConnections();
    await new Promise(resolve => mock.close(resolve));
  }
}
try {
  mkdirSync(join(fixture, '.agents/plugins'), { recursive: true });
  mkdirSync(codexHome); mkdirSync(claudeHome);
  cpSync(join(root, 'plugins'), join(fixture, 'plugins'), { recursive: true });
  cpSync(join(root, '.claude-plugin'), join(fixture, '.claude-plugin'), { recursive: true });
  cpSync(resolve(options['--marketplace'] || join(root, '.agents/plugins/marketplace.json')), join(fixture, '.agents/plugins/marketplace.json'));
  console.log(run(codex, ['--version'])); console.log(run(claude, ['--version']));
  run(codex, ['plugin', 'marketplace', 'add', fixture]);
  run(claude, ['plugin', 'marketplace', 'add', fixture]);
  for (const plugin of catalog.plugins) {
    const validated = JSON.parse(run(claude, ['plugin', 'validate', '--json', join(fixture, plugin.source)]));
    check(validated.success, `Claude validates ${plugin.name}`);
    const installed = JSON.parse(run(codex, ['plugin', 'add', `${plugin.name}@${catalog.name}`, '--json']));
    check(installed.version === plugin.version && installed.installedPath.startsWith(temp), `Codex installs ${plugin.name} ${plugin.version} in temporary home`);
    run(claude, ['plugin', 'install', `${plugin.name}@${catalog.name}`]);
  }
  const installed = JSON.parse(run(claude, ['plugin', 'list', '--json']));
  check(catalog.plugins.every(plugin => installed.some(item => item.id === `${plugin.name}@${catalog.name}` && item.version === plugin.version && item.enabled && item.installPath.startsWith(temp))), 'Claude discovers every enabled plugin from temporary home');
  const claudeDocThis = run(claude, ['plugin', 'details', `doc-this@${catalog.name}`]);
  check(/^\s*Skills \(14\)/m.test(claudeDocThis) && /^\s*Hooks \(2\)\s+PostToolUse, PreToolUse\b/m.test(claudeDocThis), 'Claude component loader discovers fourteen doc-this skills and both hook events');
  const claudeOkf = run(claude, ['plugin', 'details', `okf-maintain@${catalog.name}`]);
  check(/^\s*Skills \(1\)/m.test(claudeOkf) && /^\s*Hooks \(1\)\s+PostToolUse\b/m.test(claudeOkf), 'Claude component loader discovers the OKF skill and post tool hook');
  server = spawn(codex, ['app-server'], { cwd: fixture, env, stdio: ['pipe', 'pipe', 'pipe'] });
  server.on('error', error => { for (const complete of pending.values()) complete({ error: { message: error.message } }); pending.clear(); });
  server.stderr.resume();
  createInterface({ input: server.stdout }).on('line', line => {
    let response;
    try { response = JSON.parse(line); } catch { return; }
    if (response.id !== undefined) { pending.get(response.id)?.(response); pending.delete(response.id); }
  });
  await rpc('initialize', { clientInfo: { name: 'native_host_verifier', version: catalog.metadata.version }, capabilities: { experimentalApi: true } });
  server.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
  const skills = await rpc('skills/list', { cwds: [fixture], forceReload: true });
  const entry = skills.data.find(item => item.cwd === fixture);
  check(entry && entry.errors.length === 0, 'Codex skill loader reports no errors');
  for (const plugin of catalog.plugins) {
    const manifest = JSON.parse(readFileSync(join(fixture, plugin.source, '.codex-plugin/plugin.json'), 'utf8'));
    const discovered = entry.skills.filter(skill => skill.pluginId === `${plugin.name}@${catalog.name}`);
    const expected = manifest.skills.map(path => `${plugin.name}:${path.split('/').at(-1)}`).sort();
    check(JSON.stringify(discovered.map(skill => skill.name).sort()) === JSON.stringify(expected) && discovered.every(skill => skill.enabled && skill.path.startsWith(temp)), `Codex discovers exact public skill set for ${plugin.name}`);
  }
  const hooks = await rpc('hooks/list', { cwds: [fixture] });
  const hookEntry = hooks.data.find(item => item.cwd === fixture);
  check(hookEntry && hookEntry.errors.length === 0 && hookEntry.warnings.length === 0, 'Codex hook loader reports no errors or warnings');
  const nativeHooks = hookEntry.hooks.filter(hook => hook.pluginId?.endsWith(`@${catalog.name}`));
  check(nativeHooks.length === 4 && nativeHooks.every(hook => hook.enabled && hook.trustStatus === 'untrusted' && hook.sourcePath.endsWith('/hooks/codex-hooks.json') && hook.sourcePath.startsWith(temp)), 'Codex loads all four native hooks and requires first-use trust');
  check(nativeHooks.some(hook => hook.pluginId.startsWith('learning-capture@') && hook.eventName === 'postToolUse'), 'Codex loads the learning-capture fault nudge');
  check(nativeHooks.filter(hook => hook.pluginId.startsWith('doc-this@')).map(hook => hook.eventName).sort().join(',') === 'postToolUse,preToolUse', 'Codex loads doc-this pre/post tool integration');
  check(nativeHooks.some(hook => hook.pluginId.startsWith('okf-maintain@') && hook.eventName === 'postToolUse'), 'Codex loads OKF post tool integration');
  await verifyCodexHookExecution(false);
  await verifyCodexHookExecution(true);
  const docThis = catalog.plugins.find(plugin => plugin.name === 'doc-this');
  const nextVersion = docThis.version.split('.').map((part, index) => index === 2 ? Number(part) + 1 : part).join('.');
  for (const host of ['claude', 'codex', 'tessl']) {
    const path = join(fixture, docThis.source, `.${host}-plugin/plugin.json`);
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.version = nextVersion;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const fixtureCatalogPath = join(fixture, '.claude-plugin/marketplace.json');
  const fixtureCatalog = JSON.parse(readFileSync(fixtureCatalogPath, 'utf8'));
  fixtureCatalog.plugins.find(plugin => plugin.name === 'doc-this').version = nextVersion;
  writeFileSync(fixtureCatalogPath, `${JSON.stringify(fixtureCatalog, null, 2)}\n`);
  run(claude, ['plugin', 'marketplace', 'update', catalog.name]);
  run(claude, ['plugin', 'update', `doc-this@${catalog.name}`]);
  const updatedClaude = JSON.parse(run(claude, ['plugin', 'list', '--json'])).filter(plugin => plugin.id === `doc-this@${catalog.name}`);
  check(updatedClaude.length === 1 && updatedClaude[0].version === nextVersion && updatedClaude[0].enabled && updatedClaude[0].installPath.startsWith(temp), `Claude updates doc-this from ${docThis.version} to ${nextVersion} exactly once`);
  const updatedCodex = JSON.parse(run(codex, ['plugin', 'add', `doc-this@${catalog.name}`, '--json']));
  check(updatedCodex.version === nextVersion && updatedCodex.installedPath.startsWith(temp), `Codex repeated plugin add updates doc-this from ${docThis.version} to ${nextVersion}`);
  run(codex, ['plugin', 'remove', `doc-this@${catalog.name}`, '--json']);
  run(claude, ['plugin', 'uninstall', `doc-this@${catalog.name}`]);
  console.log('PASS isolated install, discovery, hook execution, update, and removal checks complete');
  console.log('Codex execution control uses invocation-only hook trust bypass for the vetted fixture; no trust approval is persisted. Claude runtime hook decisions are covered by the repository hook suites.');
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    await new Promise(resolve => {
      const force = setTimeout(() => server.kill('SIGKILL'), 2000);
      server.once('close', () => { clearTimeout(force); resolve(); });
      server.kill();
    });
  }
  rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
