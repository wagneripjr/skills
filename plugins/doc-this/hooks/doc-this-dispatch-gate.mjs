#!/usr/bin/env node
// doc-this-dispatch-gate.mjs — PreToolUse hook on Skill
//
// Pipeline workers are dispatched OBJECTIVELY by their orchestrator (Skill
// tool, exact name) — never by circumstantial user phrasing. A worker activated
// in a project with NO pipeline state runs unanchored: no file manifest, no
// coverage ledger, and every other gate no-ops (they all treat "no state.json"
// as "not a doc-this project"). That is the BUG-003 failure mode reborn outside
// the pipeline. This gate inverts the default for workers: missing anchor →
// hard deny, pointing the user at the orchestrator entry point.
//
// Scope:
//   doc-this Discovery workers  → require ${cwd}/.doc-this/state.json
//   /doc-this orchestrator, promote, help, optional agents (tracer, visor,
//   data-master, design-system), and every non-pipeline skill → pass through
//   silently.
//
// When the anchor EXISTS this gate allows and the phase/checkpoint/coverage
// gates take over (ordering + Total Source Coverage). Frontmatter flags cannot
// express this contract: disable-model-invocation would also block the
// orchestrator's Skill-tool dispatch (docs: "Claude can invoke: No"), and
// user-invocable:false does not stop description-based auto-triggering.
//
// Known limitation (shared by all Skill-activation gates): anchors resolve
// against the session cwd — there is no target path in a Skill activation to
// walk up from.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  readHookInput,
  parseInput,
  bypassActive,
  bypassHint,
  log,
  allow,
  deny,
  failOpen,
} from './lib/doc-this-checks.mjs';

const WORKERS = new Set([
  'doc-this:doc-this-scout',
  'doc-this:doc-this-code-analyst',
  'doc-this:doc-this-archaeologist',
  'doc-this:doc-this-detective',
  'doc-this:doc-this-architect',
  'doc-this:doc-this-writer',
  'doc-this:doc-this-reviewer',
]);

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    log(ctx, 'exempt', 'dispatch-gate', 'bypass marker present');
    return allow();
  }

  // Production payloads carry the skill name in .skill; current docs describe
  // .name — read both so a harness or runtime schema change cannot fail open.
  const skillName = ctx.toolInput.skill || ctx.toolInput.name || '';
  if (!skillName || !WORKERS.has(skillName)) {
    return allow();
  }

  const anchor = join(ctx.cwd, '.doc-this', 'state.json');
  if (existsSync(anchor)) {
    log(ctx, 'allow', skillName, 'dispatch anchor present');
    return allow();
  }

  const shortName = skillName.replace(/^doc-this:/, '');
  const reason =
    `doc-this dispatch-gate: ${shortName} is a pipeline worker dispatched programmatically by the /doc-this orchestrator — it must not run from circumstantial phrasing. No pipeline state found at .doc-this/state.json; running here would be unanchored (no manifest, no coverage ledger, no ordering gates), which is the BUG-003 failure mode.\n\n` +
    `Start the pipeline with /doc-this (doc-this supports --resume and --backfill-coverage). Direct worker invocation is for resume/debug INSIDE an initialized pipeline.\n\n` +
    bypassHint(ctx.sessionId);

  log(ctx, 'deny', skillName, 'unanchored worker activation (no .doc-this/state.json)');
  return deny(reason);
});
