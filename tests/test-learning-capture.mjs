#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness, skip } from './lib/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'learning-capture');
const SKILL_DIR = join(PLUGIN, 'skills', 'learning-capture');
const DETECTOR = join(PLUGIN, 'hooks', 'error-detector.mjs');
const CLAUDE_HOOKS = join(PLUGIN, 'hooks', 'hooks.json');
const CODEX_HOOKS = join(PLUGIN, 'hooks', 'codex-hooks.json');
const EXTRACT = join(SKILL_DIR, 'scripts', 'extract-skill.mjs');
const BOOTSTRAP = join(SKILL_DIR, 'scripts', 'bootstrap.mjs');
const ASSETS = join(SKILL_DIR, 'assets');
const TEMPLATES = ['LEARNINGS.md', 'ERRORS.md', 'FEATURE_REQUESTS.md'];

for (const f of [DETECTOR, CLAUDE_HOOKS, CODEX_HOOKS, EXTRACT, BOOTSTRAP]) {
  if (!existsSync(f)) skip(`not found: ${f}`);
}

const h = new Harness('learning-capture — fault nudge, bootstrap decision, skill extraction');
const WORK = h.mkTemp('learning-capture-');

const node = (script, { cwd, input = '', args = [] } = {}) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, input, encoding: 'utf8' });
  return { rc: r.status ?? 1, out: (r.stdout ?? '').replace(/\n+$/, ''), err: r.stderr ?? '' };
};
const parsed = (out) => {
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
};
const ctxOf = (out) => String(parsed(out)?.hookSpecificOutput?.additionalContext ?? '');
const nudges = (out) =>
  parsed(out)?.hookSpecificOutput?.hookEventName === 'PostToolUse' && ctxOf(out).includes('<error-detected>');
const shown = (a) => `out=${a.out} rc=${a.rc}`;
const listTree = (dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(r);
      if (e.isDirectory()) walk(join(d, e.name), r);
    }
  };
  walk(dir, '');
  return out.sort();
};

const OPTED_IN = join(WORK, 'opted-in');
const OPTED_OUT = join(WORK, 'opted-out');
mkdirSync(join(OPTED_IN, '.learnings'), { recursive: true });
mkdirSync(OPTED_OUT, { recursive: true });
const detect = (cwd, payload) => node(DETECTOR, { cwd, input: typeof payload === 'string' ? payload : JSON.stringify(payload) });

h.section('--- error-detector: nudge and silence ---');
const ERR_PAYLOAD = '{"tool_name":"Bash","tool_input":{"command":"npm test"},"tool_response":{"stdout":"npm ERR! fail","stderr":""}}';
const NUDGE_CASES = [
  ['error in stdout (npm ERR!)', ERR_PAYLOAD],
  ['error in stderr (command not found)', '{"tool_name":"Bash","tool_input":{"command":"frobnicate"},"tool_response":{"stdout":"","stderr":"zsh: command not found: frobnicate"}}'],
  ['bare-string tool_response (fatal:)', '{"tool_name":"Bash","tool_input":{"command":"git log"},"tool_response":"fatal: not a git repository"}'],
  ['exit_code 1 + error text still nudges (BUG-005 control)', '{"tool_name":"Bash","tool_input":{"command":"npm test"},"tool_response":{"exit_code":1,"stdout":"npm ERR! fail","stderr":""}}'],
  ['isError true, no exit_code still nudges (BUG-005 control)', '{"tool_name":"Bash","tool_input":{"command":"git push"},"tool_response":{"isError":true,"stdout":"","stderr":"fatal: repository not found"}}'],
];
for (const [label, payload] of NUDGE_CASES) {
  const a = detect(OPTED_IN, payload);
  h.check(`nudges: ${label}`, nudges(a.out) && a.rc === 0, shown(a));
}
const SILENT_CASES = [
  ['clean stdout, no error words', OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"echo ok"},"tool_response":{"stdout":"ok","stderr":""}}'],
  ['.learnings/ absent, error payload (self-gate)', OPTED_OUT, ERR_PAYLOAD],
  ["exit_code 0 + '0 failed' summary (BUG-005)", OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"bash ci/run-all.sh"},"tool_response":{"exit_code":0,"stdout":"RESULTS: 43 passed, 0 failed","stderr":""}}'],
  ['exit_code 0 + npm ERR! in grep output (BUG-005)', OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"grep -r \\"npm ERR\\" docs/"},"tool_response":{"exit_code":0,"stdout":"docs/notes.md: npm ERR! example","stderr":""}}'],
  ['isError false, no exit_code, error vocabulary (BUG-005)', OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"search errors"},"tool_response":{"isError":false,"stdout":"How to handle Error: patterns in Node","stderr":""}}'],
  ["no exit signals + '0 failed' override (BUG-005)", OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"npx vitest run"},"tool_response":{"stdout":"Tests: 12 passed, 0 failed","stderr":""}}'],
  ['.learnings/ERRORS.md read (BUG-005)', OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"sed -n \\"30,60p\\" .learnings/ERRORS.md"},"tool_response":{"stdout":"[ERR-20260701-001] detector FAILED on Error: vocabulary","stderr":""}}'],
  ['agent_id present, genuine error (BUG-031)', OPTED_IN, '{"agent_id":"a1","agent_type":"general-purpose","tool_name":"Bash","tool_input":{"command":"npm test"},"tool_response":{"exit_code":1,"stdout":"npm ERR! fail","stderr":""}}'],
  ['agent_type only, genuine error (BUG-031)', OPTED_IN, '{"agent_type":"Explore","tool_name":"Bash","tool_input":{"command":"npm test"},"tool_response":{"exit_code":1,"stdout":"npm ERR! fail","stderr":""}}'],
  ['empty stdin', OPTED_IN, ''],
  ['non-JSON stdin', OPTED_IN, 'not json at all'],
  ['missing tool_response', OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"echo ok"}}'],
];
for (const [label, cwd, payload] of SILENT_CASES) {
  const a = detect(cwd, payload);
  h.check(`silent: ${label}`, a.out === '{}' && a.rc === 0, shown(a));
}

