# Step 1 — First Run

This runbook executes when `state.json` does not exist or `phase` is `null`.

## 1. Initial state

If `.doc-this/state.json` does not exist, create it with the bootstrap defaults:

```json
{
  "version": "1.0.0",
  "plugin_version": "<read from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json .version, fallback null>",
  "project": null,
  "user_name": null,
  "chat_language": "en-us",
  "doc_language": "English",
  "answer_mode": "chat",
  "doc_level": null,
  "output_folder": ".doc-this-sdd",
  "phase": null,
  "completed": [],
  "pending": ["reconnaissance", "analysis", "interpretation", "synthesis", "generation", "review"],
  "database_ownership": null,
  "schema_versioning": null,
  "legacy_runnable": null,
  "tracer_declined": null,
  "engines": [],
  "agents": [],
  "checkpoints": {},
  "created_files": [".doc-this/state.json"]
}
```

`version` is the **state schema** version. `plugin_version` is the **doc-this plugin** version that initialized this state — used by `/doc-this --resume` to warn (not block) on plugin upgrades between sessions, so the user can decide whether to rerun a phase under the new version.

If the file exists but `phase` is `null`, read it and continue with the existing values.

## 2. Collect missing info (only if blank)

If `user_name` is blank, ask one at a time:
- "What's your name?"
- "Project name?"

If `chat_language` is something other than `en-us` and the user wants different — ask:
- "What language should I use for our chat? (default: en-us)"
- "What language should generated specs use? (default: English)"

Save each answer to `.doc-this/state.json` immediately.

## 2a. Legacy runnability

If `legacy_runnable` is `null`, ask (translate to `chat_language`):

> "Can this legacy system be run for testing?
>
> 1. **yes** — a test instance can be stood up (locally, container, staging)
> 2. **prod-only** — it runs in production, but no test instance is possible (traffic capture and telemetry may exist)
> 3. **no** — dead or frozen; only fossil evidence exists (logs, traces, HAR captures, error exports, data snapshots)"

