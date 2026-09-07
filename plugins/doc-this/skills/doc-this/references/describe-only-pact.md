# Describe-Only Pact

Mandatory reading for every doc-this sub-agent. Apply by **meaning**, not by literal English. The user's project may write outputs in any language (commonly **en** or **pt-BR**); the rule is the same regardless of output language.

## Core principle

`/doc-this` reverse-engineers a system. It documents **what exists**, never **what should be**.

The agent is a mirror, not a consultant. If a behavior looks wrong, suboptimal, slow, duplicated, or risky — record it as observed, with citations. Whether it is a bug, a smell, or a problem is a judgment that belongs to the human reading the documentation, not to the agent producing it.

## What counts as evidence

Every claim in any output file must be backed by at least one of:

1. **Source code citation** — `path/to/file.ext:LINE` (preferred — exact line where the behavior is defined or observed).
2. **Commit citation** — `commit ABC1234:line` (when the relevant context lives in commit history rather than current code; e.g., a deletion or revert).
3. **Comment / doc citation in source** — a comment block, README section, design-doc file inside the repo, with file path and line range.
4. **Runtime artifact** — a captured log line, OpenTelemetry span ID, recorded API response, error-tracking export, **only when** the user has produced or pointed to that artifact (Tracer's domain).
5. **Written non-functional contract** — an SLO doc in the repo, an OpenAPI `x-rate-limit`, a configuration schema with a documented threshold, a README performance commitment. NFRs require this kind of cite — pattern-matching code (e.g., "this code calls a rate limiter") is **not** evidence of an NFR.

If none of these is available, the claim is a **🔴 GAP** and goes to `questions.md`. It does **not** appear as a 🟢 claim or as a 🟡 claim in any spec file.

## Confidence scale (binary)

- 🟢 **CONFIRMED** — backed by an evidence citation per the list above.
- 🔴 **GAP** — not determinable from current evidence; recorded in `questions.md` for human resolution.

🟡 **INFERRED is retired**. Inference from weak signals (a middleware call, a timeout config, an enum name, a stylistic pattern) does not create a fact. Either the agent finds direct evidence and writes 🟢, or it records a 🔴 and asks the human.

## Total Source Coverage (a gap must be earned by reading)

A 🔴 GAP records what the **repository cannot answer** — runtime-only behavior, external systems the repo does not contain, intent that no source states. **A 🔴 GAP may never record the contents of a first-party source file that exists in the repository and was not analyzed.** If the answer is inside a readable file in scope, analyzing that file is mandatory before any confidence marker is assigned. Not reading it is a pact violation, not an honest disclosure.

**Markup is source.** `.aspx`, `.ascx`, `.master`, `.ashx`, `.cshtml`, `.razor`, `.jsp`, `.vue`, `.svelte`, `.blade.php`, `.erb` and equivalents carry control trees, validators, data-binding expressions, inline server code, and the definition of the UI surface itself. **SQL files are source. Repo-authored JS/CSS is source.** A language server not supporting a file type makes Read the tool of record for that type — it never makes the file optional.

**"Analyzed" means:**
- code file with working LSP → the full `documentSymbol` skeleton PLUS the business-logic sections read;
- markup, SQL, `other` subclasses, and any file where LSP is unavailable or degraded → the file **read in full**.

Nothing else counts. Outlines, greps, and partial passes are progress markers, not coverage.

**Sampling is not coverage.** Any statement meaning "not read in full", "read by sampling / outline / grep", "skimmed", or "representative example" — in whatever language the output is written — describes a coverage failure, never an acceptable state. They must not appear in any output file. The fix is reading the file, not softening the wording.

**Token pressure is handled by checkpoint-and-resume, never by skipping.** When context runs low, save the file-level cursor (`coverage.cursor` + the coverage ledger), pause, and resume in a fresh session. `doc_level` controls **output verbosity** (how much is written), never **input coverage** (how much is read) — a `minimal` run still analyzes every file. A large legacy system spanning several sessions is the design, not a failure.

**The only legitimate skips** — each still inventoried and classified in `file-manifest.json` with a reason, never silently omitted:

- **vendored / third-party**: `node_modules/`, `packages/`, `vendor/`, `bower_components/`, `*.min.js`, `*.min.css`, bundled libraries.
- **build outputs**: `bin/`, `obj/`, `dist/`, `build/`, `out/`, `target/`, coverage reports.
- **binary assets**: images, fonts, archives, compiled artifacts.
- **machine-generated files whose generator input is read instead**: a WebForms `*.designer.cs` is skim-confirmed as designer wiring **only because** its source-of-truth `.aspx`/`.ascx` is read in full; a generated stub qualifies when its `.proto`/`.xsd` is read. "Generated" is a classification, never an excuse for omission — a misclassified hand-written file must be reclassified `source` and read.

Every file in scope ends in exactly one state: **analyzed** (🟢-eligible) or **classified-skip**. There is no third "counted but unread" state — that state is the failure mode this rule eliminates.

## Forbidden output (apply by meaning across languages)

These belong in a separate consulting skill, **not** in `/doc-this`:

| Forbidden meaning | Illustrative examples |
|---|---|
| Proposals / suggestions | "should be refactored", "we recommend extracting X" |
| Recommendations | "recommend X", "we suggest Y" |
| Improvement framing | "this could be improved", "a better approach is" |
| Refactor invitations | "consider refactoring", "consider splitting" |
| Technical-debt categorization | a section titled "Technical debt" |
| Fabricated ADR sections | `Alternatives considered` listing options that aren't quoted from source; `Consequences` describing effects not stated in source |
| Inferred NFR justifications | "Performance NFR inferred from timeout", "Security NFR inferred from auth middleware" |
| Bug labelling | "X is a bug", "X is wrong" |

The examples are illustrative, **not exhaustive**, and they are written in English only because this document is. **Match on meaning, never on wording**: output is produced in whatever `doc_language` the run selected, so read the line, understand what it asserts, and forbid it if it means "this is what should be done" or "this is what is wrong" — in any language. A word-list is a tripwire, not the rule.

## Bugs are not generated by /doc-this

Observed behavior is recorded as observed. If the behavior is surprising, edge-case-y, or contradicts the system's stated purpose, the agent records the observation factually with citations. The human reading the documentation decides whether to file a bug. `/doc-this` never writes to `docs/bugs/` or generates `BUG-NNN` files.

## Decision traces vs. retroactive ADRs

`/doc-this` records **decision traces**, not retroactive ADRs.

A decision trace documents a decision **explicitly visible** in the repo:
- A commit message that announces the decision (`feat: switch to JWT auth — see commit a3f1b2c`)
- A code comment that explains a decision (`// using RS256 for JWT, see ADR draft in /docs`)
- A pre-existing ADR file in the repo
- A README section that documents the decision

A decision trace contains:
- **Status**: `Recorded in commit ABC1234` or `Recorded in code comment at file.ext:LINE` or `Recorded in <file>` — never `Accepted (retroactively)`.
- **Context**: only quotes / paraphrases from cited source.
- **Decision**: only what the cited source actually says.

A decision trace does **not** contain:
- `Alternatives considered` — unless every alternative is quoted from source with citation.
- `Consequences` — unless the consequences are stated in source with citation.

If neither alternatives nor consequences appear in the source, those sections are omitted entirely. The agent does not invent them to fill the template.

## NFRs require written contracts

Functional requirements come from observed behavior with citations.

Non-functional requirements come **only** from a written non-functional contract: an SLO document, an OpenAPI extension (`x-rate-limit`, `x-timeout`), a configuration schema with a documented threshold, a README performance commitment, a contract test asserting a quantitative bound.

Pattern-matching code (a timeout value in config, the existence of a retry policy, an auth middleware) is **not** an NFR. Those facts belong in `design.md` as observed behavior, not in `requirements.md` as NFRs.

If a system has no written non-functional contract, `requirements.md` has no NFR section. The agent does not invent one.

## How sub-agents apply the pact

- **Scout**: surface mapping is descriptive by nature — apply the pact when characterizing modules ("appears to handle X" is fine if cited; "could be improved" is forbidden). Emits the complete deterministic file manifest (`.doc-this/context/file-manifest.json`) — every first-party file classified `source|vendored|generated|binary`, markup counted as source.
- **Code Analyst**: every claim in `code-analysis.md` either has a 🟢 file:line citation or is moved to `questions.md` as 🔴. Every `source` file in every assigned module is analyzed (per the Total Source Coverage definition) before the module checkpoint — a module with pending files is not complete.
- **Detective**: domain rules are extracted **with citations**. Decision traces replace retroactive ADRs. No fabricated alternatives or consequences. Permissions and state machines must list values that exist in code; gaps go to `questions.md`.
- **Architect**: produces architectural views, ERD, and the unified `external-surface.json`. Does **not** produce a technical-debt register. The spec-impact matrix is a factual transitive-dependency map only. UI entries are **one per page** (every markup page in the manifest), never "pages grouped by module".
- **Writer**: NFRs only from written contracts. Confidence on every claim is 🟢 or 🔴. No 🟡. Scenarios cite source behavior. Refuses to emit a unit spec whose UI surfaces lack read markup evidence — returns to the analysis phase instead of writing a self-inflicted 🔴.
- **Reviewer**: rejects (does not downgrade) any output containing 🟡, judgment phrases by meaning in any language, fabricated ADR sections, technical-debt sections, or bug labelling. Hard-REJECTs coverage failures: ledger ⊉ manifest, sampling phrases, grouped UI entries, or any spot-checked 🔴 answerable from an existing readable file.
- **Promote**: pre-stage gate runs grep checks (multilingual best-effort) for forbidden patterns. When grep is clean, the agent re-reads the pact and rejects by meaning if any judgment leaked through in a language not covered by the regex. Never stages to `docs/bugs/`.
- **Tracer / Visor / Data-Master / Design-System / Help**: optional agents follow the same pact. Runtime artifacts (logs, traces) are 🟢 evidence when cited (line / span / sample); inferences from artifacts are still 🔴.

## Escape valves (use sparingly, log every use)

Per-artifact escape (single legitimate edge case):

```
<!-- DOC-THIS-EXEMPT : reason="exact rationale, e.g. quoting a third-party doc that uses 'should'" -->
```

The reason string is logged.

Per-session escape (emergency override):

```
touch /tmp/.claude-doc-this-bypass-${CLAUDE_SESSION_ID}
```

Logged. Use only when investigating a hook bug, not as a routine bypass.

## Why this pact exists

A `/doc-this` session generated bugs and requirements that did not exist in the analyzed system. Investigation found that the pipeline (a) allowed inference from weak signals as legitimate output, (b) provided ADR templates that fabricated alternatives and consequences, (c) included a "Technical debt" register inviting prescriptive judgment, and (d) lacked a global describe-only rule.

A later session on a large .NET WebForms codebase (LSP unavailable) inventoried its `.aspx`, `.ascx`, and code-behind files but read almost none of them — recording their contents as 🔴 gaps marked "not read in full" and "read by sampling". The gaps were honest but **self-inflicted**: the answers were in unread, readable files. Total Source Coverage closes that loophole — gaps are for what the repository cannot answer, not for what the agent did not read.

Reverse engineering must mirror the system. Proposals, judgments, recommendations, bug-labels, and self-inflicted gaps belong outside this workflow.
