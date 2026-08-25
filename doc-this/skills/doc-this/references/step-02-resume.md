# Step 2 — Resume Session

## 1. Read state

Read `.doc-this/state.json` and `.doc-this/plan.md`.

## 1a. Plugin-version skew check (advisory)

Read the installed plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (`.version` field). Compare with `state.json.plugin_version`:

- If equal, or if `state.json.plugin_version` is null (legacy state file): proceed silently.
- If different: print one line — `"⚠️  Doc-This: state was created on plugin v<old>, currently running v<new>. Resume continues; rerun a phase with --regenerate=<phase> if you want it re-done under the new version."` — then proceed. Do NOT block.

After the check, write the current plugin version into `state.json.plugin_version` so subsequent resumes compare against the up-to-date stamp.

## 1b. Structural extraction re-check

If `state.json.structural_extraction` exists:

- **LSP**: Re-run `ToolSearch("select:LSP")` to ensure the deferred tool is loaded in this session. Run a quick `documentSymbol` on a known file to verify LSP is still responsive. Update `lsp_available` if it changed.
- **UA staleness**: If `ua_detected` is true, compare `ua_commit_hash` with current `git rev-parse HEAD`. Update `ua_staleness` flag. If UA was stale before and now matches HEAD (user re-ran `/understand`), clear the staleness flag.

If `structural_extraction` does not exist (legacy state from before this feature), run the full check from `step-01-first-run.md` step 4a.

## 2. Greeting

Say: "[Name], welcome back to Doc-This."

## 3. Progress summary

Show:
- ✅ Completed phases (`completed` field)
- 🔄 Current phase (`phase` field) with the last checkpoint recorded
- ⏳ Pending phases (`pending` field)

Example:
> "Progress so far:
> ✅ Reconnaissance done
> 🔄 Analysis in progress — modules `billing` and `invoicing` analyzed; `payments` and `reports` pending. Coverage: 1720/2000 source files; 280 pending, resuming at `src/payments/refund_form.aspx`
> ⏳ Interpretation, Synthesis, Generation, Review"

## 3a. Coverage cursor

If `state.json.coverage` exists and `files_pending > 0`: resume the Code Analyst from `coverage.cursor` (`module` + `next_file`) — the ledger (`.doc-this/context/coverage-ledger.json`) is append-only, so the unread set is always `manifest source ∖ ledger`. Include the coverage line in the progress summary (above).

If `coverage` is absent and the run is past reconnaissance, this is a legacy (pre-coverage) run — mention once: "This run predates Total Source Coverage; `/doc-this --backfill-coverage` brings it into compliance."

## 3b. Legacy runnability check

If `legacy_runnable` is absent or `null` (legacy state from before this field), ask the
step-01 §2a question once and persist the answer. Never re-ask when set.

## 4. Database context check

If `database_ownership` is `null` and Scout has completed (Scout is always before step-04), prompt to run step-04 before continuing. Otherwise carry on.

## 5. Gap-answer mode

If `answer_mode = "file"`:
> "Reminder: your answers to the gap questions go in `.doc-this-sdd/questions.md`. Let me know when you're done."

If `answer_mode = "chat"` (default), no extra prompt.

## 6. Confirmation

Ask only: "Continue from where we left off? (CONTINUE to proceed)"

After confirmation, resume the next pending task in `.doc-this/plan.md`.

**🚫 Do NOT offer `/clear` + `/doc-this` here.** The user just resumed a fresh session; suggesting they clear and reopen is redundant. The preventive-pause prompt (described in `SKILL.md` under "Preventive pause between heavy steps") only fires **after** an agent completes work in this session — never on the resume greeting itself.

See `references/checkpoint-guide.md` for state.json write rules.
