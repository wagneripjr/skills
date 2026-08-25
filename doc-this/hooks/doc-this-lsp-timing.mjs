#!/usr/bin/env node
// doc-this-lsp-timing.mjs — PostToolUse hook on LSP.
// Tracks per-call timing, detects slow calls, accumulates wall-clock time.
// Advisory-only (never denies). No-op in projects without .doc-this/state.json.

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
  readHookInput,
  parseInput,
  bypassActive,
  statePath,
  stateField,
  phaseToAgent,
  projectName,
  lspTrackerPath,
  lspStartPath,
  log,
  allow,
  advisePost,
  failOpen,
  VERSION,
} from './lib/doc-this-checks.mjs';

const SLOW_THRESHOLD_MS = 15000;
const TOTAL_TIME_THRESHOLD_MS = 300000;
const LSP_LOG = join(homedir(), '.claude', 'logs', 'doc-this-lsp.log');

const FRESH_TRACKER = () => ({
  calls: { code_analyst: {}, detective: {}, architect: {} },
  total_calls: 0,
  total_time_ms: 0,
  slow_calls: [],
});

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (!statePath(ctx.cwd)) {
    return allow();
  }

  if (bypassActive(ctx.sessionId)) {
    return allow();
  }

  const operation = ctx.toolInput.operation || '';
  const filePath = ctx.toolInput.filePath || 'unknown';

  const agent = phaseToAgent(stateField(ctx.cwd, 'phase'));
  if (!agent) {
    return allow();
  }

  let durationMs = 0;
  const startFile = lspStartPath(ctx.sessionId);
  if (existsSync(startFile)) {
    let startEpoch = 0;
    try {
      startEpoch = Number(readFileSync(startFile, 'utf8').trim()) || 0;
    } catch {
      startEpoch = 0;
    }
    if (startEpoch > 0) {
      durationMs = (Math.floor(Date.now() / 1000) - startEpoch) * 1000;
    }
    try {
      rmSync(startFile);
    } catch {
      // Already gone — harmless.
    }
  }

  const trackerPath = lspTrackerPath(ctx.sessionId);
  let tracker = FRESH_TRACKER();
  if (existsSync(trackerPath)) {
    try {
      tracker = JSON.parse(readFileSync(trackerPath, 'utf8'));
    } catch {
      tracker = FRESH_TRACKER();
    }
  }

  const totalTime = (Number(tracker.total_time_ms) || 0) + durationMs;
  tracker.total_time_ms = totalTime;
  if (durationMs > SLOW_THRESHOLD_MS) {
    if (!Array.isArray(tracker.slow_calls)) tracker.slow_calls = [];
    tracker.slow_calls.push({ operation, file: filePath, duration_ms: durationMs, agent });
  }
  writeFileSync(trackerPath, JSON.stringify(tracker));

  try {
    mkdirSync(dirname(LSP_LOG), { recursive: true });
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    appendFileSync(
      LSP_LOG,
      `${ts} | ${VERSION} | ${ctx.sessionId || 'none'} | ${projectName(ctx.cwd)} | ${operation} | ${filePath} | ${durationMs} | ${totalTime} | ${agent}\n`,
    );
  } catch {
    // Timing log must never break the hook.
  }

  if (durationMs > SLOW_THRESHOLD_MS) {
    const durationS = Math.floor(durationMs / 1000);
    let msg =
      `LSP slow-call detected: ${operation} on ${basename(filePath)} took ${durationS}s. ` +
      `This file likely has high fan-out. Skip further ${operation} calls on this file's symbols and use LLM code reading instead.`;
    if (totalTime > TOTAL_TIME_THRESHOLD_MS) {
      msg += ` Total LSP wall-clock: ${Math.floor(totalTime / 1000)}s (>300s threshold). Consider switching to LLM-only code reading for remaining modules.`;
    }
    log(ctx, 'advise', `LSP:${operation}`, `slow-call ${durationS}s on ${basename(filePath)}`);
    return advisePost(msg);
  }

  if (totalTime > TOTAL_TIME_THRESHOLD_MS) {
    const totalS = Math.floor(totalTime / 1000);
    const msg =
      `LSP time budget advisory: total LSP wall-clock is ${totalS}s (>300s threshold). ` +
      `Consider switching to LLM-only code reading for remaining modules to avoid spending disproportionate time on LSP.`;
    log(ctx, 'advise', 'LSP:total-time', `cumulative ${totalS}s`);
    return advisePost(msg);
  }

  return allow();
});
