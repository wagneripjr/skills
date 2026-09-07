#!/usr/bin/env node
// doc-this-promote-warning.mjs — PreToolUse hook on Edit|Write (ADVISORY)
//
// When the project has doc-this staging output (.doc-this-sdd/ exists) AND
// the user is about to edit a docs/ file that doc-this-promote would manage,
// inject a one-line nudge: "consider /doc-this-promote to preserve traceability."
//
// Never blocks. The user might be hand-editing for legitimate reasons.
//
// Targets that trigger the nudge:
//   docs/requirements/*.md
//   docs/adr/*.md (and docs/adrs/*.md)
//   docs/TRACEABILITY.md

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  readHookInput,
  parseInput,
  bypassActive,
  log,
  allow,
  advise,
  failOpen,
} from './lib/doc-this-checks.mjs';

const MANAGED_PATHS = /^docs\/(requirements\/.*\.md|adrs?\/.*\.md|TRACEABILITY\.md)$/;

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    return allow();
  }

  // Only fire when staging exists. (state.json may or may not exist — staging
  // can outlive state if the user wiped .doc-this/ but kept the staging tree.)
  // Match the new hidden default (.doc-this-sdd/) and the legacy visible name
  // (_doc_this_sdd/) so in-flight pre-rename runs still get the nudge.
  if (
    !existsSync(join(ctx.cwd, '.doc-this-sdd')) &&
    !existsSync(join(ctx.cwd, '_doc_this_sdd'))
  ) {
    return allow();
  }

  const filePath = ctx.toolInput.file_path || '';
  if (!filePath) {
    return allow();
  }

  const rootPrefix = `${ctx.cwd.replace(/\/+$/, '')}/`;
  const relative = filePath.startsWith(rootPrefix) ? filePath.slice(rootPrefix.length) : filePath;

  if (!MANAGED_PATHS.test(relative)) {
    return allow();
  }

  const nudge =
    `doc-this staging detected (.doc-this-sdd/ exists in this project) and you are about to edit ${relative}. ` +
    `The /doc-this-promote skill is the canonical bridge from staging to docs/ — it preserves traceability links and halts on collisions. ` +
    `Hand-editing is allowed (not blocked); just confirm this edit is independent of the staged specs.`;
  log(ctx, 'advise', relative, 'promote-bypass nudge');
  return advise(nudge);
});
