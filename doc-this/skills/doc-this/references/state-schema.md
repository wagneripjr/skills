# Schema — `.doc-this/state.json`

This file persists the full Discovery state across sessions. Doc-This reads and writes it; sub-agents only read it (their checkpoints come back to Doc-This which writes them).

## Full structure

```json
{
  "version": "1.0.0",
  "project": "project-name",
  "user_name": "<your name>",
  "chat_language": "en-us",
  "doc_language": "English",
  "answer_mode": "chat",
  "doc_level": null,
  "output_folder": ".doc-this-sdd",
  "phase": "reconnaissance",
  "completed": [],
  "pending": ["reconnaissance", "analysis", "interpretation", "synthesis", "generation", "review"],
  "database_ownership": null,
  "schema_versioning": null,
  "legacy_runnable": null,
  "tracer_declined": null,
  "engines": ["claude-code"],
  "agents": ["doc-this", "doc-this-scout", "doc-this-code-analyst", "doc-this-detective", "doc-this-architect", "doc-this-writer", "doc-this-reviewer"],
  "checkpoints": {
    "scout": {
      "completed_at": "2026-05-04T14:00:00Z",
      "files": [
        ".doc-this-sdd/inventory.md",
        ".doc-this-sdd/dependencies.md",
        ".doc-this/context/surface.json"
      ]
    }
  },
  "created_files": [
    ".doc-this/state.json",
    ".doc-this/plan.md"
  ],
  "structural_extraction": {
    "lsp_available": true,
    "lsp_languages": ["csharp", "typescript"],
    "ua_detected": true,
    "ua_graph_path": ".understand-anything/knowledge-graph.json",
    "ua_commit_hash": "abc1234",
    "ua_staleness": false,
    "preferred_source": "lsp"
  },
  "coverage": {
    "files_total_source": 2000,
    "files_analyzed": 1720,
    "files_pending": 280,
    "ledger_path": ".doc-this/context/coverage-ledger.json",
    "cursor": { "module": "Reports", "next_file": "Web/reports/rpt_consolidated.aspx" },
    "updated_at": "2026-06-10T15:00:00Z"
  },
  "incremental": null
}
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Doc-This version that initialized this state |
| `project` | string | Legacy project name |
| `user_name` | string | User's name (for greetings and prompts) |
| `chat_language` | string | Dialogue language (default `en-us`) |
| `doc_language` | string | Generated specs language (default `English`) |
| `answer_mode` | string | `chat` or `file` — how the user responds to gap questions |
| `doc_level` | string \| null | `minimal` / `standard` / `detailed`. Starts `null` — set by user after Scout. |
| `output_folder` | string | Staging output folder (default `.doc-this-sdd`) |
| `phase` | string \| null | Current phase. `null` = not started |
| `completed` | string[] | Phases completed |
| `pending` | string[] | Phases pending |
| `database_ownership` | string \| null | `owned` / `external` / `mixed` / `none`. Starts `null` — set by step-04 after Scout. |
| `schema_versioning` | string \| null | `in-repo` / `external` / `unversioned` / `unknown`. Starts `null` — set by step-04 after Scout. |
| `legacy_runnable` | string \| null | `yes` / `prod-only` / `no` — can the legacy system be run for testing? Set by step-01 §2a (legacy states: asked once on next resume, step-02 §3b). `prod-only`/`no` make the Tracer hard-advisory (SKILL.md → "Runnability and the Tracer"). |
| `tracer_declined` | object \| null | `{"reason": string, "at": ISO-timestamp}` — explicit user decline of the hard-advisory Tracer; substitutes for a Tracer checkpoint in the completion rule. `null` when not declined. |
| `checkpoints` | object | Per-agent completion record (timestamp + files written) |
| `engines` | string[] | Configured engines (`claude-code`, `agy` for Antigravity cross-review, etc.) |
| `agents` | string[] | Installed agent skills |
| `created_files` | string[] | All files Doc-This created (for safe uninstall) |
| `structural_extraction` | object \| null | LSP and UA availability. See below. |
| `coverage` | object \| null | Total Source Coverage summary (compact — the big array lives in the ledger). See below. Absent = legacy run (pre-coverage); the coverage gate is advisory there and `--backfill-coverage` is the migration path. |
| `incremental` | object \| null | Incremental re-analysis state. See `step-05-incremental.md`. |

## Phases (in order)

```
null → reconnaissance → analysis → interpretation → synthesis → generation → review
```

**Legacy aliases** (runs created before the Code Analyst rename): phase `excavation` = `analysis`, checkpoint key `archaeologist` = `code_analyst`. Every reader of `state.json` must accept both spellings (`.checkpoints.code_analyst // .checkpoints.archaeologist`); writers use the new canonical names.