h.section('--- error-detector: capture wiring (S1a-S1g) ---');
const declares = (path) => {
  try {
    const decl = JSON.parse(readFileSync(path, 'utf8'));
    return (decl.hooks?.PostToolUse ?? [])
      .filter((entry) => entry.matcher === 'Bash')
      .flatMap((entry) => entry.hooks ?? [])
      .filter((hook) => hook.type === 'command' && /hooks\/error-detector\.mjs/.test(hook.command ?? ''));
  } catch {
    return [];
  }
};
const claudeDecl = declares(CLAUDE_HOOKS);
const codexDecl = declares(CODEX_HOOKS);
h.check('S1a hooks.json declares error-detector.mjs under PostToolUse/Bash', claudeDecl.length === 1, JSON.stringify(claudeDecl));
h.equal('S1a hooks.json gives the detector a 10s timeout', claudeDecl[0]?.timeout, 10);
h.check('codex-hooks.json declares error-detector.mjs under PostToolUse/Bash', codexDecl.length === 1, JSON.stringify(codexDecl));
h.equal('both hosts run the same command', codexDecl[0]?.command, claudeDecl[0]?.command);
h.check('S1b error payload with .learnings/ emits the <error-detected> nudge', nudges(detect(OPTED_IN, ERR_PAYLOAD).out));
h.equal('S1c clean payload stays silent', detect(OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"echo ok"},"tool_response":{"stdout":"ok","stderr":""}}').out, '{}');
h.equal('S1d error payload without .learnings/ stays silent', detect(OPTED_OUT, ERR_PAYLOAD).out, '{}');
h.equal('S1e exit_code 0 with failure vocabulary stays silent', detect(OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"bash ci/run-all.sh"},"tool_response":{"exit_code":0,"stdout":"RESULTS: 43 passed, 0 failed","stderr":""}}').out, '{}');
h.equal('S1f .learnings/ERRORS.md read stays silent', detect(OPTED_IN, '{"tool_name":"Bash","tool_input":{"command":"sed -n \\"30,60p\\" .learnings/ERRORS.md"},"tool_response":{"stdout":"[ERR-20260701-001] detector FAILED on Error: vocabulary","stderr":""}}').out, '{}');
const NUDGE_TEXT = ctxOf(detect(OPTED_IN, ERR_PAYLOAD).out);
const named = ['**Skill**', '**Fix-type**', '**Review**'].filter((f) => NUDGE_TEXT.includes(f));
h.check('S1g the nudge asks for **Skill**, **Fix-type** and **Review** by name', named.length === 3, `names only [${named.join(' ')}]`);
h.check('the nudge points at the learning-capture skill format', NUDGE_TEXT.includes('the learning-capture skill format'), NUDGE_TEXT);

