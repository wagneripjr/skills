#!/usr/bin/env node
// doc-this-phase-gate.mjs — PreToolUse hook on Skill
//
// Hard-blocks `doc-this:doc-this-code-analyst` (legacy alias
// `doc-this-archaeologist` also matched) and any later mandatory phase agent
// when the prerequisite state fields are missing:
//   - doc_level         (set by step-03 specs-organization handshake)
//   - database_ownership (set by step-04 database-context handshake)
//
// Both gates: only fires when the project actually uses doc-this
// (i.e., .doc-this/state.json exists in cwd). Pure no-op everywhere else.

import {
  readHookInput,
  parseInput,
  bypassActive,
  bypassHint,
  statePath,
  stateField,
  log,
  allow,
  deny,
  failOpen,
} from './lib/doc-this-checks.mjs';

const GATED_SKILLS = new Set([
  'doc-this:doc-this-code-analyst',
  'doc-this:doc-this-archaeologist',
]);

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    log(ctx, 'exempt', 'phase-gate', 'bypass marker present');
    return allow();
  }

  if (!statePath(ctx.cwd)) {
    return allow();
  }

  const skillName = ctx.toolInput.skill || '';
  if (!skillName) {
    return allow();
  }

  // Only the Code Analyst phase has the doc_level + database_ownership
  // precondition. (Later agents are gated by the checkpoint hook, not this one.
  // The legacy skill name is matched too — protects stale dispatches from
  // pre-rename orchestrators.)
  if (GATED_SKILLS.has(skillName)) {
    const missing = [];
    if (stateField(ctx.cwd, 'doc_level') === 'null') {
      missing.push('- doc_level (run step-03 specs-organization handshake)');
    }
    if (stateField(ctx.cwd, 'database_ownership') === 'null') {
      missing.push('- database_ownership (run step-04 database-context handshake)');
    }

    if (missing.length > 0) {
      const reason =
        `doc-this phase-gate: cannot start the Code Analyst — required state fields are missing.\n\n` +
        `Missing:\n${missing.join('\n')}\n\n` +
        `The doc-this orchestrator (skills/doc-this/SKILL.md, "Special action after Scout") is supposed to run these handshakes. If they were skipped, run /doc-this and follow the prompts after Scout.\n\n` +
        bypassHint(ctx.sessionId);
      log(ctx, 'deny', skillName, `missing prerequisites: ${missing.join(',')}`);
      return deny(reason);
    }
  }

  log(ctx, 'allow', skillName, 'phase-gate clean');
  return allow();
});
