#!/usr/bin/env node
// doc-this-checkpoint-gate.mjs — PreToolUse hook on Skill
//
// Hard-blocks any doc-this:doc-this-<agent> activation when the
// immediately-preceding phase has no checkpoint in state.json.checkpoints.
//
// Phase order (mandatory):
//   reconnaissance (scout) → analysis (code-analyst) → interpretation (detective)
//   → synthesis (architect) → generation (writer) → review (reviewer)
//
// Legacy aliases (runs created before the Code Analyst rename): phase
// "excavation" = "analysis"; checkpoint key "archaeologist" = "code_analyst".
// Checkpoint lookups accept both keys so in-flight projects keep working.
//
// Optional/independent agents are exempt — they can run anytime:
//   tracer, visor, data-master, design-system, promote, help
//
// Skips when .doc-this/state.json doesn't exist (not a doc-this project).

import {
  readHookInput,
  parseInput,
  bypassActive,
  bypassHint,
  statePath,
  readJson,
  log,
  allow,
  deny,
  failOpen,
} from './lib/doc-this-checks.mjs';

// Map agent → required predecessor AGENT. Scout has no predecessor.
// Checkpoints in state.json are keyed by AGENT name (scout, code_analyst, …),
// per references/checkpoint-guide.md + state-schema.md — NOT by phase name. The
// phase name is kept only for human-readable messaging. alt carries the legacy
// checkpoint key accepted for pre-rename state files. Optional agents are not
// listed (no required predecessor — pass through).
const PREDECESSORS = {
  'doc-this:doc-this-scout': { agent: '', alt: '', phase: '' },
  'doc-this:doc-this-code-analyst': { agent: 'scout', alt: '', phase: 'reconnaissance' },
  'doc-this:doc-this-archaeologist': { agent: 'scout', alt: '', phase: 'reconnaissance' },
  'doc-this:doc-this-detective': { agent: 'code_analyst', alt: 'archaeologist', phase: 'analysis' },
  'doc-this:doc-this-architect': { agent: 'detective', alt: '', phase: 'interpretation' },
  'doc-this:doc-this-writer': { agent: 'architect', alt: '', phase: 'synthesis' },
  'doc-this:doc-this-reviewer': { agent: 'writer', alt: '', phase: 'generation' },
};

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    log(ctx, 'exempt', 'checkpoint-gate', 'bypass marker present');
    return allow();
  }

  const stateFile = statePath(ctx.cwd);
  if (!stateFile) {
    return allow();
  }

  const skillName = ctx.toolInput.skill || '';
  if (!skillName || !(skillName in PREDECESSORS)) {
    return allow();
  }

  const { agent: required, alt, phase } = PREDECESSORS[skillName];
  if (!required) {
    log(ctx, 'allow', skillName, 'entry-point agent (no predecessor)');
    return allow();
  }

  const state = readJson(stateFile) || {};
  const checkpoints = state.checkpoints && typeof state.checkpoints === 'object' ? state.checkpoints : {};
  const checkpoint = checkpoints[required] ?? (alt ? checkpoints[alt] : undefined);
  if (checkpoint !== undefined && checkpoint !== null && checkpoint !== false) {
    log(ctx, 'allow', skillName, `predecessor ${required} checkpoint present`);
    return allow();
  }

  const aliasNote = alt ? ` (legacy key '${alt}' also accepted)` : '';
  const shortName = skillName.replace(/^doc-this:/, '');
  const reason =
    `doc-this checkpoint-gate: cannot start ${shortName} — predecessor '${required}'${aliasNote} (phase ${phase}) has no checkpoint in .doc-this/state.json.\n\n` +
    `The doc-this pipeline runs phases sequentially; each agent saves a checkpoint on completion. Run the ${required} agent first, OR if it actually completed but the checkpoint write failed, edit .doc-this/state.json to add an entry under .checkpoints["${required}"].\n\n` +
    bypassHint(ctx.sessionId);

  log(ctx, 'deny', skillName, `missing predecessor checkpoint: ${required}`);
  return deny(reason);
});
