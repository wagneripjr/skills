# Review Checklist

The Reviewer runs through this checklist before finalizing the confidence report. Every check is applied **by meaning** across whatever language `doc_language` selected — the rules are the same in en, pt-BR, or any other language. The mechanical hooks (`doc-this-describe-only-gate.mjs`, promote gate) cover en + pt-BR with regex; this checklist is the semantic safety net for everything regex misses.

## A0. Describe-only pact compliance (BLOCKING — reject, do not just demote)

These are the rules from `${CLAUDE_PLUGIN_ROOT}/skills/doc-this/references/describe-only-pact.md`. Any failure REJECTS the offending content (removes it; the underlying gap, if any, becomes a 🔴 in `questions.md`). Log every rejection in `confidence-report.md` under "Pact violations rejected".

- [ ] No 🟡 markers anywhere in any spec file
- [ ] No content whose meaning is "should be / recommend / propose / consider / better approach", judged by meaning in whatever language the file was produced in
- [ ] No section meaning `Alternatives considered` unless every entry is a quoted citation from a cited source
- [ ] No section meaning `Consequences` unless every entry is a quoted citation from a cited source
- [ ] No section whose meaning is "Technical debt" anywhere
- [ ] No bug labelling: no assertion whose meaning is "X is a bug / X is wrong"
- [ ] No NFR whose only citation is config-value, middleware, retry/circuit-breaker, rate-limiter, or other observed-behavior signal — NFRs require a written non-functional contract per the pact

## A1. Total Source Coverage (BLOCKING — REJECT)

Skip only when `file-manifest.json` does not exist (legacy run → recommend `/doc-this --backfill-coverage`).

- [ ] Every manifest `class: source` path appears in `coverage-ledger.json` `files_analyzed` (sorted-list `comm -23` difference is empty); mismatch ⇒ REJECT naming the unread files
- [ ] No sampling phrase anywhere in `.doc-this-sdd/**`, judged by meaning in whatever language the file was produced in — any admission that sources were read by sampling, by outline, as N examples, or skimmed ⇒ REJECT + force re-read
- [ ] Every manifest `markup` path has its own `kind: "ui"` entry in `external-surface.json` (controls: `subkind: "control"` + `mounted_in`); grouped "pages by module" entries ⇒ REJECT
- [ ] Gap spot-check executed: N = min(10, ⌈10% of 🔴 total⌉), weighted toward gaps naming files/pages/controls; every sampled gap verified by reading the named file(s); self-inflicted gaps converted 🔴→🟢 AND escalation triggered (code-analyst re-run over all files referenced by remaining 🔴s)
- [ ] Spot-check sample, method, and verdicts recorded in `confidence-report.md` under "Total Source Coverage spot-check"

## A2. Per-module artifact completeness (BLOCKING — REJECT)

Skip when `doc_level = minimal` (artifacts are embedded in `code-analysis.md`) or `.doc-this/context/modules.json` does not exist (legacy run). Otherwise, for each module in `modules.json.modules[]` — deterministic, keyed on COUNTS, never on prose:

- [ ] If the module's `entities[]` is non-empty → `<output_folder>/data-dictionary/[module].md` exists and is non-empty. Missing ⇒ REJECT: name the module(s); the Code Analyst recorded entities only in `modules.json` and skipped the human-readable dictionary. Return for a Code-Analyst artifact pass (NOT a full re-read — see `/doc-this --backfill-artifacts`).
- [ ] If the module's `functions[]` **or** `algorithms[]` is non-empty → `<output_folder>/flowcharts/[module].md` exists and is non-empty. Missing ⇒ REJECT naming the module(s). (Keying on `functions OR algorithms`, never `algorithms` alone — `algorithms[]` is populated inconsistently; a module with real functions but empty `algorithms[]` still needs its flowchart.)
- [ ] (detailed only) Every non-trivial function has its `flowcharts/[module]-[function].md`. Missing ⇒ flag as **moderate**, not a hard REJECT (function-name slugging is not mechanically deterministic).
- [ ] Entity-less modules have NO `data-dictionary/[module].md`; function-less AND algorithm-less modules have NO `flowcharts/[module].md` (an empty stub is noise — flag spurious empties as **cosmetic**).

`doc-this-artifact-completeness-gate.mjs` enforces this at the detective transition; re-verify here because `--regenerate`, backfills, and partial resumes can disturb artifact state after that gate passed (same reason A1 re-verifies coverage). Record the per-module artifact tally in `confidence-report.md`.

## A. Per-unit consistency