## Write rules

1. **Never remove existing fields.** Only add or update.
2. **Always read before writing.** Sub-agents may have updated `checkpoints`.
3. **Save after every completed phase**, not only at the end.
4. **On context overflow**, save immediately before pausing.

## `structural_extraction` fields

| Field | Type | Description |
|-------|------|-------------|
| `lsp_available` | boolean | Whether LSP tool loaded and a language server responded |
| `lsp_languages` | string[] | Languages with working LSP servers (e.g., `["csharp", "typescript"]`) |
| `ua_detected` | boolean | Whether `.understand-anything/knowledge-graph.json` exists |
| `ua_graph_path` | string \| null | Path to UA knowledge graph |
| `ua_commit_hash` | string \| null | Git commit hash UA was built on |
| `ua_staleness` | boolean | True when UA commit differs from current HEAD |
| `preferred_source` | string | `"lsp"`, `"ua"`, or `"llm"` — the primary extraction source |
| `lsp_budget_enforced` | boolean | Whether the LSP budget hooks are active (set to `true` by hooks on first fire) |
| `lsp_call_summary` | object \| null | Per-agent LSP usage summary, written at checkpoint time from the `/tmp/` tracker |

Priority: LSP > UA > LLM. Set in step 4a of `step-01-first-run.md`.

### `lsp_call_summary` shape

Written by the orchestrator at phase-checkpoint time (reading from the per-session tracker file). Provides observability for budget tuning.

```json
{
  "code_analyst": {
    "total_calls": 42,
    "total_time_ms": 180000,
    "calls_by_operation": { "documentSymbol": 25, "hover": 12, "outgoingCalls": 5 },
    "slow_calls_count": 2,
    "budget_denials": 0
  }
}
```

## `coverage` fields (Total Source Coverage)

| Field | Type | Description |
|-------|------|-------------|
| `files_total_source` | number | Count of `class: source` entries in `file-manifest.json` |
| `files_analyzed` | number | Count of ledger `files_analyzed` entries |
| `files_pending` | number | `files_total_source - files_analyzed` (0 required before the interpretation phase) |
| `ledger_path` | string | Always `.doc-this/context/coverage-ledger.json` |
| `cursor` | object \| null | `{module, next_file}` — where a paused analysis resumes. `null` once analysis completes. |
| `updated_at` | string | ISO timestamp of the last refresh |
| `backfill` | object \| null | Only during `--backfill-coverage`: `{"mode": "fanout"\|"inline", "dispatched": [chunk-slugs], "merged": [chunk-slugs]}`. While `backfill.mode` is `fanout`, `cursor` may be `null` even with files pending — chunks complete out of order, and resume is the unread-set recomputation (manifest ∖ ledger), not the cursor. Remove the field when the backfill completes. |
| `fanout` | object \| null | Only during a normal-run Code Analyst fan-out (`references/sonnet-reader-fanout.md`): `{"mode": "fanout"\|"inline", "consented": bool, "dispatched": [chunk-slugs], "merged": [chunk-slugs]}`. Persisted so a resumed session does not re-ask consent — `mode: "inline"` records a declined or unavailable offer. While `mode` is `fanout`, `cursor` may be `null` even with files pending (chunks complete out of order; resume recomputes the unread set). Same shape as `backfill`; the two never coexist. |

**Why the split**: every agent reads `state.json` whole, so it carries only this compact summary. The full path array lives in `.doc-this/context/coverage-ledger.json` (`{"files_analyzed": ["path", …]}`), which is **append-only** and only ever queried with jq slices — at legacy scale it can hold 10k+ paths, and loading it into context would recreate the very token pressure that tempts agents to skip files.

Doc-This refreshes `coverage` at every checkpoint, every preventive pause, and every context-overflow save (counters derived by jq set-difference of ledger vs manifest, never hand-edited). The Code Analyst appends to the ledger; Doc-This owns the summary.

## `incremental` fields

| Field | Type | Description |
|-------|------|-------------|
| `base_commit` | string | Git commit used as diff baseline |
| `changed_files` | string[] | Files changed since base commit |
| `affected_modules` | string[] | Directly affected modules |
| `blast_radius_modules` | string[] | Indirectly affected modules (via call graph) |
| `source` | string | `"lsp"`, `"ua"`, or `"lsp+ua"` |
| `completed_at` | string \| null | ISO timestamp of incremental completion |

Only present during `--incremental` mode. See `step-05-incremental.md`.

## Where NOT to write

The specs-organization decision (granularity, custom folders, Scout's original suggestion, decision timestamp) does **not** go in `state.json`. It is persisted in `.doc-this/config.toml`, section `[specs]`, per `references/step-03-specs-organization.md`. `state.json` is runtime state; `config.toml` is long-term decision.
