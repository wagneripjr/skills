#!/usr/bin/env node
// doc-this-coverage-gate.mjs — PreToolUse hook on Skill
//
// Mechanically enforces Total Source Coverage (describe-only pact) at phase
// transitions. Agents under token pressure rationalize skipping files and
// recording their contents as 🔴 gaps — observed case: hundreds of WebForms markup files
// counted in the inventory, never read, openly logged as "not read in full".
// Prose forbids that (the pact); this gate makes it mechanical.
//
// Transition checks (all derived from .doc-this/context/file-manifest.json):
//   detective ← analysis:   every manifest source file is in the coverage
//                           ledger; no source file is unassigned (must appear in
//                           modules.json all_files ∪ exclusions)
//   writer    ← synthesis:  every manifest markup page has a per-page kind:ui
//                           entry in <output_folder>/external-surface.json
//   reviewer  ← generation: code-spec-matrix.md has a row per source file
//
// Legacy runs (no file-manifest.json — created before this feature) get an
// advisory pointing at `/doc-this --backfill-coverage`, never a deny: the gate
// must not brick in-flight pre-coverage projects.
//
// Skips when .doc-this/state.json doesn't exist (not a doc-this project).
// Fail-open on malformed manifest/ledger (own-infrastructure problems never
// hard-block; pipeline-state problems do).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  readHookInput,
  parseInput,
  bypassActive,
  bypassHint,
  statePath,
  stateField,
  readJson,
  log,
  allow,
  deny,
  advise,
  failOpen,
  sortedUnique,
  setDifference,
  capList,
} from './lib/doc-this-checks.mjs';

const CHECKS = {
  'doc-this:doc-this-detective': 'analysis',
  'doc-this:doc-this-writer': 'ui',
  'doc-this:doc-this-reviewer': 'matrix',
};

