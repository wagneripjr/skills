# Rubric design — `wagneripjr/wagner-skills-reviewer`

A fork of `tessl/default-skill-review`, changed in three places and nowhere else. Every anchor
below is grounded in evidence from this repository, cited so a future maintainer can re-check it
rather than take it on faith.

Run it with:

```bash
tessl review run quality ./skills/<name> -w wagneripjr --review-plugin ./review-plugin --force --json
```

## Evidence streams actually available

`derive-review-rubrics` expects two streams. What this repository has:

| Stream | Status |
|---|---|
| A — PR review feedback via `find-optimizations` | **Structurally absent.** `git log --merges` returns 0. CLAUDE.md mandates trunk-based development: commits land on `master`, PRs are opened only on explicit request in client repos. There will never be skill-PR review threads here to mine. |
| B — agent logs | **Present.** `tessl agent-logs view --json --since 2026-06-01` returns 86 `claude-code` sessions for this project. |
| C — the repository's own written record | **The strongest stream, and the one used.** CLAUDE.md's *Known structural tradeoffs* section and `.tessl/memory/skill-estate-review.md` record the same thing PR threads would — where an agent was corrected — except already adjudicated, with the incident named and the reverted change described. |

No anchor below invents a failed-activation transcript. Where an anchor cites an incident, the
incident is written down in a tracked file and named here.

## Change 1 — `description.trigger_term_quality` → Activation Path Clarity

**Kept**: id `trigger_term_quality` and weight `0.3`, so scores stay comparable with the 22-skill
baseline of 2026-09-04. Renamed, re-questioned, re-anchored.

**The defect in the default.** Its question is *"Does it include natural keywords users would
actually say?"* For an orchestrator-dispatched worker the honest answer is that nobody says
anything — it is invoked by exact name via the Skill tool by its parent. The dimension measures a
property the skill is designed not to have, so the only way to raise the score is to make the skill
wrong.

**Evidence.** CLAUDE.md, *Description classes*: the six Discovery workers carry a dispatch-contract
sentence and no user-intent keywords, because *"a worker auto-triggered outside its pipeline runs
unanchored (no manifest, no ledger, the ordering gates no-op without state) and reproduces the
BUG-003 failure mode."* The named incident is the **2026-06-10 architect episode** — keywords were
added to chase this exact judge and *"had to be reverted."* Frontmatter cannot express the contract
(`disable-model-invocation` blocks the orchestrator's own dispatch;`user-invocable: false` does not
stop description matching), which is why `doc-this/hooks/doc-this-dispatch-gate.mjs` enforces it
mechanically instead.

**The fix.** Score the *class* first, then the fit. A description declaring a dispatch contract is a
worker and is scored on the completeness of that contract — orchestrator named, predecessor named,
the direct-invocation path reserved for resume/debug, NOT-for disambiguation. Absence of user-intent
keywords in a worker is stated as correct, not as a gap. Everything else is user-triggered and is
scored on natural-keyword coverage exactly as the default does. Score 1 is reserved for the actual
hazard: a dispatched worker wearing user phrasing.

Two guidelines are appended, the second of which forbids the recommendation that caused the
2026-06-10 revert.

## Change 2 — `content.conciseness`

**Kept**: id and the 1–5 anchor ladder's shape. Weight moved `0.30 → 0.28` only to make room for
Change 3.

**The defect in the default.** Its rationale — *"skills should add only what Claude doesn't already
know"* — is right, and its anchors then measure length rather than what the length buys. Nothing in
the ladder separates *explaining what a PDF is* from *recording why this repo rejected the obvious
alternative*.

**Evidence.** CLAUDE.md's report-only rule for `tessl review fix` exists because *"a single pass on
okf-maintain proposed trimming exactly the rationale paragraphs that carry the why."* The estate
review scored `okf-maintain` **2** on conciseness. CLAUDE.md separately records `conciseness` as a
known tradeoff that *"may stay 2 (or 1 for doc-this-code-analyst) where inline commands and restated
discipline rules are load-bearing for actionability=3"*, and warns that *"judge line-count
assertions have been wrong."*

**The fix.** The rationale now states the direction of the cut: general knowledge is waste, recorded
reasons are the most expensive content in the file to regenerate. Score 5 explicitly permits stating
a rejected alternative, naming the incident a rule came from, and restating a discipline a real run
violated. A guideline adds the operational test — *if cutting the passage would let a competent
reader silently reintroduce the problem it describes, it earns its tokens* — and a second requires
the judge to count before asserting a file is long. `scoring_notes.load_bearing_rationale` carries
the same rule where the schema puts per-skill-shape guidance.

## Change 3 — new dimension `content.quoted_output_fidelity` (weight 0.08)

**Evidence.** Two validation findings in the 2026-09-04 estate review, both false positives of one
shape:

- `skills/okf-maintain` — `relative_links: 1 missing`. `SKILL.md:202` and
  `references/adoption.md:211` both contain `[index.md](index.md)` inside a fenced block quoting
  `okf.mjs`'s `ENTRY_BLOCK`. `okf.mjs:77` emits that line byte-for-byte and
  `tests/test-okf-maintain.mjs` AC-17 pins the quote identical to what the script writes. The link
  is relative to the **target** repo and can never resolve from the skill directory. Editing it
  breaks AC-17 and makes the doc lie about what `wire` emits.
- `doc-this/skills/doc-this-viewer` — `referenced_paths_exist: 1 missing`. Every non-existent path
  in that bundle is a target-project runtime path: `.doc-this/state.json`,
  `.doc-this-sdd/external-surface.json`, `docs/TRACEABILITY.md`.

**The fix, and its honest limit.** `config.schema.json` exposes exactly one validation lever,
`validation_weight`; the deterministic checks themselves are not plugin-configurable. **A reviewer
plugin therefore cannot suppress these two warnings** — they will keep appearing. What it can do is
stop the pattern being purely a penalty: the new dimension credits quoting emitted output verbatim,
identifying it as emitted, and pinning it with a test — which is precisely what okf-maintain does,
and what AC-17 is. `validation_weight` is deliberately left at the default `0.2` so scores stay
comparable with the 2026-09-04 baseline; lowering it is the available lever if the two warnings ever
need to stop moving the number.

## Weights

```
config:  validation 0.2 + description 0.4 + content 0.4            = 1.0
description: specificity 0.20 + trigger_term_quality 0.30
           + completeness 0.35 + distinctiveness_conflict_risk 0.15 = 1.0
content: conciseness 0.28 + actionability 0.28 + workflow_clarity 0.24
       + progressive_disclosure 0.12 + quoted_output_fidelity 0.08  = 1.0
```

Judge weights are unchanged from the default on purpose. The three corrections are about *what good
means*, not about re-ranking the components — changing both at once would make any score movement
uninterpretable.

## Deliberately not changed

- **`progressive_disclosure`.** Its low scores on `agent-cli`, `human-cli` and `airflow-dags` were a
  real defect, not a rubric flaw: those three used `reference/` singular, which the packer does not
  read. Fixed at the source by the rename. A score on those three from before it is not comparable
  to one after.
- **The reviewer `SKILL.md`.** Copied from the fetched default verbatim. Its `config.json` /
  `rubrics/` reading steps and `results.json` write are load-bearing for scoring.
- **The schema files.** Copied verbatim, as `create-review-plugin` requires.