Save the answer to `state.json.legacy_runnable`. When it is `prod-only` or `no`, tell the
user the **Tracer becomes hard-advisory** at the end of the run (see SKILL.md → "Runnability
and the Tracer") and that gathering telemetry early — log files, trace exports, HAR
captures, error-tracker exports, anonymized DB snapshots — pays off at the corroboration
sweep, where 🟢 scenarios get their `Evidence:` provenance stamped.

## 3. Personalized greeting

With `user_name` and `project`, say (translate to `chat_language` if not `en-us`, preserving the meaning):

> "Hi [Name]! I'm Doc-This. I'll coordinate a full reverse-engineering analysis of **[project]** and produce ATDD-ready specifications a coding agent can use to evolve or reimplement the system.
>
> **What I will do:** document what exists in the code with file:line citations, reading **every source file** — markup, SQL, and scripts included. On a large legacy system this spans several sessions: I checkpoint and you resume with `/doc-this`. That is the design — I never sample to save tokens; a 🔴 GAP is reserved for what the repository genuinely cannot answer.
> **What I will NOT do:** propose improvements, identify technical debt, generate bug reports, or invent requirements that aren't grounded in the source. If a behavior looks wrong, I record it as observed; whether it's a bug is your call.
>
> I work in stages, saving progress after each phase. If the session is interrupted, just type `/doc-this` to pick up where we left off."

## 4. Exploration plan

Check whether `.doc-this/plan.md` already exists.

**If the file exists** (created by an installer or a prior run):
- Read it
- Present a summary
- Ask: "Plan looks good or want to adjust before we start?"

**If the file does NOT exist** (manual install or fresh repo):
1. Quickly survey the project root, excluding: `node_modules`, `.git`, `.doc-this`, `.doc-this-sdd`, `dist`, `build`, `coverage`, `__pycache__`, `target`, `bin`, `obj`
2. Identify top-level modules and components
3. Create `.doc-this/plan.md` with phase-structured tasks (use the standard plan template; expand Phase 2 with one task per identified module)
4. Present the plan and ask: "Plan looks good or want to adjust?"

### Plan template

```markdown
# Doc-This Plan — [project]

## Phase 1 — Reconnaissance
- [ ] **Scout** — map structure, languages, frameworks, entry points

## Phase 2 — Analysis
- [ ] **Code Analyst** — deep analysis (one task per module after Scout)

## Phase 3 — Interpretation
- [ ] **Detective** — extract business rules with citations, record decision traces from explicit sources (commits/comments/in-repo docs), classify APIs as public/private, cross-reference DB-resident logic

## Phase 4 — Synthesis
- [ ] **Architect** — C4 diagrams, ERD, integration map, external-surface.json

## Phase 5 — Generation
- [ ] **Writer** — folder-per-unit specs (requirements.md / design.md / tasks.md) with ATDD-shaped scenarios

## Phase 6 — Review
- [ ] **Reviewer** — validate confidence markings, public/private discipline, cross-layer coverage, DB coverage

## Optional — Independent agents
- [ ] **Tracer** — dynamic analysis from logs/traces (resolves 🔴 gaps + corroborates 🟢 scenarios; hard-advisory when `legacy_runnable` ≠ `yes`)
- [ ] **Visor** — UI extraction from screenshots (run when system has a UI)
- [ ] **Data Master** — database analysis (always runs unless `database_ownership = none`)
- [ ] **Design System** — design tokens (run when frontend has a design system)
```

## 4a. Structural extraction check (LSP + UA)

Detect available structural extraction sources so downstream agents can use deterministic analysis instead of pure LLM code reading. See `references/lsp-structural-extraction.md` and `references/ua-integration-guide.md` for full details.

**LSP check** (primary):
1. Run `ToolSearch("select:LSP")` to load the deferred LSP schema
2. Pick a known source file from the project root (any `.cs`, `.ts`, `.py`, `.go`, `.rs` file)
3. Run `documentSymbol` on that file
4. If it returns symbols: LSP is available. Record the language. Try other primary languages if the project is multi-language.
5. If it errors or returns nothing: LSP unavailable for that language

**UA check** (fallback):
1. Check if `.understand-anything/knowledge-graph.json` exists at the project root
2. If found: read `project.analyzedAt` and `project.gitCommitHash`. Compare hash with `git rev-parse HEAD`. Set staleness flag if different.
3. If not found: `ua_detected: false`

**Save to `state.json`**:

```json
{
  "structural_extraction": {
    "lsp_available": true,
    "lsp_languages": ["csharp", "typescript"],
    "ua_detected": true,
    "ua_graph_path": ".understand-anything/knowledge-graph.json",
    "ua_commit_hash": "abc1234",
    "ua_staleness": false,
    "preferred_source": "lsp"
  }
}
```

Set `preferred_source` to `"lsp"` if LSP works for the primary language, `"ua"` if only UA is available, `"llm"` if neither.

**Inform the user** (one line per available source):

- LSP: "[Name], LSP is active for [languages]. I'll use compiler-quality analysis for function inventory, call graphs, and dependency mapping."
- UA: "I found an Understand-Anything knowledge graph (analyzed [date]). I'll use it as supplementary structural data." Add "(stale — built on commit [X], HEAD is [Y])" if staleness detected.
- Neither: "No LSP or UA available — I'll analyze the code directly. This works fine, just uses more context."

## 5. Update state

After plan approval, update `.doc-this/state.json`:
- `phase`: `"reconnaissance"`
- Persist any info collected in this step that isn't yet saved

See `references/checkpoint-guide.md` for write rules.

## 5b. Hide the working tree from accidental reads (first run only)

The staging tree (`output_folder`, default `.doc-this-sdd/`) and the state dir
(`.doc-this/`) hold unpromoted, in-progress specs. They are dot-prefixed (skipped by
default ripgrep/Glob) and should also be git-ignored so a normal coding session never
mistakes them for the project's real documentation — only the promoted `docs/` tree is
tracked.

On **first run only** (you just created `state.json` in step 1), append both folders to
the project's `.gitignore`, idempotently, creating the file if absent. This is a plain
file write (never a `git` command), so it is safe in customer workspaces. Read the actual
`output_folder` from `state.json` in case it was customized. Skip this on resume —
`references/step-02-resume.md` never re-touches `.gitignore`.

```bash
# Run from the project root.
gi=".gitignore"
out_folder=$(jq -r '.output_folder // ".doc-this-sdd"' .doc-this/state.json 2>/dev/null || printf '.doc-this-sdd')
touch "$gi"
add_ignore() { grep -qxF "$1" "$gi" || printf '%s\n' "$1" >> "$gi"; }
grep -qF 'doc-this Discovery artifacts' "$gi" || printf '\n# doc-this Discovery artifacts (regenerate with /doc-this)\n' >> "$gi"
add_ignore ".doc-this/"
add_ignore "${out_folder%/}/"
```

## 6. Start

Ask: "[Name], shall we start with **Scout** — mapping the project surface?"

After confirmation, activate the `doc-this-scout` skill.
