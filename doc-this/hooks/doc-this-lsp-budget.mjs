#!/usr/bin/env node
// doc-this-lsp-budget.mjs — PreToolUse hook on LSP.
// Enforces per-agent, per-operation call budgets during the doc-this pipeline.
// No-op in projects without .doc-this/state.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  readHookInput,
  parseInput,
  bypassActive,
  bypassHint,
  statePath,
  stateField,
  phaseToAgent,
  lspTrackerPath,
  lspStartPath,
  log,
  allow,
  deny,
  advise,
  failOpen,
} from './lib/doc-this-checks.mjs';

const HARD_LIMITS = {
  'code_analyst:hover': 60,
  'code_analyst:incomingCalls': 5,
  'code_analyst:outgoingCalls': 15,
  'code_analyst:findReferences': 3,
  'code_analyst:goToDefinition': 15,
  'code_analyst:goToImplementation': 3,
  'code_analyst:workspaceSymbol': 2,
  'detective:documentSymbol': 15,
  'detective:hover': 20,
  'detective:incomingCalls': 40,
  'detective:outgoingCalls': 10,
  'detective:findReferences': 40,
  'detective:goToDefinition': 10,
  'detective:goToImplementation': 20,
  'detective:workspaceSymbol': 2,
  'architect:documentSymbol': 15,
  'architect:hover': 20,
  'architect:incomingCalls': 40,
  'architect:outgoingCalls': 40,
  'architect:findReferences': 30,
  'architect:goToDefinition': 10,
  'architect:goToImplementation': 20,
  'architect:workspaceSymbol': 5,
};

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
    log(ctx, 'exempt', 'LSP', 'bypass-marker');
    return allow();
  }

  const operation = ctx.toolInput.operation || '';
  if (!operation) {
    return allow();
  }

  const agent = phaseToAgent(stateField(ctx.cwd, 'phase'));
  if (!agent) {
    return allow();
  }

  // code_analyst:documentSymbol (and any unlisted pair) is unlimited — pass
  // through with no tracking overhead.
  const hard = HARD_LIMITS[`${agent}:${operation}`];
  if (hard === undefined) {
    return allow();
  }
  const soft = hard === 0 ? 0 : Math.floor((hard + 1) / 2);

  const trackerPath = lspTrackerPath(ctx.sessionId);
  let tracker = FRESH_TRACKER();
  if (existsSync(trackerPath)) {
    try {
      tracker = JSON.parse(readFileSync(trackerPath, 'utf8'));
    } catch {
      tracker = FRESH_TRACKER();
    }
  }
  if (!tracker.calls || typeof tracker.calls !== 'object') tracker.calls = {};
  if (!tracker.calls[agent] || typeof tracker.calls[agent] !== 'object') tracker.calls[agent] = {};

  const current = Number(tracker.calls[agent][operation]) || 0;

  if (current >= hard) {
    const reason =
      `LSP budget exhausted: ${agent} used ${current}/${hard} ${operation} calls. ` +
      `This budget limits LSP CALLS, never FILE COVERAGE — read the file directly with Read and continue. ` +
      `Do NOT skip the file or record its contents as a gap. ${bypassHint(ctx.sessionId)}`;
    log(ctx, 'deny', `LSP:${operation}`, `hard-limit ${current}/${hard} for ${agent}`);
    return deny(reason);
  }

  const next = current + 1;
  tracker.calls[agent][operation] = next;
  tracker.total_calls = (Number(tracker.total_calls) || 0) + 1;
  writeFileSync(trackerPath, JSON.stringify(tracker));

  // Record call start time for the timing hook.
  writeFileSync(lspStartPath(ctx.sessionId), String(Math.floor(Date.now() / 1000)));

  const remaining = hard - next;
  if (next >= soft) {
    const msg =
      `LSP budget advisory: ${agent} used ${next}/${hard} ${operation} calls (${remaining} remaining). ` +
      `Reserve remaining calls for public API symbols and entry points; for everything else read the source directly — budgets limit LSP calls, never file coverage.`;
    log(ctx, 'advise', `LSP:${operation}`, `soft-limit ${next}/${soft} for ${agent}`);
    return advise(msg);
  }

  return advise(`LSP call ${next}/${hard}: ${operation} for ${agent}. Remaining: ${remaining}.`);
});
