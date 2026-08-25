# Checkpoint Guide — `.doc-this/state.json`

Doc-This is the **only** agent that writes to `state.json`. Sub-agents return their results and Doc-This persists the checkpoint.

## Absolute rules

1. **Never remove existing fields.** Only add or update.
2. **Always read before writing** — another part of the flow may have updated `checkpoints`.
3. **Save after every completed phase**, not only at the end.
4. **On context overflow**, save immediately before pausing.

## What to save at each step

### Starting a phase

```json
{ "phase": "reconnaissance" }
```

### Completing an agent

```json
{
  "checkpoints": {
    "scout": {
      "completed_at": "2026-05-04T14:30:00Z",
      "files": [
        ".doc-this-sdd/inventory.md",
        ".doc-this-sdd/dependencies.md",
        ".doc-this/context/surface.json"
      ]
    }
  }
}
```

### Completing a full phase

```json
{
  "phase": "analysis",
  "completed": ["reconnaissance"],
  "pending": ["analysis", "interpretation", "synthesis", "generation", "review"]
}
```

### Partial Code Analyst progress

```json
{
  "checkpoints": {
    "code_analyst": {
      "modules_analyzed": ["auth", "orders"],
      "modules_pending": ["payments", "users"]
    }
  },
  "coverage": {
    "files_total_source": 2000,
    "files_analyzed": 1720,
    "files_pending": 280,
    "ledger_path": ".doc-this/context/coverage-ledger.json",
    "cursor": { "module": "payments", "next_file": "src/payments/refund_form.aspx" },
    "updated_at": "2026-06-10T15:00:00Z"
  }
}
```

### Coverage rules (Total Source Coverage)

- The full `files_analyzed` path array lives in `.doc-this/context/coverage-ledger.json` (**append-only** — it never shrinks across sessions; the Code Analyst appends as it reads). `state.json` carries only the compact summary above.
- Refresh `coverage` (counters via jq set-difference of ledger vs manifest) at **every** checkpoint, **every** preventive pause, and **every** context-overflow save. The `cursor` is what lets a 9k-file repo span many sessions safely — losing it means re-deriving the unread set.
- A module checkpoint is written only when that module's `all_files ⊆` ledger `files_analyzed`. A module with pending files is in-progress, never checkpointed.
- `coverage` absent entirely = legacy run from before this feature; the coverage gate is advisory there. `--backfill-coverage` migrates it.

### Backfill fan-out checkpoints (`--backfill-coverage` 3a)

- The ledger advances **only at verified merge time** (reader's `files_read` == assigned set), never when a reader merely finishes. This keeps the ledger trustworthy regardless of reader model or crashes.
- Resume after a crash = recompute the unread set (manifest ∖ ledger, step-06 §2). Unmerged chunk work is disposable by design — staging files for unmerged chunks can be deleted and the chunk re-dispatched; nothing unverified ever entered the record.
- `coverage.backfill.dispatched` / `.merged` track chunk slugs for observability; `cursor` may be `null` during fan-out (see `state-schema.md`). Refresh `coverage` counters at every merge, same jq set-difference discipline as above.

### Database context (after step-04)

```json
{
  "database_ownership": "external",
  "schema_versioning": "unversioned"
}
```

## Phase progression

```
null → reconnaissance → analysis → interpretation → synthesis → generation → review
```

**Legacy aliases**: runs created before the Code Analyst rename use phase `excavation` and checkpoint key `archaeologist`. Readers accept both (`.checkpoints.code_analyst // .checkpoints.archaeologist`); writers use the new names. Never rewrite a legacy key in place — add the new key alongside if needed.

When moving to a new phase:
- Move the completed phase from `pending` to `completed`
- Update `phase` to the next phase

## Context-overflow message

If context is running out, save the checkpoint immediately (including `coverage` + `cursor`) and say:

> "[Name], pausing here to preserve context. Everything is saved in `.doc-this/state.json` — analyzed [A]/[T] source files; [B] remaining in module **[X]**, resuming at `[next_file]`. Type `/doc-this` in a new session to continue."

Pausing-and-resuming is the designed answer to token pressure. Skipping, sampling, or outlining files to "save tokens" is a Total-Source-Coverage violation (see the describe-only pact) — the cursor exists precisely so coverage never has to be traded away.

## Example: state.json mid-analysis

```json
{
  "version": "1.0.0",
  "project": "acme-billing",
  "user_name": "<your name>",
  "chat_language": "en-us",
  "doc_language": "English",
  "answer_mode": "chat",
  "doc_level": "standard",
  "output_folder": ".doc-this-sdd",
  "phase": "analysis",
  "completed": ["reconnaissance"],
  "pending": ["analysis", "interpretation", "synthesis", "generation", "review"],
  "database_ownership": "external",
  "schema_versioning": "unversioned",
  "checkpoints": {
    "scout": {
      "completed_at": "2026-05-04T14:30:00Z",
      "files": [
        ".doc-this-sdd/inventory.md",
        ".doc-this/context/surface.json"
      ]
    },
    "code_analyst": {
      "modules_analyzed": ["billing", "invoicing"],
      "modules_pending": ["payments", "reports"]
    }
  },
  "engines": ["claude-code"],
  "agents": ["doc-this", "doc-this-scout", "doc-this-code-analyst"],
  "created_files": [".doc-this/state.json", ".doc-this/plan.md"]
}
```
