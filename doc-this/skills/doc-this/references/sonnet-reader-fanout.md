# Sonnet reader fan-out — shared reading protocol

Turning a set of **unread source files** into transcribed, cited analysis using cheap reader subagents,
while the strong session model keeps all the judgment work (verify, merge, checkpoint). This is the single
source of truth for fan-out reading; two callers use it:

| Caller | Entry | `<staging-dir>` (under `.doc-this-sdd/`) | `<files-json-dir>` (scratch) |
|---|---|---|---|
| **Code Analyst, normal run** | `doc-this-code-analyst/SKILL.md` → "Optional fan-out reading" | `.doc-this-sdd/.analyst-staging/` | `.doc-this/context/analyst-fanout/` |
| **`--backfill-coverage` step 3a** | `step-06-backfill-coverage.md` §3a | `.doc-this-sdd/.backfill-staging/` | `.doc-this/context/backfill/` |

The two differ only in **framing** — the normal run builds fresh artifacts; backfill reconciles existing 🔴
gaps afterward — and in the **consent entry point**. The reading mechanics below are identical.

## Why a cheaper model is safe here

The reading work is **transcription-with-citations**: describe what is in each file, cite `file:line`. It
does not need the strong session model, because every *structural* failure mode is caught mechanically
regardless of which model read the file:

- skipped files → the coverage gate (`ledger ⊉ manifest`) blocks the next phase;
- sampling / judgment phrasing → the describe-only gate denies the reader's own Edit/Write;
- lazy 🔴 gaps → the Reviewer's spot-check escalation.

The strong session model stays where **judgment** lives: dispatch, citation verification, merging,
checkpointing, gap reconciliation, review. The one failure mode no gate catches mechanically — a 🟢
citation pointing at the wrong `file:line` — is covered by `check-cites` at merge (below) and `check-frag`
at any 🔴→🟢 conversion.

## Preconditions and consent

- **Agent tool with a `model` parameter must be available.** If it is not, do not fan out — fall back to
  inline reading (single session) or session-model switching (read on a cheaper session model, switch back
  to the strong model before any merge/reconciliation/review).
