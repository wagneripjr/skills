# doc-this judgment-leak empirical run — FINDINGS

**Date:** 2026-05-31
**Fixture:** `/tmp/doc-this-judgment-fixture` — a 5-file TypeScript todo service, deliberately
seeded with 8 business rules and one pattern per judgment-bait class (duplicated validation,
long nested conditional, magic numbers, timeout+retry config, auth middleware, FIXME comment,
naming inconsistency `dueDate`/`due_date`, git `revert:`+`fix:` commits).
**Pipeline version under test:** the working tree at the time of the run. The describe-only pact,
the describe-only gate hook, and the Writer/Reviewer SKILL.md were **committed and clean** (the
pact landed three weeks after the initial pipeline). The only working-tree modifications were the
in-flight LSP work on Code Analyst/Architect/Detective.
**Extraction mode:** `preferred_source=llm` (direct code reading; no LSP/UA).

## Method

Ran the full pipeline stage-by-stage as subagents that loaded the **working-tree** SKILL.md +
pact and wrote to the fixture's `.doc-this-sdd/`. The two highest-risk stages (Architect,
Writer) were run with **neutral** prompts (no mention of judgment/forbidden words) to avoid
priming. A separate **cold auditor** then read every generated file against the describe-only
standard, instructed to be skeptical and assume violations exist.

## Result: the leak did NOT reproduce

**Cold audit verdict: 0 confirmed violations, 4 borderline.** Every high-risk element was handled
with explicit describe-only discipline:

- The `// FIXME` comment — quoted verbatim with `src/domain/todo.ts:75` attribution + "its content
  is not interpreted here." Not adopted as the doc's opinion.
- The NFR-bait constants (`REQUEST_TIMEOUT_MS`, `MAX_RETRIES`, `MAX_ACTIVE_TODOS`, `RETENTION_DAYS`,
  `ESCALATION_WINDOW_MS`) — all recorded in `design.md` as observed values, explicitly demoted from
  NFRs ("not a documented non-functional commitment"). **No NFR sections emitted anywhere.**
- The `revert:` and `fix:` commits — recorded factually under "Git-history observations (factual,
  not bug reports)." Neither labelled a bug or a mistake.
- The decision trace — refused to fabricate Alternatives/Consequences; quoted commit `44f3d0b` only.
- MoSCoW labels — grounded in observed call-frequency/reachability, not advice.
- Binary confidence throughout; zero 🟡 markers.

The Architect stage even **self-caught and rephrased** one near-leak ("not a deployment
recommendation") because its own SKILL.md mandates a pact self-scan before returning.

## The 4 borderline cases (where residual risk actually lives)

1. `api/contracts.md` — "the handler maps **every** thrown error to 403, including not-found" —
   closest to flagging an oddity; stays descriptive via an explicit "recorded as observed; not
   labelled" note.
2. `repository/requirements.md` — quotes the source's "hence the snake_case row fields" (causal
   framing, but attributed to source).
3. `state-machines.md` — "escalation mutates Priority **but** does not assign back to
   `Todo.priority`" — contrastive framing that draws attention to a disconnect; tipped to a 🔴 gap
   rather than a judgment.
4. MoSCoW `Could` labels for uncalled functions — priority-as-fact vs priority-as-advice.

All four cluster around **(a) surprising/inconsistent behavior** (the 403 mapping, the discarded
escalation result) and **(b) prioritization** — exactly the synthesis/evaluation surfaces the
structural analysis flagged. They were held in check by *explicit self-notes* ("recorded as
observed, not labelled") — a discipline that is **fragile under scale/pressure**: drop the
self-note and the borderline tips into a violation.

## Interpretation

On a small fixture, run faithfully, the **current pact-equipped pipeline does not leak.** This
strongly implies the leaks historically observed were either (a) pre-pact (before 2026-05-08) and
already largely remediated, or (b) conditional on **scale** — a large real codebase dilutes the
top-of-file pact reminder across dozens of files and amplifies the synthesis-task pull toward
ranking/inference, which a 5-file fixture cannot reproduce.

## Secondary finding — VERIFIED: not a subagent-bypass bug, it's cwd-anchoring

The subagents reported the `doc-this-describe-only-gate` hook "did not fire" (no log entries).
Investigation of the hook + shared lib resolves this conclusively:

- The gate is **cwd-anchored**. `dt_state_path` (lib `doc-this-checks`) checks only
  `${DT_CWD}/.doc-this/state.json`, where `DT_CWD` is the **session cwd** from the hook payload's
  `.cwd` field (`dt_parse_input`, lib:43) — NOT derived from the target file's path. The gate also
  strips paths by cwd (`gate:65` `RELATIVE="${FILE_PATH#$DT_CWD/}"`).
- This harness ran with session cwd = the skills repo while the fixture lived at `/tmp/...`. The
  skills repo has no `.doc-this/state.json`, so the gate hit its no-state branch (`gate:54-57`) and
  exited **silently** — that branch has no `dt_log` call. Hence "no log entry."
- This is **independent of whether PreToolUse hooks fire on subagent tool calls** — even if they
  fire, the cwd mismatch makes the gate no-op. So the "subagents bypass hooks" inference is unproven
  and, here, immaterial.

**The gate works in the normal flow.** In the normal flow the user runs `/doc-this` at the project
root, so cwd = the analyzed root, the state file resolves, and the gate logs deny/allow decisions as
designed. To confirm this on your own machine, check that the gate log records decisions for the
analyzed project — this fixture, run from a different cwd, appears in it zero times.

**Latent robustness gap (low priority, not the normal flow):** if `/doc-this` is ever run with
cwd ≠ analyzed-project-root (a monorepo package, an analyzed subdirectory, or tooling that sets a
different cwd), the gate silently no-ops — and the no-state branch (`gate:54-57`) does not even log
a `skip`, which is why this investigation needed code reading rather than a log glance. A 1-line
`dt_log "skip" ... "no doc-this project at cwd"` there would make it observable; resolving the
project by walking up from the target file path (the usual way tooling finds a repo root) would make
the gate cwd-independent. Neither is required for the normal flow.
