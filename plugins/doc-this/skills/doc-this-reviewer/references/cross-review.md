# Cross-review prompt — independent second-opinion review of doc-this specs

This file is fed **verbatim** to the cross-reviewer (`agy` / Antigravity) as the prompt.
`scripts/cross-review.mjs` reads it and passes it as `agy -p` — the agent never assembles the
command. The staged specs are mounted into the cross-reviewer's workspace via
`--add-dir <output_folder>` — it reads them itself; the corpus is never pasted into the prompt.

---

You are an **independent reviewer**. A first AI agent reverse-engineered a legacy codebase
into descriptive specifications staged in the directory added to your workspace
(`<output_folder>`, default `.doc-this-sdd/`). Your job is to find what that first agent
**missed or got wrong** — you are the second pair of eyes, deliberately a different model.

## What these specs are

doc-this produces **strictly descriptive** documentation: it records what the legacy
system does, with binary confidence — 🟢 CONFIRMED (carries a `file:line` citation) or
🔴 GAP (recorded in `questions.md`). It must **never** propose improvements, judge code,
label bugs, invent non-functional requirements, or write technical-debt registers. Specs
are folder-per-unit; each unit has `requirements.md`, `design.md`, `tasks.md`.
Cross-cutting files: `domain.md`, `architecture.md`, `external-surface.json`,
`traceability/code-spec-matrix.md`, `confidence-report.md`, `questions.md`.

## Read first

- Each unit folder's `requirements.md`, `design.md`, `tasks.md`
- `domain.md`, `architecture.md` (if present)
- `external-surface.json` — the catalog of HTTP/gRPC/CLI/message/UI/database surfaces
- `confidence-report.md` and `questions.md` (if present)

## Scrutinize for these (report concrete instances with file + line/section)

1. **Describe-only pact violations left in the specs** — any sentence whose meaning is
   *propose / recommend / "should" / judge / "this is a bug" / invent an NFR from a config
   value, middleware, retry, or rate-limiter / "technical debt"*. These are the
   highest-value finds. Watch English and pt-BR phrasing equally.
2. **Unsupported confidence** — a 🟢 whose cited `file:line` does not actually support the
   claim, or a factual claim with no citation that needs one.
3. **Cross-unit contradictions** — two units describing the same behavior, entity, or
   contract inconsistently.
4. **Missed behaviors** — externally observable behavior present in the surface catalog or
   domain that no unit documents.
5. **ATDD coverage gaps** — public surfaces in `external-surface.json` with no scenario;
   scenario steps that leak internal names (component/class/method/table/proc) instead of
   externally observable language.
6. **Self-inflicted gaps** — a 🔴 in `questions.md` that the mounted source can in fact
   answer; cite the file that answers it.

## Output format (so findings can be triaged mechanically)

Return a Markdown list, one finding per item:

```
- [SEVERITY: critical|moderate|cosmetic] [CATEGORY: pact|confidence|contradiction|missed-behavior|coverage|answerable-gap] <unit/file> — <what is wrong> — <correction stated descriptively>
```

Do **not** rewrite the specs and do **not** suggest code changes to the legacy system —
report review findings only. If a category has no findings, say so explicitly.

---

## How the doc-this Reviewer incorporates this output

*(Reference for the doc-this Reviewer — not a task for the cross-reviewer above.)*

After `agy` writes `cross-review-result.md`, triage **every** finding:

- **Accept** → apply the correction in-place: reclassify 🟢/🔴, remove a pact violation,
  add the missing scenario or citation. Count it accepted.
- **Reject** → wrong or out of scope; log a one-line reason. If `agy` itself proposes a
  legacy-code improvement, that proposal is **rejected** — doc-this is describe-only and
  the cross-review never overrides the pact.
- **Pending** → genuine but only the user can resolve; add a 🔴 entry to `questions.md`.

Record accepted / rejected / pending **counts** plus engine (`agy`) and model in the
`confidence-report.md` cross-review section (§8). A self-inflicted gap surfaced here
triggers the same escalation as the §3a spot-check: re-read the source the gap names
before finalizing.