- **Parallel execution requires explicit user consent** (`skills/doc-this/SKILL.md`: "parallel agent
  execution … requires explicit user request"). Each caller collects this with its own scope offer before
  dispatching anything. Without consent, read inline.

## 1. Scope and chunk

```bash
SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/doc-this/scripts/backfill-coverage.mjs"
"$SCRIPT" unread --counts   # scope summary (total + per-subclass) for the offer
"$SCRIPT" chunk             # groups the unread set by module prefix, ≤40 files/chunk
```

`unread` computes `manifest source ∖ ledger files_analyzed`, so it is always *exactly the not-yet-read set*
— a fresh run yields the whole codebase, a partially-read run yields only what remains. `chunk` writes the
lists to `.doc-this/context/backfill/chunks/` (a historical scratch name shared by both callers; the lists
are ephemeral) and prints a chunk→count summary. `--max-files N` overrides the 40-file split. Re-running
`chunk` after merges is safe — it regenerates from the *current* unread set.

## 2. Dispatch readers (≤3 concurrent, `model: sonnet`)

Dispatch **one reader per chunk file** via the **Agent tool with `model: sonnet`**, at most **3
concurrently**, pasting the chunk file's contents verbatim into the prompt. Readers are prompt-templated
Agent dispatches — **NOT** a Skill activation of `doc-this-code-analyst`. This matters: the dispatch gate
matches Skill activations only, so readers never trip it, and the pipeline's checkpoints stay with the
caller (the strong session model).

**Reader prompt template** (fill the bracketed parts; set `<staging-dir>` / `<files-json-dir>` from the
table above):

> Read `${CLAUDE_PLUGIN_ROOT}/skills/doc-this/references/describe-only-pact.md` first and obey it. You are
> a coverage reader for project [name]. Read EVERY file in this list — given verbatim, derive nothing from
> memory: [paste chunk file]. Route by subclass: markup, SQL, and other = full Read (control trees,
> validators, data-binding, inline scripts for markup; every statement for SQL); code files = full Read too
> — do not use LSP. For each file, describe what exists with 🟢 `file:line` citations; where the repository
> cannot answer, propose a 🔴 question. Write your analysis (sections per file/area, plus data-dictionary
> rows and flowchart fragments where applicable) to `<staging-dir>[module-slug][-partN].md`, and the exact
> list of files you read to `<files-json-dir>[module-slug][-partN].files.json` as `{"files_read": [...]}` —
> pure JSON, no prose. Do NOT touch `coverage-ledger.json`, `code-analysis.md`, `modules.json`, or
> `state.json` — the caller is the single writer for those.

Staging lives under `.doc-this-sdd/` **deliberately**: the describe-only gate resolves the project from the
target file's path and fires on writes there, so a reader's pact violation is denied at its own Edit/Write —
not discovered later, and regardless of the subagent's cwd.

## 3. Verify before merge (the caller, on the strong model — never trust the output stream, only the files)

Per completed chunk:

1. Missing or 0-byte staging `.md` / `.files.json` ⇒ not done → re-dispatch that chunk.
2. `"$SCRIPT" verify-chunk <chunk.txt> <files.json>` — exit 0 means `files_read` equals the assigned set;
   exit 1 prints `MISSING:` / `EXTRA:` lines → re-dispatch the missing files as a remainder chunk. **Only
   after this passes** append the chunk's paths to `coverage-ledger.json` `files_analyzed[]` — the ledger
   never records an unverified read.
3. `"$SCRIPT" check-cites <staging.md>` — exit 1 prints `BAD CITE` lines (nonexistent file or out-of-range
   line) → re-dispatch the chunk with the offending citations listed.
4. Merge the staging content **incrementally** (update sections, never wipe — same discipline as
   `--incremental`) into `code-analysis.md`, each touched module's `data-dictionary/[module].md` (and the
   `data-dictionary.md` roll-up index), `flowcharts/[module].md`, and `modules.json` (complete `all_files`,
   plus `entities`/`functions`/`algorithms`); fold proposed 🔴s into `questions.md`; delete the staging pair;
   checkpoint.

**Per-module artifact obligation.** A merged module is not complete until its `doc_level`
deliverables exist on disk — `data-dictionary/[module].md` iff it has ≥1 entity, `flowcharts/[module].md`
iff it has ≥1 function or algorithm. `hooks/doc-this-artifact-completeness-gate.mjs` re-checks this at the
Detective transition; recording entities only in `modules.json` is not enough.

## 4. Resume

The ledger advances only at verified merge, so re-running step 1 (`unread` + `chunk`) **is** the resume
mechanism: a crashed session loses at most unmerged chunk work, which is re-derived deterministically — no
double-reads enter the record. Track progress in `state.json.coverage` (`fanout` for the normal run,
`backfill` for backfill — see `state-schema.md`); during fan-out `cursor` may be `null` with files still
pending, because chunks complete out of order.

## Model and cost guidance

| Work | Model |
|---|---|
| Manifest + set math (steps 1, 3 checks) | none (bash/jq) |
| Reading the unread set (step 2) | **Sonnet** — transcription with citations; structural failures are gate-caught |
| Verify, merge, checkpoint (step 3) | session model — it owns the ledger and the artifacts |
| Gap reconciliation, review (backfill only) | session model (strong) — semantic judgment; a wrong 🔴→🟢 manufactures a false citation |

**Sonnet is the floor** — the Haiku tier was evaluated and rejected because markup extraction needs more
discernment than pure transcription. **No `model` parameter in this harness?** Fall back to session-model
switching: run the reading sessions on a cheaper session model, switch back to the strong model before any
merge, reconciliation, or review.
