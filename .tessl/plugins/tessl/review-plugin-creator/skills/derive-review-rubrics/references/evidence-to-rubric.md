# Evidence to rubric

How to turn a recurring evidence pattern into rubric content. A rubric judge has an `evaluation_target` (`description` and `content` are the built-ins; a domain-specific rubric may define its own, any string), one or more `dimensions`, and per-dimension `scores` with an `anchor` and an `example` at each level. See `create-review-plugin` for the full schema and weight invariant.

## Mapping table

| Evidence pattern (source) | Rubric translation |
|---|---|
| Skill didn't activate when it should have (logs) | A trigger-clarity dimension on `description`. Score-1 example = the actual description that failed to fire; score-3 example = a description that names the situation it triggers on. The failed-to-fire example needs logs — with no log evidence (e.g. a cloud sandbox), don't fabricate one; ground the same dimension in PR feedback instead (next row). |
| Reviewers kept flagging that a `description` is too vague to tell when the skill fires (PRs) | The same trigger-clarity dimension on `description`, grounded in Stream A. Valid with no logs: anchor the low score in the actual vague descriptions reviewers flagged and the high score in one that names its trigger. Recurring, high-severity discoverability feedback is strong signal — don't drop the dimension just because logs are absent. |
| Skill activated but its instructions were ignored and the user corrected the agent (logs / PRs) | An enforceability dimension on `content` — are the steps imperative, ordered, and checkable. Bad example = the vague step the agent skipped; good example = the same step made concrete. |
| Reviewers kept flagging the same point on skill PRs (find-optimizations) | A "Does the skill avoid X?" dimension. Bad example = the flagged code or text; good example = the fix that resolved the review thread. |
| find-optimizations proposes a `verifier` (a binary, observable invariant) | Keep it as a verifier (a pass/fail LLM-judge check on committed files), out of the rubric. A verifier scores pass/fail; a rubric dimension scores degrees of quality. |

## Content judges need extra fields

A judge with `evaluation_target: "content"` must also carry a `scope` (a one-line description of what it evaluates) and `scoring_notes` (with `simple_skills`, `code_vs_instruction_skills`, and `feedback_loops` guidance). The schema rejects a `content` rubric without them. A `description` judge does not need either. Include them in the design you hand to `create-review-plugin`.

## Choosing dimension vs verifier

A rubric dimension measures **degrees** of a judgmental quality ("how clear is the trigger"). A **binary** pass/fail invariant about a committed file ("does every route return via the typed helper") belongs outside the rubric: as a verifier — an LLM-judge rule — when no deterministic lint or test can express it, or as a lint/test when one can. If it does not admit a middle grade, it is not a rubric dimension.

## Weights

Frequency and severity of a pattern drive its weight. A pattern that recurred across many PRs or logs, or that caused a wrong outcome rather than a stylistic nit, carries more weight. Dimension weights within one rubric sum to 1.0. The plugin-level split — `validation_weight` plus each judge's weight — also sums to 1.0.

## Anchors

Each score level needs an `anchor` (what that grade means) and an `example` (a concrete instance). Draw examples from the gathered evidence rather than inventing them: the description that failed to activate, the review comment that recurred, the diff that resolved it. Evidence-grounded anchors are the reason to derive a rubric from evidence rather than author one from scratch.
