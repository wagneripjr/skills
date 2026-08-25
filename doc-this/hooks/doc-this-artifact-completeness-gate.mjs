#!/usr/bin/env node
// doc-this-artifact-completeness-gate.mjs — PreToolUse hook on Skill
//
// Mechanically enforces per-module doc_level artifact completeness (BUG-004) at
// the analysis→interpretation transition. The Code Analyst's "module complete"
// predicate only ever checked file-READ coverage (all_files ⊆ ledger), never
// artifact-WRITE coverage — so a module under delivery pressure could read every
// file, drop its entities into modules.json, and skip data-dictionary/[module].md
// and flowcharts/[module].md. Early modules shipped without their detailed
// artifacts; the drift was caught by accident, not by the pipeline. Prose forbids
// it (code-analyst SKILL "Per-module checkpoint"); this gate makes it mechanical.
//
// Transition checked (doc_level ∈ {standard, detailed} only):
//   detective ← analysis: for every module in .doc-this/context/modules.json,
//     data-dictionary/[module].md exists+non-empty  IFF  entities[] is non-empty
//     flowcharts/[module].md      exists+non-empty  IFF  functions[] OR algorithms[] non-empty
//
// The contract keys on modules.json COUNTS + filesystem existence only — no
// content judgment, no language-dependent header parsing (the per-module filename
// is the language-independent module slug, mirroring flowcharts/[module].md). The
// `detailed` per-function flowcharts/[module]-[function].md are NOT gated (function
// slugging is lossy) — they stay a prose + Reviewer obligation.
//
// doc_level=minimal passes through (artifacts embedded in code-analysis.md per the
// matrix). Legacy runs (no modules.json) get an advisory, never a deny. Skips when
// .doc-this/state.json doesn't exist (not a doc-this project). Fail-open on
// malformed modules.json (own-infrastructure problems never hard-block;
// pipeline-state problems do).

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  readHookInput,
  parseInput,
  bypassActive,
  bypassHint,
  statePath,
  stateField,
  readJson,
  nonEmptyFile,
  log,
  allow,
  deny,
  advise,
  failOpen,
  capList,
} from './lib/doc-this-checks.mjs';

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    log(ctx, 'exempt', 'artifact-completeness-gate', 'bypass marker present');
    return allow();
  }

  if (!statePath(ctx.cwd)) {
    return allow();
  }

  const skillName = ctx.toolInput.skill || '';
  // Only the analysis→interpretation transition is checked. Everything else
  // passes through silently (ordering is the checkpoint gate's job; file/UI/
  // matrix coverage is the coverage gate's). This gate runs AFTER the coverage
  // gate, so by here modules.json all_files is already verified trustworthy.
  if (skillName !== 'doc-this:doc-this-detective') {
    return allow();
  }

  // doc_level=minimal embeds dictionary/flowcharts in code-analysis.md —
  // nothing per-module to check. Default to standard when unset (the phase gate
  // already blocks the Code Analyst on a null doc_level, so by detective it is
  // normally set).
  const docLevel = stateField(ctx.cwd, 'doc_level');
  if (docLevel === 'minimal') {
    log(ctx, 'allow', skillName, 'doc_level=minimal — artifacts embedded, no per-module check');
    return allow();
  }

  let outputFolder = stateField(ctx.cwd, 'output_folder');
  if (!outputFolder || outputFolder === 'null') {
    outputFolder = '.doc-this-sdd';
  }

  const modulesPath = join(ctx.cwd, '.doc-this', 'context', 'modules.json');
  if (!existsSync(modulesPath)) {
    log(ctx, 'advise', skillName, 'no modules.json — legacy/pre-modules run, artifact completeness not tracked');
    return advise(
      'doc-this artifact-completeness gate: no .doc-this/context/modules.json, so per-module artifact completeness cannot be verified (failing open). This is normal for a legacy run; the coverage gate handles file coverage.',
    );
  }
  const modules = readJson(modulesPath);
  if (modules === null) {
    log(ctx, 'advise', skillName, 'modules.json unreadable — fail-open');
    return advise(
      `doc-this artifact-completeness gate: ${modulesPath} exists but is not valid JSON, so per-module artifact completeness cannot be verified (failing open). Repair modules.json (see doc-this-code-analyst references/modules-schema.md).`,
    );
  }

  const missing = [];
  for (const mod of Array.isArray(modules?.modules) ? modules.modules : []) {
    const name = mod?.name;
    if (!name) continue;
    const nEnt = Array.isArray(mod?.entities) ? mod.entities.length : 0;
    const nFun = Array.isArray(mod?.functions) ? mod.functions.length : 0;
    const nAlg = Array.isArray(mod?.algorithms) ? mod.algorithms.length : 0;
    const dd = `${outputFolder}/data-dictionary/${name}.md`;
    const fc = `${outputFolder}/flowcharts/${name}.md`;
    if (nEnt > 0 && !nonEmptyFile(join(ctx.cwd, dd))) {
      missing.push(`${name}  →  ${dd}  (${nEnt} entities, no data dictionary)`);
    }
    if ((nFun > 0 || nAlg > 0) && !nonEmptyFile(join(ctx.cwd, fc))) {
      missing.push(`${name}  →  ${fc}  (${nFun} fn / ${nAlg} algo, no flowchart)`);
    }
  }

  if (missing.length > 0) {
    const shortName = skillName.replace(/^doc-this:/, '');
    const reason =
      `doc-this artifact-completeness gate: cannot start ${shortName} — doc_level=${docLevel} requires per-module artifacts, but ${missing.length} module artifact(s) are missing (showing up to 20):\n${capList(missing)}\n\n` +
      `When doc_level is standard or detailed, each module needs data-dictionary/[module].md (iff it has entities) and flowcharts/[module].md (iff it has functions or algorithms). A module that read every file but skipped these is NOT complete — entities recorded only in modules.json do not substitute for data-dictionary/[module].md. Resume the Code Analyst to emit the missing artifacts, or run '/doc-this --backfill-artifacts' to regenerate them from modules.json + code-analysis.md.\n\n` +
      bypassHint(ctx.sessionId);
    log(ctx, 'deny', skillName, `artifact completeness incomplete: ${missing.length} missing per-module artifacts`);
    return deny(reason);
  }

  log(ctx, 'allow', skillName, `per-module artifact completeness verified (doc_level=${docLevel})`);
  return allow();
});
