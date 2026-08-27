#!/usr/bin/env node
// test-no-shell-invocation.mjs — no code path in this repository reaches a shell.
//
// Two parts:
//
//   A. The viewer launcher's browser-open invocation, for every platform it supports. Asserted
//      from any host: browserOpenCommand() is pure, so darwin/linux CI proves the win32 branch
//      names a real executable instead of a cmd.exe builtin. It proves the SHAPE of the win32
//      invocation, not that a browser comes up there — no CI leg runs native Windows.
//
//   B. A repo-wide scan of every .mjs for the three forms that reach a shell — a truthy `shell`
//      option, a shell named as the executable, and exec/execSync. Child processes are spawned
//      with an executable plus an argv array, which is what keeps the tree free of a shell
//      dialect it would then have to be portable across.
//
// Scanned: tracked files PLUS untracked-but-not-ignored ones, so a new file is covered before it
// is staged rather than after. The vendored viewer bundle is .js and never in scope.
//
// The two forbidden-form patterns are assembled from fragments so this file never contains the
// form it scans for, and therefore never needs to exempt itself from its own scan. Every rule is
// proven against a canary in both directions before any verdict is trusted: a scan that reads
// nothing, or one that flags everything, both look green from one side.
//
// Exit: 0 pass · 1 fail. See tests/lib/harness.mjs for the contract.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness } from './lib/harness.mjs';
import { browserOpenCommand } from '../doc-this/skills/doc-this-viewer/scripts/launch.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const h = new Harness('no shell invocation');

// --- A. the launcher's browser-open invocation, per platform ------------------------------------

const SHELLS = ['sh', 'bash', 'zsh', 'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'env'];
const URL = 'http://127.0.0.1:8080/.doc-this/viewer/index.html';

h.section('A. browser-open invocation (darwin, linux, win32)');
for (const platform of ['darwin', 'linux', 'win32']) {
  const cmd = browserOpenCommand(platform, URL);
  h.check(`${platform}: executable is not a shell`,
    typeof cmd.command === 'string' && !SHELLS.includes(cmd.command.toLowerCase()),
    `${platform} would invoke ${JSON.stringify(cmd.command)}`);
  h.check(`${platform}: arguments passed as an argv array carrying the URL`,
    Array.isArray(cmd.args) && cmd.args.includes(URL),
    `${platform} args: ${JSON.stringify(cmd.args)}`);
  h.check(`${platform}: no shell option produced`,
    !('shell' in cmd) && !Object.keys(cmd).some((k) => k.toLowerCase() === 'shell'),
    `${platform} returned keys: ${Object.keys(cmd).join(', ')}`);
}

// --- B. the repo-wide scan ----------------------------------------------------------------------

const RULES = [
  ['truthy shell option', new RegExp(String.raw`(?<![\w.])shell\s*:(?!\s*false\b)`)],
  ['shell as executable', new RegExp(
    String.raw`(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"\`]` +
    String.raw`(?:sh|bash|zsh|cmd|cmd\.exe|powershell|powershell\.exe|pwsh|env)['"\`]`)],
  ['exec/execSync', new RegExp(String.raw`(?<![\w.])` + 'ex' + String.raw`ec(?:Sync)?\s*\(`)],
];

function scanLine(line) {
  for (const [label, re] of RULES) if (re.test(line)) return label;
  return null;
}

h.section('B. repo-wide scan — canaries first');

const MUST_FLAG = [
  `spawnSync(opener, [url], { stdio: 'ignore', ` + 'she' + `ll: true });`,
  `spawnSync(opener, [url], { ` + 'she' + `ll: process.platform === 'win32' });`,
  `spawnSync('c` + `md', ['/c', 'start', url]);`,
  `spawn('ba` + `sh', ['-lc', 'echo hi']);`,
  `const out = ` + 'ex' + `ecSync('ls');`,
  `` + 'ex' + `ec('ls', (e, out) => out);`,
];
const MUST_NOT_FLAG = [
  `spawnSync(command, args, { stdio: 'ignore' });`,
  `spawnSync(process.execPath, [BUILD_MANIFEST, root], { stdio: ['ignore', 'ignore', 'inherit'] });`,
  `execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });`,
  `spawnSync('rundll32.exe', ['url.dll,FileProtocolHandler', url]);`,
  `const m = PATTERN.exec(line);`,
  `if (re.exec(text)) return true;`,
  `spawnSync(node, [script], { shell: false });`,
  `// The bash original needed an eval() shim to query the manifest from the shell;`,
  `// One stable command path for everything coverage fan-out needs from the shell, so the`,
];

let broken = 0;
for (const c of MUST_FLAG) {
  if (!scanLine(c)) { h.bad('canary not flagged — the scan is inert', c); broken++; }
}
for (const c of MUST_NOT_FLAG) {
  const hit = scanLine(c);
  if (hit) { h.bad(`control flagged as [${hit}] — the scan is too broad`, c); broken++; }
}
if (broken === 0) {
  h.ok(`scan verified against ${MUST_FLAG.length} canaries and ${MUST_NOT_FLAG.length} controls`);
} else {
  h.bad('verdict UNVERIFIED — the scan does not read what it claims to read');
  h.done();
}

h.section('B. repo-wide scan — the tree');

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: ROOT, encoding: 'utf8' }).split('\0').filter((f) => f.endsWith('.mjs'));

const findings = [];
let scanned = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  scanned++;
  text.split('\n').forEach((line, i) => {
    const hit = scanLine(line);
    if (hit) findings.push(`${f}:${i + 1}: [${hit}] ${line.trim().slice(0, 100)}`);
  });
}

h.check('the scan read files', scanned > 0, 'no .mjs was read — verdict UNVERIFIED');
h.check(`zero shell-reaching call sites across ${scanned} .mjs files`, findings.length === 0,
  findings.join('\n        '));

h.done();