h.section('--- error-detector: self-gate, pattern match, fail-open (S7a-S7g) ---');
{
  const a = detect(OPTED_OUT, { tool_input: { command: 'make' }, tool_response: { stdout: 'error: boom', stderr: '' } });
  h.check('S7a no .learnings/ in cwd -> {} even with error output', a.out === '{}', shown(a));
}
{
  const a = detect(OPTED_IN, { tool_input: { command: 'npm test' }, tool_response: { stdout: '', stderr: 'error: something failed' } });
  h.check('S7b .learnings/ + error output -> nudge echoing the command', /<error-detected>[\s\S]*while running: npm test/.test(ctxOf(a.out)), shown(a));
}
{
  const a = detect(OPTED_IN, { tool_input: { command: 'ls' }, tool_response: { stdout: 'file1 file2', stderr: '' } });
  h.check('S7c .learnings/ + non-error output -> {}', a.out === '{}', shown(a));
}
{
  const a = detect(OPTED_IN, { tool_input: { command: 'true' }, tool_response: { stdout: '', stderr: '' } });
  h.check('S7d .learnings/ + empty output -> {}', a.out === '{}', shown(a));
}
{
  const a = detect(OPTED_IN, { tool_input: { command: 'foo' }, tool_response: 'bash: foo: command not found' });
  h.check('S7e .learnings/ + string tool_response matching a pattern -> nudge', ctxOf(a.out).includes('<error-detected>'), shown(a));
}
{
  const a = detect(OPTED_IN, '');
  h.check('S7f empty stdin -> {} exit 0 (fail-open)', a.out === '{}' && a.rc === 0, shown(a));
}
{
  const a = detect(OPTED_IN, 'not json{{');
  h.check('S7g malformed stdin -> {} exit 0 (fail-open)', a.out === '{}' && a.rc === 0, shown(a));
}

h.section('--- error-detector: Codex-shaped payloads ---');
{
  const a = detect(OPTED_IN, { tool_name: 'Bash', tool_input: { command: 'git status' }, tool_response: 'fatal: not a git repository (or any of the parent directories): .git' });
  h.check('a Codex payload (bare-string output, no exit code) with fatal: nudges', nudges(a.out), shown(a));
  h.check('and names the command it ran', ctxOf(a.out).includes('while running: git status'), shown(a));
}
{
  const a = detect(OPTED_IN, { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: 'Tests: 40 passed, 0 failed' });
  h.check("a Codex payload reading '0 failed' stays silent (the output-only override)", a.out === '{}', shown(a));
}

