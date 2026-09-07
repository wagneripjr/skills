#!/usr/bin/env node
// cross-review.mjs — deterministic agy (Antigravity) cross-review runner for doc-this-reviewer.
//
// Co-located with the skill; the Reviewer invokes it via ${CLAUDE_PLUGIN_ROOT}. ALL agy
// tool-calling syntax lives here, frozen — the agent must NEVER hand-build the agy command
// (that improvisation tripped the auto-mode classifier: it swapped --sandbox for
// --dangerously-skip-permissions, added a cd, backgrounded it, and got denied). The agent
// supplies only <output_folder>; this script owns every flag.
//
// Usage:
//   cross-review.mjs <output_folder> [--model "<model>"] [--timeout <dur>]
//
// What it does (never re-improvised):
//   - reads the prompt from ../references/cross-review.md (resolved via this script's path)
//   - mounts <output_folder> via --add-dir  (corpus stays on disk; never piped/cat'd in)
//   - always runs --sandbox with stdin from /dev/null (never --dangerously-skip-permissions)
//   - writes findings to <output_folder>/cross-review-result.md
//   - prints ONE status line on stdout for the Reviewer to record verbatim (confidence-report.md §8)
//
// Exit codes:
//   0 = ran          — result written to <output_folder>/cross-review-result.md
//   1 = usage error  — bad/missing args (message on stderr)
//   3 = skipped      — agy not installed (clean skip, not a failure)
//   4 = skipped      — agy errored or timed out (one-line reason on stdout; output in result file)
//
// NOTE: a genuine auto-mode classifier egress denial blocks this Bash call at Claude Code's
// layer, BEFORE the script runs — the script cannot observe that. In that case the Reviewer
// records `cross-review: skipped (classifier denied egress; user must trust the destination)`.

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const USAGE = 'usage: cross-review.mjs <output_folder> [--model "<model>"] [--timeout <dur>]';

function usageErr(reason) {
  process.stderr.write(`cross-review: usage error (${reason})\n`);
  process.stderr.write(USAGE + '\n');
  process.exit(1);
}

let model = 'Gemini 3.1 Pro (High)';
let timeout = '15m';
let outputFolder = '';

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--model') {
    if (i + 1 >= argv.length) usageErr('--model needs a value');
    model = argv[++i];
  } else if (a.startsWith('--model=')) {
    model = a.slice('--model='.length);
  } else if (a === '--timeout') {
    if (i + 1 >= argv.length) usageErr('--timeout needs a value');
    timeout = argv[++i];
  } else if (a.startsWith('--timeout=')) {
    timeout = a.slice('--timeout='.length);
  } else if (a === '-h' || a === '--help') {
    process.stdout.write(USAGE + '\n');
    process.exit(0);
  } else if (a.startsWith('-')) {
    usageErr(`unknown flag: ${a}`);
  } else if (!outputFolder) {
    outputFolder = a;
  } else {
    usageErr(`unexpected extra argument: ${a}`);
  }
}

if (!outputFolder) usageErr('<output_folder> is required');
try {
  if (!statSync(outputFolder).isDirectory()) usageErr(`<output_folder> is not a directory: ${outputFolder}`);
} catch {
  usageErr(`<output_folder> is not a directory: ${outputFolder}`);
}

// Resolve the prompt relative to THIS script (never trust a passed-in path).
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = resolve(SCRIPT_DIR, '..', 'references', 'cross-review.md');
if (!existsSync(PROMPT_FILE)) usageErr(`prompt file missing: ${PROMPT_FILE}`);

// Availability check (clean skip, exit 3).
const probe = spawnSync('agy', ['--version'], { stdio: 'ignore' });
if (probe.error) {
  process.stdout.write('cross-review: skipped (agy not installed)\n');
  process.exit(3);
}

const result = join(outputFolder, 'cross-review-result.md');

// Run agy with frozen flags. stdin from /dev/null; stdout+stderr captured into the result file.
const run = spawnSync('agy', [
  '-p', readFileSync(PROMPT_FILE, 'utf8'),
  '--model', model,
  '--add-dir', outputFolder,
  '--sandbox',
  '--print-timeout', timeout,
], { input: '', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const captured = `${run.stdout ?? ''}${run.stderr ?? ''}`;
writeFileSync(result, captured);

if (run.status === 0) {
  process.stdout.write(`cross-review: ran (engine=agy, model=${model}) -> ${result}\n`);
  process.exit(0);
}

// agy failed/timed out — derive a one-line summary from the captured output (clean skip).
const lines = captured.split('\n').filter((l) => l.trim() !== '');
const summary = (lines.length ? lines[lines.length - 1] : `exit code ${run.status}`).slice(0, 160);
process.stdout.write(`cross-review: skipped (agy error: ${summary})\n`);
process.exit(4);