await failOpen(async () => {
  const ctx = parseInput(await readHookInput());

  if (bypassActive(ctx.sessionId)) {
    log(ctx, 'exempt', 'coverage-gate', 'bypass marker present');
    return allow();
  }

  if (!statePath(ctx.cwd)) {
    return allow();
  }

  const skillName = ctx.toolInput.skill || '';
  // Only the three coverage-bearing transitions are checked. Everything else —
  // scout/code-analyst/architect activations, optional agents, non-doc-this
  // skills — passes through silently (ordering itself is the checkpoint gate's
  // job, not this one's).
  const check = CHECKS[skillName];
  if (!skillName || !check) {
    return allow();
  }

  const shortName = skillName.replace(/^doc-this:/, '');

  const manifestPath = join(ctx.cwd, '.doc-this', 'context', 'file-manifest.json');
  if (!existsSync(manifestPath)) {
    log(ctx, 'advise', skillName, 'legacy run: no file-manifest.json, coverage not tracked');
    return advise(
      "doc-this coverage-gate: this run predates Total Source Coverage (no .doc-this/context/file-manifest.json), so file coverage is not tracked. Consider '/doc-this --backfill-coverage' to generate the manifest, read every unread source file, and reconcile self-inflicted 🔴 gaps.",
    );
  }

  // Manifest source slice — the coverage universe. Empty/unparseable manifest
  // is an own-infrastructure problem: fail open.
  const manifest = readJson(manifestPath);
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const src = sortedUnique(files.filter((f) => f?.class === 'source').map((f) => f?.path));
  if (src.length === 0) {
    log(ctx, 'allow', skillName, 'manifest has no source entries (or unparseable) — fail-open');
    return allow();
  }

  let outputFolder = stateField(ctx.cwd, 'output_folder');
  if (!outputFolder || outputFolder === 'null') {
    outputFolder = '.doc-this-sdd';
  }

  const hint = bypassHint(ctx.sessionId);

  if (check === 'analysis') {
    const ledgerPath = join(ctx.cwd, '.doc-this', 'context', 'coverage-ledger.json');
    let led = [];
    if (existsSync(ledgerPath)) {
      const ledger = readJson(ledgerPath);
      if (ledger === null) {
        log(ctx, 'advise', skillName, 'coverage-ledger.json unreadable — fail-open');
        return advise(
          `doc-this coverage-gate: ${ledgerPath} exists but is not valid JSON, so coverage cannot be verified (failing open). Repair the ledger — it should be {"files_analyzed": ["path", ...]}.`,
        );
      }
      led = sortedUnique(Array.isArray(ledger?.files_analyzed) ? ledger.files_analyzed : []);
    }

    const unread = setDifference(src, led);
    if (unread.length > 0) {
      const reason =
        `doc-this coverage-gate: cannot start ${shortName} — analysis coverage is incomplete: ${unread.length} source file(s) from file-manifest.json are not in the coverage ledger (showing up to 20):\n${capList(unread)}\n\n` +
        `Total Source Coverage (describe-only pact) requires every first-party source file analyzed before interpretation. Resume the code analyst — it continues from coverage.cursor in .doc-this/state.json. Do NOT declare these files' contents as 🔴 gaps; read them.\n\n${hint}`;
      log(ctx, 'deny', skillName, `analysis coverage incomplete: ${unread.length} unread source files`);
      return deny(reason);
    }

    const modules = readJson(join(ctx.cwd, '.doc-this', 'context', 'modules.json'));
    const assigned = sortedUnique([
      ...(Array.isArray(modules?.modules)
        ? modules.modules.flatMap((m) => (Array.isArray(m?.all_files) ? m.all_files : []))
        : []),
      ...(Array.isArray(modules?.exclusions)
        ? modules.exclusions.map((e) => e?.path).filter(Boolean)
        : []),
    ]);
    const unassigned = setDifference(src, assigned);
    if (unassigned.length > 0) {
      const reason =
        `doc-this coverage-gate: cannot start ${shortName} — module assignment is incomplete: ${unassigned.length} source file(s) appear in no module's all_files and no exclusions entry of .doc-this/context/modules.json (showing up to 20):\n${capList(unassigned)}\n\n` +
        `Every source file must belong to a module (all_files, derived from the manifest by path prefix) or carry a justified exclusions entry — an orphaned file is a coverage hole. See doc-this-code-analyst references/modules-schema.md.\n\n${hint}`;
      log(ctx, 'deny', skillName, `module assignment incomplete: ${unassigned.length} unassigned source files`);
      return deny(reason);
    }

    log(ctx, 'allow', skillName, 'analysis coverage complete');
    return allow();
  }

  if (check === 'ui') {
    const markup = sortedUnique(files.filter((f) => f?.subclass === 'markup').map((f) => f?.path));
    if (markup.length === 0) {
      log(ctx, 'allow', skillName, 'no markup files in manifest — ui check not applicable');
      return allow();
    }

    const surfacePath = join(ctx.cwd, outputFolder, 'external-surface.json');
    if (!existsSync(surfacePath)) {
      const reason =
        `doc-this coverage-gate: cannot start ${shortName} — ${outputFolder}/external-surface.json not found, but the manifest lists markup pages. The architect must emit the catalog (with one kind:ui entry per markup page) before the writer runs.\n\n${hint}`;
      log(ctx, 'deny', skillName, 'external-surface.json missing while manifest has markup');
      return deny(reason);
    }
    const surface = readJson(surfacePath);
    if (surface === null) {
      log(ctx, 'advise', skillName, 'external-surface.json unreadable — fail-open');
      return advise(
        `doc-this coverage-gate: ${surfacePath} is not valid JSON, so per-page UI coverage cannot be verified (failing open). Repair the catalog.`,
      );
    }

    const uiPages = sortedUnique(
      (Array.isArray(surface?.entries) ? surface.entries : [])
        .filter((e) => e?.kind === 'ui')
        .map((e) => String(e?.page || '').split(':')[0]),
    );
    const missing = setDifference(markup, uiPages);
    if (missing.length > 0) {
      const reason =
        `doc-this coverage-gate: cannot start ${shortName} — ${missing.length} markup page(s)/control(s) from file-manifest.json have no per-page kind:ui entry in external-surface.json (showing up to 20):\n${capList(missing)}\n\n` +
        `UI entries are one-per-page (controls: subkind "control" + mounted_in) — never "pages grouped by module". Re-run the architect against the manifest markup slice.\n\n${hint}`;
      log(ctx, 'deny', skillName, `per-page ui coverage incomplete: ${missing.length} markup files without ui entries`);
      return deny(reason);
    }

    log(ctx, 'allow', skillName, 'per-page ui coverage complete');
    return allow();
  }

  if (check === 'matrix') {
    const matrixPath = join(ctx.cwd, outputFolder, 'traceability', 'code-spec-matrix.md');
    if (!existsSync(matrixPath)) {
      const reason =
        `doc-this coverage-gate: cannot start ${shortName} — ${outputFolder}/traceability/code-spec-matrix.md not found. The writer must generate it from file-manifest.json (one row per source file; n/a only for modules.json exclusions) before review.\n\n${hint}`;
      log(ctx, 'deny', skillName, 'code-spec-matrix.md missing');
      return deny(reason);
    }

    // First table cell of each row, backticks/spaces stripped; require a dot or
    // slash so header/separator rows never count as paths.
    let matrixText = '';
    try {
      matrixText = readFileSync(matrixPath, 'utf8');
    } catch {
      matrixText = '';
    }
    const rows = sortedUnique(
      matrixText
        .split('\n')
        .map((line) => line.split('|'))
        .filter((parts) => parts.length >= 3)
        .map((parts) => parts[1].replace(/[` ]/g, ''))
        .filter((cell) => /[./]/.test(cell)),
    );
    const missing = setDifference(src, rows);
    if (missing.length > 0) {
      const reason =
        `doc-this coverage-gate: cannot start ${shortName} — code-spec-matrix.md does not cover all source files: ${missing.length} manifest source file(s) have no row (showing up to 20):\n${capList(missing)}\n\n` +
        `Regenerate the matrix from the manifest source slice (jq -r '.files[]|select(.class=="source")|.path' .doc-this/context/file-manifest.json) — a matrix built from memory is the silent undercount this gate exists to catch.\n\n${hint}`;
      log(ctx, 'deny', skillName, `code-spec-matrix incomplete: ${missing.length} source files without rows`);
      return deny(reason);
    }

    log(ctx, 'allow', skillName, 'code-spec-matrix covers all source files');
    return allow();
  }

  return allow();
});
