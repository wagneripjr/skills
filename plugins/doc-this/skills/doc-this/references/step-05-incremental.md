# Step 5 — Incremental Re-Analysis (`--incremental`)

Re-analyze only the modules affected by code changes since the last doc-this run. Requires a completed previous run (at least through Writer) and either LSP or UA for blast-radius computation.

## Prerequisites

1. `state.json.phase` is `"review"` or in `completed` (full pipeline ran before)
2. `state.json.structural_extraction.lsp_available` is `true` OR `state.json.structural_extraction.ua_detected` is `true`
3. A `checkpoints.writer` entry exists in `state.json`

If prerequisites are not met, inform the user and suggest `--regenerate=<phase>` instead.

## 1. Compute changed files

```bash
git diff <base_commit>..HEAD --name-only
```

Where `<base_commit>` is the most recent of:
- `state.json.checkpoints.writer.completed_at` timestamp → `git log --before="<timestamp>" -1 --format=%H`
- `state.json.structural_extraction.ua_commit_hash` (if UA was used)

Filter the diff to only source files (exclude `.doc-this-sdd/`, `.doc-this/`, `docs/`, test files, config files). If no source files changed, inform the user and exit.

## 2. Map changed files to modules

Match each changed file path against `.doc-this/context/surface.json` → `modules[]` to identify which doc-this modules are **directly affected**.

## 3. Compute blast radius

### Via LSP (preferred)

For each changed file:
1. Run `documentSymbol` to get all exported symbols
2. For each public symbol, run `incomingCalls` → collect all calling files
3. Map calling files to their modules (via `surface.json`)
4. These are the **indirectly affected** modules

### Via UA (fallback)

For each changed file:
1. Grep `knowledge-graph.json` for nodes matching the file path
2. Grep edges where matched node IDs appear as `target` with type `imports` or `calls`
3. Resolve edge `source` nodes to their file paths and map to modules

### Combined (when both available)

Use LSP for blast radius (more accurate), cross-validate with UA edges. Log any modules that UA identifies but LSP misses — those may be non-code dependencies (config-driven wiring).

## 4. Build incremental plan

Create `.doc-this/incremental-plan.md`:

```markdown
# Incremental Re-Analysis — [project]

**Changed files**: [list]
**Directly affected modules**: [list]
**Blast radius modules**: [list]
**Total modules to re-analyze**: [count] of [total]

## Code Analyst — re-analyze affected modules
- [ ] Module: [name] (directly affected)
- [ ] Module: [name] (blast radius)

## Detective — re-check rules in affected modules
- [ ] Re-extract rules for [module]

## Architect — update affected diagrams
- [ ] Update spec-impact-matrix rows for affected components
- [ ] Update C4 Components diagram if module boundaries shifted

## Writer — regenerate affected unit specs
- [ ] Unit: [name]

## Reviewer — validate changed specs
- [ ] Cross-check updated specs
```

Present the plan and ask: "[Name], I identified [N] modules affected by [M] file changes. Want to proceed with incremental re-analysis?"

## 5. Execute

Run each agent only on affected modules:

- **Code Analyst**: Re-analyze only the listed modules. Update (not replace) `code-analysis.md` sections and `modules.json` entries. Preserve unchanged module sections.
- **Detective**: Re-check only rules in affected modules. Update `domain.md` entries. Preserve unchanged rules.
- **Architect**: Update spec-impact-matrix rows for affected components. Re-render C4 diagrams only if component boundaries shifted.
- **Writer**: Regenerate only affected unit specs. Preserve unchanged unit folders.
- **Reviewer**: Validate only the changed specs.

### Merge strategy

Updated content replaces the corresponding section in existing artifacts:
1. Write updated section to a temp file
2. Diff against the existing section
3. If the diff is non-empty, replace the section in the artifact
4. If the diff is empty, skip (nothing changed despite file edits)

Never delete sections for modules that weren't re-analyzed.

## 6. Save state

Update `state.json`:

```json
{
  "incremental": {
    "base_commit": "<commit used>",
    "changed_files": ["..."],
    "affected_modules": ["..."],
    "blast_radius_modules": ["..."],
    "source": "lsp" | "ua" | "lsp+ua",
    "completed_at": "2026-05-25T10:00:00Z"
  }
}
```

## Edge cases

- **New files** in the diff that don't belong to any existing module → inform the user. May need full `--regenerate=reconnaissance` if the project structure changed significantly.
- **Deleted files** → remove their entries from `modules.json` and `code-analysis.md`. Flag to the user if a deleted file was the primary file for a module.
- **Moved/renamed files** → `git diff --diff-filter=R` detects renames. Update file paths in artifacts without re-analyzing the module content.
- **`--incremental --deep`** → follow 2-hop call chains instead of 1-hop for blast radius. Use when user suspects wider impact.