h.section('--- extract-skill ---');
const extractIn = (name) => {
  const cwd = join(WORK, `extract-${name}`);
  mkdirSync(cwd, { recursive: true });
  return cwd;
};
{
  const cwd = extractIn('dry');
  const a = node(EXTRACT, { cwd, args: ['my-skill', '--dry-run'] });
  h.equal('dry-run exits 0', a.rc, 0);
  h.check('dry-run prints the template', a.out.includes('Dry run') && a.out.includes('name: my-skill'), a.out);
  h.equal('dry-run writes nothing', listTree(cwd).length, 0);
}
{
  const cwd = extractIn('invalid');
  const a = node(EXTRACT, { cwd, args: ['Bad_Name'] });
  h.equal('an invalid name exits 1', a.rc, 1);
  h.equal('and writes nothing', listTree(cwd).length, 0);
}
{
  const cwd = extractIn('absolute');
  const target = join(WORK, 'absolute-target');
  const a = node(EXTRACT, { cwd, args: ['my-skill', '--output-dir', target] });
  h.equal('an absolute output directory is refused', a.rc, 1);
  h.check('and nothing is written there', !existsSync(target));
}
for (const dir of ['../escape', 'a/../../escape', '..']) {
  const cwd = extractIn(`dotdot-${dir.replace(/[^a-z]/g, '')}`);
  const a = node(EXTRACT, { cwd, args: ['my-skill', '--output-dir', dir] });
  h.equal(`a '..' output directory is refused (${dir})`, a.rc, 1);
  h.check(`and nothing escapes the working directory (${dir})`, !existsSync(join(WORK, 'escape')) && listTree(cwd).length === 0);
}
{
  const cwd = extractIn('existing');
  mkdirSync(join(cwd, 'skills', 'dup'), { recursive: true });
  writeFileSync(join(cwd, 'skills', 'dup', 'SKILL.md'), 'keep me\n');
  const a = node(EXTRACT, { cwd, args: ['dup'] });
  h.equal('an existing skill is refused', a.rc, 1);
  h.equal('and its SKILL.md is untouched', readFileSync(join(cwd, 'skills', 'dup', 'SKILL.md'), 'utf8'), 'keep me\n');
}
{
  const cwd = extractIn('create');
  const a = node(EXTRACT, { cwd, args: ['pnpm-setup', '--output-dir', 'my-skills'] });
  h.equal('creation exits 0', a.rc, 0);
  const file = join(cwd, 'my-skills', 'pnpm-setup', 'SKILL.md');
  const body = existsSync(file) ? readFileSync(file, 'utf8') : '';
  h.check('creation writes SKILL.md with frontmatter', body.startsWith('---\nname: pnpm-setup\n'), body.slice(0, 80));
  h.check('with the source-tracking placeholder', body.includes('## Source Learning') && body.includes('Learning ID: [TODO'), body);
  h.check('and the next steps point at the entry fields', a.out.includes('promoted_to_skill') && a.out.includes('Skill-Path: my-skills/pnpm-setup'), a.out);
}
{
  const a = node(EXTRACT, { cwd: WORK, args: ['--help'] });
  h.check('usage names <output-dir>, not an unset variable', a.rc === 0 && a.out.includes('<output-dir>/<skill-name>/') && !a.out.includes('$'), a.out);
}

h.section('--- bootstrap: the absent-by-decision rule ---');
const bootIn = (name, gitignore) => {
  const cwd = join(WORK, `boot-${name}`);
  mkdirSync(cwd, { recursive: true });
  if (gitignore !== undefined) writeFileSync(join(cwd, '.gitignore'), gitignore);
  return cwd;
};
for (const [i, [label, line]] of [['.learnings/', '.learnings/'], ['/.learnings', '/.learnings'], ['.learnings', '.learnings'], ['/.learnings/ padded', '  /.learnings/  ']].entries()) {
  const cwd = bootIn(`absent-${i}`, `node_modules/\n${line}\n`);
  const before = listTree(cwd);
  const a = node(BOOTSTRAP, { cwd, args: [cwd] });
  h.equal(`absent-by-decision (${label}) exits 3`, a.rc, 3);
  h.check(`absent-by-decision (${label}) says so`, a.out.includes('decision: absent-by-decision') && a.out.includes('machine-local memory'), a.out);
  h.equal(`absent-by-decision (${label}) writes nothing`, JSON.stringify(listTree(cwd)), JSON.stringify(before));
}
for (const [label, line] of [['hybrid .learnings/*.md', '.learnings/*.md'], ['a commented line', '# .learnings/'], ['a nested path', 'docs/.learnings/']]) {
  const cwd = bootIn(`control-${label.replace(/[^a-z]/g, '')}`, `${line}\n`);
  const a = node(BOOTSTRAP, { cwd, args: [cwd] });
  h.check(`control: ${label} is not a decision against a corpus`, a.rc === 0 && a.out.includes('decision: may-create'), shown(a));
}
{
  const cwd = bootIn('create');
  const a = node(BOOTSTRAP, { cwd, args: [cwd] });
  h.check('may-create exits 0 and says so', a.rc === 0 && a.out.includes('decision: may-create'), shown(a));
  for (const t of TEMPLATES) {
    const target = join(cwd, '.learnings', t);
    h.check(`may-create copies ${t} byte-for-byte`, existsSync(target) && readFileSync(target, 'utf8') === readFileSync(join(ASSETS, t), 'utf8'));
  }
}
{
  const cwd = bootIn('cwd-default');
  const a = node(BOOTSTRAP, { cwd });
  h.check('with no argument the root is the working directory', a.rc === 0 && existsSync(join(cwd, '.learnings', 'LEARNINGS.md')), shown(a));
}
{
  const cwd = bootIn('present', '.learnings/\n');
  mkdirSync(join(cwd, '.learnings'));
  writeFileSync(join(cwd, '.learnings', 'LEARNINGS.md'), '# mine\n\n## [LRN-20260101-001] insight\n');
  const a = node(BOOTSTRAP, { cwd, args: [cwd] });
  h.check('present wins over a gitignore line and exits 0', a.rc === 0 && a.out.includes('decision: present'), shown(a));
  h.equal('present never overwrites an existing file', readFileSync(join(cwd, '.learnings', 'LEARNINGS.md'), 'utf8'), '# mine\n\n## [LRN-20260101-001] insight\n');
  h.check('present copies only the missing templates', existsSync(join(cwd, '.learnings', 'ERRORS.md')) && existsSync(join(cwd, '.learnings', 'FEATURE_REQUESTS.md')) && a.out.includes('kept: .learnings/LEARNINGS.md'), a.out);
}
{
  const a = node(BOOTSTRAP, { cwd: WORK, args: [join(WORK, 'no-such-root')] });
  h.check('a root that is not a directory exits 1 and creates nothing', a.rc === 1 && !existsSync(join(WORK, 'no-such-root')), shown(a));
}
{
  const cwd = bootIn('import');
  const probe = join(cwd, 'probe.mjs');
  writeFileSync(probe, `import { learningsDecision } from ${JSON.stringify(pathToFileURL(BOOTSTRAP).href)};\nprocess.stdout.write(learningsDecision(process.cwd()));\n`);
  const a = node(probe, { cwd });
  h.equal('learningsDecision is importable without running the CLI', a.out, 'may-create');
  h.check('and importing it wrote nothing', !existsSync(join(cwd, '.learnings')));
}

