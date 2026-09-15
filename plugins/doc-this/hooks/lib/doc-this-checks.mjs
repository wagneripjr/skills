// doc-this-checks.mjs — shared helpers for the doc-this enforcement hooks.
//
// Zero-dependency shared hook helpers (FR-DOC-MJS-1): only node:fs,
// node:path, node:os, node:url. No jq, no bash — the gates enforce on any
// platform Claude Code runs on (macOS, Linux, WSL, native Windows).
//
// Self-contained. Imports nothing outside this plugin, so the gates work for a
// user who installed doc-this and nothing else.
//
// Caller contract:
//   1. const ctx = parseInput(await readHookInput()) once per gate.
//   2. Decision helpers return an envelope and exit code. runStandalone emits
//      once at the host boundary; imports execute no hook work.
//   3. Exit codes: allow/advise = 0, deny = 2 (harnesses assert these).
//
// Log format (one line per gate decision):
//   TIMESTAMP | VERSION | SESSION | PROJECT | DECISION | TARGET | REASON | DUR_S

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, '..', '..');
const START_MS = Date.now();

export function hostLogPath(host, name) {
  return join(host === 'codex' ? process.env.CODEX_HOME || join(homedir(), '.codex') : join(homedir(), '.claude'), 'logs', name);
}

export const VERSION = (() => {
  try {
    const manifest = JSON.parse(
      readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch {
    return 'unknown';
  }
})();

export async function readHookInput(stream = process.stdin) {
  try {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

export function parseInput(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  return {
    sessionId: typeof obj.session_id === 'string' ? obj.session_id : '',
    cwd: typeof obj.cwd === 'string' && obj.cwd !== '' ? obj.cwd : process.cwd(),
    toolInput: obj.tool_input && typeof obj.tool_input === 'object' ? obj.tool_input : {},
  };
}

// Per-session bypass marker. The legacy /tmp path keeps every existing doc and
// memory instruction true on unix; the os.tmpdir() path is the portable home
// (macOS /var/folders/…, Windows %TEMP%). Both are honored.
function bypassMarkerName(sessionId, host = 'claude') {
  return `.${host}-doc-this-bypass-${encodeURIComponent(sessionId)}`;
}

export function bypassActive(sessionId, host = 'claude') {
  if (!sessionId) return false;
  const name = bypassMarkerName(sessionId, host);
  return existsSync(join('/tmp', name)) || existsSync(join(tmpdir(), name));
}

// Portable bypass instruction interpolated into denial messages. Falls back to
// the $CLAUDE_SESSION_ID placeholder when the payload carried no session id.
export function bypassHint(sessionId, host = 'claude') {
  const marker = join(tmpdir(), sessionId ? bypassMarkerName(sessionId, host) : `.${host}-doc-this-bypass-$${host === 'codex' ? 'CODEX_SESSION_ID' : 'CLAUDE_SESSION_ID'}`);
  return `Bypass (this session only): touch ${marker}`;
}

export function statePath(cwd) {
  const p = join(cwd, '.doc-this', 'state.json');
  return existsSync(p) ? p : null;
}

// Walk up from a target path (file or dir; resolved against cwd when relative)
// to the nearest ancestor holding .doc-this/state.json. Anchors path-bearing
// hooks (Edit|Write, LSP) to the ANALYZED project instead of the session cwd.
export function resolveProject(startPath, cwd) {
  const abs = isAbsolute(startPath) ? startPath : join(cwd, startPath);
  let dir = dirname(abs);
  for (;;) {
    if (existsSync(join(dir, '.doc-this', 'state.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Scalar state.json field, stringified. Returns the string 'null' for a
// missing/null field or unreadable state — callers compare against 'null',
// mirroring the jq `// "null"` contract of the bash lib.
export function stateField(cwd, field) {
  const p = statePath(cwd);
  if (!p) return 'null';
  const state = readJson(p);
  if (!state || state[field] === undefined || state[field] === null) return 'null';
  const v = state[field];
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function projectName(cwd) {
  return basename(cwd || 'unknown');
}

export function log(ctx, decision, target, reason) {
  try {
    const logFile = hostLogPath(ctx.host, 'doc-this-gates.log');
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const dur = Math.floor((Date.now() - START_MS) / 1000);
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(
      logFile,
      `${ts} | ${VERSION} | ${ctx.sessionId || 'none'} | ${projectName(ctx.cwd)} | ${decision} | ${target} | ${reason} | ${dur}\n`,
    );
  } catch {
    // Logging must never break a gate decision.
  }
}

function emit(obj, code) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
  process.exitCode = code;
}

export function allow() {
  return { output: {}, code: 0 };
}

export function deny(reason) {
  return {
    output: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    },
    code: 2,
  };
}

export function advise(text) {
  return { output: { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }, code: 0 };
}

export function advisePost(text) {
  return { output: { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }, code: 0 };
}

// Per-session LSP tracker. New writes land in os.tmpdir(); an existing legacy
// /tmp tracker from an in-flight pre-port session is still read (unix only).
export function lspTrackerPath(sessionId, host = 'claude') {
  const name = `.${host}-doc-this-lsp-${encodeURIComponent(sessionId || 'unknown')}.json`;
  const portable = join(tmpdir(), name);
  const legacy = join('/tmp', name);
  if (!existsSync(portable) && existsSync(legacy)) return legacy;
  return portable;
}

export function lspStartPath(sessionId, host = 'claude') {
  const name = `.${host}-doc-this-lsp-start-${encodeURIComponent(sessionId || 'unknown')}`;
  const portable = join(tmpdir(), name);
  const legacy = join('/tmp', name);
  if (!existsSync(portable) && existsSync(legacy)) return legacy;
  return portable;
}

// Maps state.json phase names to agent budget keys. Legacy alias: "excavation"
// is the pre-rename name of the "analysis" phase (doc-this-archaeologist →
// doc-this-code-analyst); both map to the same budget key.
export function phaseToAgent(phase) {
  switch (phase) {
    case 'analysis':
    case 'excavation':
      return 'code_analyst';
    case 'interpretation':
      return 'detective';
    case 'synthesis':
      return 'architect';
    default:
      return '';
  }
}

// True when the file exists with size > 0 (bash `[ -s path ]`).
export function nonEmptyFile(path) {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

// Sorted unique non-empty strings — the `sort -u` of the bash gates.
export function sortedUnique(items) {
  return [...new Set(items.filter((x) => typeof x === 'string' && x !== ''))].sort();
}

// Set difference a − b (both arrays), preserving a's sort order — `comm -23`.
export function setDifference(a, b) {
  const exclude = new Set(b);
  return a.filter((x) => !exclude.has(x));
}

// At most 20 lines, joined — the `awk NR<=20` cap of the bash gates.
export function capList(lines, cap = 20) {
  return lines.slice(0, cap).join('\n');
}

// Wraps a gate's main() so an unexpected infrastructure error fails OPEN
// (mirrors the jq-missing fail-open of the bash gates: own-infrastructure
// problems never hard-block).
export async function failOpen(mainFn) {
  try {
    const decision = await mainFn() || allow();
    emit(decision.output, decision.code);
  } catch {
    process.stdout.write('{}\n');
    process.exitCode = 0;
  }
}

export async function runStandalone(url, evaluate, parse = parseInput) {
  if (process.argv[1] && existsSync(process.argv[1]) && url === pathToFileURL(realpathSync(process.argv[1])).href) {
    if (process.argv.includes('--version')) {
      process.stdout.write(`${VERSION}\n`);
      return;
    }
    await failOpen(async () => evaluate(parse(await readHookInput())));
  }
}
