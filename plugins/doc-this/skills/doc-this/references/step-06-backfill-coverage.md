# Step 6 — Coverage Backfill (`--backfill-coverage`)

Brings a run into Total Source Coverage compliance after the fact. Two audiences:

- **Legacy runs** created before the coverage feature (no `file-manifest.json`) — e.g., a project whose analysis sampled markup/SQL and recorded the unread contents as 🔴 gaps.
- **Interrupted or bypassed runs** where the ledger lags the manifest.

The backfill reads ONLY the unread set — it never re-reads what the ledger already records, and it is non-destructive outside `.doc-this/` + `<output_folder>/` (the absolute rule applies unchanged).

All deterministic shell work goes through ONE bundled script — define it once and use it for every set-math, chunking, and verification step:

```bash
SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/doc-this/scripts/backfill-coverage.mjs"
```

Do NOT improvise compound bash (redirects to /tmp, `cd … && …`, `while read` loops, `xargs`, process substitution) for any of these operations: each ad-hoc command is a unique shape that matches no permission allow-rule, producing denial-and-retry thrash in real sessions. The script is a single stable command path — the first call may prompt once, and the user can allowlist it permanently. Run it from the project root.

## 1. Ensure the manifest exists

If `.doc-this/context/file-manifest.json` is missing, run **only Scout's manifest command** (Scout SKILL.md step 7) from the project root — no full re-scout. Confirm `counts` looks sane against the repo (spot-check one extension with `find`).

## 2. Compute the unread set

```bash
"$SCRIPT" unread --counts   # scope summary (total + per-subclass)
"$SCRIPT" unread            # the path list itself, when needed
```

The script computes manifest source ∖ ledger `files_analyzed` (`comm -23` on sorted jq slices). A missing ledger means nothing is recorded as read — for a legacy run that is the honest starting point even if some files were actually read before: the ledger is the record, and re-reading is cheaper than trusting recall (recall is the failure mode that created the debt).

Seed `state.json.coverage` (`files_total_source`, `files_analyzed` from the ledger count, `files_pending`, `ledger_path`) per `state-schema.md`. Report the size to the user and — when the harness exposes an Agent tool with a `model` parameter — fold in the fan-out offer (this is where the explicit consent for parallel execution required by the orchestrator SKILL.md is collected):

> "Backfill scope: N unread source files (~M markup, K sql, J code). I can dispatch up to 3 Sonnet reader subagents in parallel (cheaper and faster; everything they produce is verified before it counts) — confirm, or say INLINE for the classic single-session path. Either way I checkpoint after every module slice."

## 3. Re-enter analysis for the unread set only

Two paths. Fan-out (3a) is the default when the Agent tool with a `model` parameter is available and the user consented in step 2; inline (3b) otherwise.

### 3a. Fan-out — Sonnet reader subagents

Follow the shared fan-out reading protocol in `references/sonnet-reader-fanout.md` — it covers why a cheaper
model is safe here, the consent precondition, `chunk`, the reader prompt template, and the verify-before-merge
discipline (the orchestrator stays the single writer of the ledger and the artifacts). Backfill specifics for
the protocol's bracketed parts:

- `<staging-dir>` = `.doc-this-sdd/.backfill-staging/`; `<files-json-dir>` = `.doc-this/context/backfill/`.
- The reader is a *coverage-backfill* reader for project [name]; its merge updates are **incremental** against
  the existing artifacts (this run repairs gaps, it does not build fresh).
- Track progress in `state.json.coverage.backfill` (`{"mode": "fanout", "dispatched": [...], "merged": [...]}`);
  during fan-out `cursor` may be `null` with `backfill` present (see `state-schema.md`).

Once every chunk has merged and the unread set is empty, proceed to step 4 (downstream incremental re-run)
and step 5 (gap reconciliation) — the point of the backfill.

### 3b. Inline (fallback, or user said INLINE)