h.section('--- templates ---');
for (const t of TEMPLATES) {
  const text = readFileSync(join(ASSETS, t), 'utf8');
  h.check(`${t} preamble carries no entry header`, !/^## \[/m.test(text));
  h.check(`${t} ends with --- and a trailing newline`, text.endsWith('\n---\n'));
  h.check(`${t} names the reserved consumer fields`, ['Scenario', 'Verdict', 'Activation'].every((f) => text.includes(`**${f}**`)));
}
{
  const text = readFileSync(join(ASSETS, 'LEARNINGS.md'), 'utf8');
  h.check('LEARNINGS.md carries **Skill**, **Fix-type** and **Review**', ['**Skill**', '**Fix-type**', '**Review**'].every((f) => text.includes(f)));
}

h.section('--- names nothing of the lifecycle plugin ---');
const FORBIDDEN = [
  /agentic-sdlc/, /skill-reconcile/, /\/sdlc/, /\/deliver/, /acceptance-spec/, /atdd/i, /test-driven-development/,
  /confidence-score/, /learningsDirectoryDecision/, /hooks\/lib\//, /FR-002/, /FR-105/, /(?<![A-Za-z0-9-])R-94(?![0-9])/,
  /(?<![A-Za-z0-9-])R-3(?![0-9])/, /ADR-012/, /ADR-022/, /\bhub\b/i, /skill-creator/, /activator\.sh/, /session-end\.sh/,
];
const scan = (files) => {
  const hits = [];
  for (const { path, text } of files) {
    text.split('\n').forEach((line, i) => {
      for (const re of FORBIDDEN) if (re.test(line)) hits.push(`${path}:${i + 1}: ${re}`);
    });
  }
  return hits;
};
const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'plugins/learning-capture'], { cwd: ROOT, encoding: 'utf8' });
const files = listed.status === 0
  ? listed.stdout.split('\n').filter(Boolean).filter((p) => statSync(join(ROOT, p)).isFile()).map((p) => ({ path: p, text: readFileSync(join(ROOT, p), 'utf8') }))
  : [];
h.check('control: the scan read the plugin (git listed files, SKILL.md among them)', files.length > 5 && files.some((f) => f.path.endsWith('learning-capture/SKILL.md')), `git status ${listed.status}, ${files.length} files`);
const hits = scan(files);
h.check(`no file under plugins/learning-capture/ names the lifecycle plugin (${files.length} files)`, hits.length === 0, hits.join('\n        '));
h.check('canary: a planted name is found', scan([{ path: 'canary.md', text: 'see agentic-sdlc:skill-reconcile and R-3' }]).length === 3);
h.check('control: github.com, ERR-30 and hubris do not trip the word rules', scan([{ path: 'benign.md', text: 'https://github.com/x ERR-20260101-R3A hubris LR-30' }]).length === 0);

h.done();