- [ ] All 3 canonical files present (`requirements.md`, `design.md`, `tasks.md`)
- [ ] No internal contradiction between rules in the same unit
- [ ] Every claim has a confidence marker (🟢 / 🔴 — **no 🟡**)
- [ ] Every 🟢 claim has a `path:line` citation; spot-check 5 random ones — verify they exist
- [ ] Every NFR has a citation to a written non-functional contract; if not, REMOVE the NFR (do not demote)
- [ ] Every Gherkin scenario has a confidence marker BELOW its block (🟢 with citation, or 🔴 referenced in questions.md)
- [ ] Every scenario has an `Evidence:` line under its Confidence marker; missing ⇒ add `Evidence: static` (specs generated before the field existed)
- [ ] Every `Evidence: static + runtime` cites a specific runtime artifact (log line with timestamp, span ID, HAR entry, event ID); aggregate or absence-based claims ⇒ rewrite to `Evidence: static` and log in `confidence-report.md`
- [ ] No `Evidence:` line appears under anything but a 🟢 marker

## B. Cross-unit consistency

- [ ] No contradictions between units (e.g., one unit says order limit is 10, another says 20)
- [ ] Declared dependencies match real code dependencies (compare `design.md` "Dependencies" section with import graphs)
- [ ] Every module in `surface.json.modules` has at least one corresponding unit (or explicit reason for omission)
- [ ] Every feature in `organization_suggestion.features` has a corresponding unit (when `granularity = feature`)

## C. ATDD discipline

### C.1 Public/private API discipline

- [ ] Every entry in `external-surface.json` with `visibility: public` AND `kind ∈ {http, grpc, websocket}` has ≥ 1 `@api` scenario in some unit
- [ ] No entry with `visibility: private` has an `@api` scenario (private = covered transitively)
- [ ] Every `visibility: private` entry is reachable from at least one `@browser` or `@cli` scenario's call graph; if no consumer found anywhere, flag as dead-code candidate

### C.2 UI coverage

- [ ] Every `external-surface.json` entry with `kind: ui` has ≥ 1 `@browser` scenario
- [ ] Every `@browser` scenario references the route it exercises in its Given clause

### C.3 Cross-layer pairing

- [ ] In UI-bearing projects: every `@api` scenario has a paired `@browser` scenario in the same unit, OR carries an explicit `@browser-exempt` reason (e.g., "headless service consumed by partners only")
- [ ] When dual-tagged `@api @browser`, both interfaces share the same Given/When/Then text — if they diverge, split into two scenarios

### C.4 CLI / Message coverage

- [ ] Every entry with `kind: cli` AND `visibility: public` has ≥ 1 `@cli` scenario
- [ ] Every entry with `kind: message` AND `visibility: public` (publisher) has ≥ 1 `@message` scenario asserting topic + payload shape

### C.5 Database scenarios (when `database_ownership ∈ {external, mixed}`)

- [ ] Every entry with `kind: "database"` AND `visibility: external_dependency` is referenced in ≥ 1 `@database`, `@browser`, or `@cli` scenario's call graph
- [ ] `@database` scenarios assert observable contract behavior (parameter shape, return, side effect on rows the app reads next), NOT internal procedure logic
- [ ] Every `@database` scenario cites the call site in `consumed_by`

### C.6 Database scenarios (when `database_ownership = owned`)

- [ ] No `@database` scenarios exist (DB is implementation detail; owned DBs are covered by `@api`/`@browser`/`@cli` scenarios end-to-end)
- [ ] If a `@database` scenario exists, flag as suspect and demote to 🔴 with reviewer note (record the underlying gap in `questions.md`)

### C.7 Externally observable language

Applies to **scenario step text only** (`Given/When/Then/And/But`, pt-BR `Dado/Quando/Então/E/Mas`). The Realization map, `design.md`, and external/mixed `@database` scenarios are **exempt** — naming internals there is correct (the map and design.md document the *how*; an external `@database` proc is the contract the new system must keep honoring).

Flag a step that leaks any of these implementation classes — reframe to observable language per `scenario-extraction-guide.md`, and confirm the detail moved to the unit's Realization map (relocated, not deleted):

- [ ] Internal component name — a CamelCase identifier ending in `Service`, `Controller`, `Repository`, `Manager`, `Handler`, `Helper`, `Scheduler`, `Job`, `Worker`, `Consumer`, `Listener`, `Producer`, `Dispatcher`, `Factory`, `Provider`
- [ ] Internal method call — `PascalCase.PascalCase(...)` invocation syntax (e.g. `AutoDispatch.SaveDispatch`)
- [ ] Owned-DB table/column name in a non-`@database` step (project prefixes like `TB_`, `VW_`, plus bare `UPPER_SNAKE` columns asserted as the observable)
- [ ] DB-resident procedure name in a step (`P_*`, `DML_*`, `usp_*`) when the DB is owned
- [ ] Session/dictionary internal keys (e.g. `UserId`/`PersonId` in Session) or internal enum/model names (e.g. `ECrateGrade.Premium`, `GrowerBatchModel`)

