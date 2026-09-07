# Schema — `.doc-this/viewer/viewer-manifest.json`

The single contract between `build-manifest.mjs` (producer) and the Svelte viewer
(consumer). The viewer fetches this once on load and renders the whole sidebar from it,
because a static HTTP server cannot list a directory as JSON.

**Stability rule:** no wall-clock `generated_at` field — the manifest is a pure function
of the on-disk doc-this output, so two runs over the same tree produce byte-identical
output (the `test-build-manifest.mjs` idempotency check depends on this). `launch.mjs`
rebuilds it on every launch, so freshness comes from re-running, not from a timestamp.

## Path convention

Every `path` is **relative to the project root** (the HTTP document root), e.g.
`.doc-this-sdd/orders/requirements.md`, `docs/requirements/FR-001-login.md`,
`.doc-this-sdd/external-surface.json`. The viewer prepends `/` and fetches same-origin.

## Top-level shape

```jsonc
{
  "schema_version": 1,
  "project": "legacy-app",                 // from state.json; "project" fallback "(unknown)"
  "doc_level": "standard",                 // state.json.doc_level — may be null
  "doc_language": "English",               // state.json.doc_language — may be null
  "database_ownership": "external",        // state.json.database_ownership — may be null
  "phase": "review",                       // state.json.phase — may be null
  "confidence": { "confirmed_total": 412, "gap_total": 37 },   // summed 🟢/🔴 over all files
  "coverage": {                            // null when state.json has no coverage block (legacy run)
    "files_total_source": 2000,
    "files_analyzed": 1720,
    "files_pending": 280,
    "percent": 86.0                        // analyzed/total*100 to 1dp (half-to-even); null when total == 0
  },
  "manifest_counts": { "source": 2000, "generated": 960, "vendored": 275, "binary": 320 }, // or null
  "has_surface": true,                     // external-surface.json present in the discovery folder?
  "sources": [ /* one or two — see below */ ]
}
```

## `sources[]`

A source is a top-level tree the viewer can switch between. Emitted only when it has
at least one non-empty group.

- `discovery` — the rich staging tree (`output_folder`, default `.doc-this-sdd`).
- `sdlc` — the promoted tree (`docs/`), present only after `doc-this-promote` ran.

```jsonc
{ "id": "discovery", "label": "Discovery (.doc-this-sdd)", "groups": [ /* Group… */ ] }
```

## `Group`

```jsonc
{
  "id": "units",
  "label": "Units",
  "icon": "📦",
  "kind": "markdown",            // "markdown" | "surface" | "coverage"
  "source": null,                // for kind:"surface" → path to external-surface.json
  "items": [ /* Item… — for flat markdown groups */ ],
  "subgroups": [ /* {id,label,items[]} — used only by the Units group */ ]
}
```

- `kind:"markdown"` → render `items[]` (and `subgroups[]` for Units) as a nav list; each
  item opens a rendered Markdown pane.
- `kind:"surface"` → synthetic; the viewer fetches `source` (`external-surface.json`) and
  renders the interactive Surface Catalog table. No `items`.
- `kind:"coverage"` → synthetic; the viewer reads top-level `coverage` + `manifest_counts`.
  No `items`.

### `Item`

```jsonc
{
  "path": ".doc-this-sdd/orders/requirements.md",
  "title": "Orders — Requirements",      // first H1, else prettified filename
  "confirmed": 14,                        // count of 🟢 in the file
  "gaps": 3,                              // count of 🔴 in the file
  "excerpt": "This unit owns order placement and…",  // ~160 chars, stripped, single line
  "lang": "feature"                       // optional; "feature" for .feature files (gherkin render)
}
```

## Group ordering (stable, so the sidebar never reshuffles)

- **discovery:** Overview · Units · Surface Catalog · Diagrams · Domain & Rules · Database ·
  UI · Design System · Traceability · OpenAPI · Coverage · Questions & Gaps.
- **sdlc:** Requirements · ADRs · Design · Feature Specs · Traceability · Docs.

Within a group, items sort alphabetically by title; the Units subgroup orders files
requirements → design → tasks → contracts → flows → edge-cases → decisions → questions →
screens → (others alpha).

## Discovery classification rules (path relative to `output_folder`)

| Group | Rule |
|---|---|
| Units | file inside a subdir that contains `requirements.md` (sub-grouped by that dir name) |
| Diagrams | `flowcharts/*`, `c4-*.md`, `erd-*.md`, `state-machines.md` |
| Domain & Rules | `domain.md`, `permissions.md`, `decision-traces/*`, `user-stories/*` |
| Data Dictionary | `data-dictionary/*` (per-module), `data-dictionary.md` (roll-up index) |
| Database | `database/*` |
| UI | `ui/*` |
| Design System | `design-system/*` |
| Traceability | `traceability/*` |
| OpenAPI | `openapi/*.yaml` |
| Questions & Gaps | `questions.md`, `gaps.md`, `confidence-report.md` |
| ADRs | `adrs/*`, `adr/*` |
| Overview | everything else top-level (`inventory.md`, `dependencies.md`, `architecture.md`, `code-analysis.md`, `dynamic.md`, …) |

Synthetic: **Surface Catalog** when `external-surface.json` exists; **Coverage** when a
`coverage` block or `manifest_counts` exists.

## SDLC classification rules (path relative to project root)

| Group | Rule |
|---|---|
| Requirements | `docs/requirements/*.md` |
| ADRs | `docs/adr/*.md`, `docs/adrs/*.md` |
| Traceability | `docs/TRACEABILITY.md` |
| Design | `docs/design/*.md` |
| Feature Specs | `*.feature` under `docs/`, `features/`, `tests/`, `test/`, `specs/`, `spec/`, or root |
| Docs | any other `docs/**/*.md` |
</content>