Dispatch the Code Analyst with the unread list (grouped by module path prefix, processed module-by-module with the normal per-module checkpoints and preventive pauses). Each file is routed by subclass exactly as in the Code Analyst's routing table — markup/SQL/other are full reads; `code` uses LSP when available. Every read appends to the ledger; the cursor is saved at every pause.

Update `code-analysis.md`, each touched module's `data-dictionary/[module].md` (refresh the `data-dictionary.md` roll-up index), and `modules.json` **incrementally** (update sections, never wipe — same merge discipline as `--incremental`). Ensure each touched module gains a complete `all_files` array.

## 4. Re-run downstream agents incrementally

Reuse the `--incremental` machinery (step-05) with the newly-read files as the changed set:

- **Detective**: re-extract rules from the newly-read files (validators and inline logic in markup are prime rule sources).
- **Architect**: re-emit `external-surface.json` UI entries **one per page** from the manifest markup slice (replacing any grouped "pages by module" entries); refresh the spec-impact matrix rows the new reads affect.
- **Writer**: regenerate affected unit specs; generate or regenerate `traceability/code-spec-matrix.md` from the manifest source slice (one row per file).

## 5. Gap reconciliation (the point of the exercise)

For every existing 🔴 in the global and per-unit `questions.md`:

1. Does the answer now exist in a freshly-read file? → convert 🔴→🟢 with the `file:line`, update the owning spec, and remove the question. **Every conversion must include a short verbatim fragment from the cited line**, and the fragment must verify mechanically — a conversion that fails the check stays 🔴 (a false 🟢 is worse than an honest gap):

   ```bash
   "$SCRIPT" check-frag <file> <line> "<verbatim fragment>"   # exit 0 = found within ±2 lines
   ```

2. Delete every sampling-phrase disclosure — any statement meaning the sources were read by sampling, by outline, or not in full, in whatever language the file was written. After the backfill they are false, and Rule 7 of the describe-only gate blocks rewriting them anyway.
3. Gaps that remain genuinely unanswerable from the repo stay 🔴 — that is their job.

Track the reconciliation tally (gaps converted / gaps remaining) for the final report.

## 6. Review

Run the Reviewer. Its Total Source Coverage section (ledger ⊇ manifest, per-page UI, no sampling phrases, gap spot-check) is the completion criterion — the backfill is done when the Reviewer finalizes with **zero self-inflicted gaps in the spot-check sample**. Weight the spot-check sample toward gaps that were converted or touched during this backfill — they are where a cheap-reader error would hide.

Report to the user: files read, gaps converted 🔴→🟢, gaps remaining (genuinely external), UI entries re-emitted per-page, matrix coverage.

## Model & cost guidance

The backfill's cost is dominated by step 3's reading volume; its quality is protected by gates that do not care which model did the reading. Assign models accordingly:

| Step | Work | Model |
|---|---|---|
| 1–2 | Manifest + set math | none (bash/jq) |
| 3 | Read the unread set | **Sonnet** (reader subagents, 3a) — transcription with citations; structural failures are gate-caught |
| 4 | Detective/Architect/Writer incremental | session model — runs inline via the Skill tool on the (smaller) delta |
| 5 | Gap reconciliation | session model (strong) — "does this file answer Q-X?" is semantic judgment; a wrong 🔴→🟢 manufactures a false citation |
| 6 | Reviewer | session model (strong) — it IS the quality gate; running it cheap defeats the design |

The one failure mode no gate catches mechanically is a 🟢 citation pointing at the wrong `file:line`. Mitigate at merge time with `"$SCRIPT" check-cites` (`sonnet-reader-fanout.md` §3, the verify-before-merge step) and at conversion time with `"$SCRIPT" check-frag` (step 5). The residual risk — a real line that does not support the claim — is the same residual the pipeline carries on the strong model, and the Reviewer's citation-quality section covers it.

**No Agent-tool `model` parameter in this harness?** Fall back to session-model switching: run step-3 reading sessions on a cheaper session model (the multi-session design already supports this), and switch back to the strong model **before step 5** — reconciliation and review must not run on the cheap tier.