Grep starter (run, then interpret — config keys like `Integration.X` and external webhook payload fields like `Document.Key` are externally observable and stay; discard hits inside `@database` scenarios):

```bash
# Stage 1 isolates Gherkin step lines; stage 2 finds implementation tokens in them.
# Two greps, not one regex: a `.*` spanning a 1-char anchor (`E `) and the large
# alternation backtracks unreliably across grep flavors (verified failing on ugrep) —
# splitting is portable, and stage 1 also drops the Realization-map table rows (they
# never start with a step keyword, so the map is exempt mechanically, not by trust).
grep -rnE '^[[:space:]]*(Given|When|Then|And|But|Dado|Dada|Quando|Ent[ãa]o|E|Mas)\b' <output_folder>/*/requirements.md \
  | grep -E '[A-Z][A-Za-z]+(Service|Controller|Repository|Manager|Handler|Helper|Scheduler|Job|Worker|Consumer|Listener|Producer|Dispatcher|Factory|Provider)\b|[A-Z][A-Za-z]+\.[A-Z][A-Za-z]+|\b(TB|VW|TBL)_[A-Z]|\bP_[A-Z]{3,}|\bDML_|\busp_'
```

- [ ] Realization-map coverage: every scenario reframed from internal machinery (owned-DB state, async scheduling, internal orchestration) has a row in its unit's `## Realization map`, so the relocated detail is preserved with its citation
- [ ] No scenario asserts internal database table contents in a non-`@database` step (when DB is owned)
- [ ] No scenario asserts log messages unless those logs cross an external observability boundary

## D. Schema-version gate

- [ ] When `schema_versioning = unversioned` AND no baseline DDL exists in `.doc-this-sdd/database/schema.md` or equivalent: refuse coverage completion. Add 🔴 GAP: "Capture baseline DDL before reimplementation can proceed; recommend snapshot via `pg_dump --schema-only` / `mysqldump --no-data` / SSMS export."

## D2. Structural extraction citation quality

When `state.json.structural_extraction` exists and `preferred_source` is `"lsp"` or `"ua"`:

- [ ] No spec file references `.understand-anything/` paths (UA knowledge graph is an internal tool artifact, not a citation source)
- [ ] No spec file references UA node IDs (e.g., `function:src/auth/login.ts:login`, `file:src/models/User.ts`)
- [ ] No spec file cites an LSP operation as evidence (e.g., "per incomingCalls", "per documentSymbol") — cite the `file:line` the operation pointed to
- [ ] When LSP was available for a language, structural claims (function signatures, dependency chains, call graphs) for files in that language have `file:line` citations, not uncited assertions

Log violations in `confidence-report.md` under "Structural extraction citation issues".

## E. Matrix validation

- [ ] `code-spec-matrix.md` has one row per `class: source` path in `file-manifest.json` — deterministic: compare the sorted manifest source slice against the sorted first-column paths (the coverage gate runs the same check before this phase; re-verify, don't assume)
- [ ] Rows marked `n/a` correspond to `modules.json.exclusions` entries and carry the exclusion reason — any other `n/a` is a coverage hole
- [ ] `spec-impact-matrix.md` reflects real dependencies (cross-check against `design.md` "Dependencies" sections)

## F. Confidence reclassification (binary scale per the pact)

For each 🟢 claim spot-checked:
- If the cited `file:line` supports the claim → leave 🟢
- If the cited `file:line` doesn't support the claim → either find a real citation and re-cite, or **demote to 🔴** with a question in `questions.md`. **Do not demote to 🟡** — 🟡 is retired.

For any 🟡 claim found in any spec (these should not exist — their presence is a pact violation):
- If walking back to code reveals an explicit citation → promote to 🟢 with citation
- If unable to verify with code access → demote to 🔴 with a question in `questions.md`
- Log the original 🟡 occurrence in `confidence-report.md` under "Pact violations rejected"

For each 🔴 claim:
- If user-resolvable, write a question into `questions.md` per the question template
- If determinable from code with more analysis, escalate to a follow-up Code Analyst pass

## G. Final report

- [ ] `confidence-report.md` exists with overall % + per-unit breakdown (🟢 / 🔴 only)
- [ ] Evidence provenance table: per-unit 🟢 total / runtime-corroborated / static-only
- [ ] ATDD coverage section: public-endpoint coverage %, UI route coverage %, external-DB coverage % when applicable
- [ ] **Pact violations rejected** section: lists every removal made under section A0 with file:line and reason
- [ ] Discipline violations flagged separately (e.g., "3 scenarios mention internal class names — reclassified to 🔴 with notes")
- [ ] Cross-review section if `cross-review-result.md` exists
