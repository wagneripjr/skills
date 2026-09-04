---
name: derive-review-rubrics
description: Derive custom review-plugin judges, rubrics, and scoring criteria from evidence — existing skills, PR review feedback, and accumulated agent logs — by finding where agents needed correction or skills failed to activate, then translating those patterns into scoring dimensions and anchors. Hands the rubric design to create-review-plugin for scaffolding. Use when the user wants a custom skill reviewer or scoring rubric grounded in how their agents actually behave — to grade skills consistently, or build review criteria from past PR feedback and agent logs.
---

This skill grounds a custom reviewer plugin in real evidence. It gathers two evidence streams, translates recurring patterns into rubric dimensions with anchors drawn from the evidence itself, then hands the design to `create-review-plugin` for scaffolding and validation. It does not scaffold, copy schemas, or run `tessl review run` — that is `create-review-plugin`'s job.

## Input

The user provides the scope to ground the rubric in:

- The skills to review (a directory of SKILL.md files, or "the installed skills"). These are the artefacts the produced plugin will score.
- A PR window for review feedback (a PR number or a time period like "the last 2 weeks").
- Optionally a log window and provider filter.

## Step 1 — Gather evidence

### Stream A — skills and PR feedback

1. Read each target SKILL.md for its intended behaviour (the `description` trigger and the workflow body). This is the baseline the rubric scores against.
2. Invoke `/find-optimizations` over the PR window, scoped to skill / SKILL.md PRs. Consume its findings — each has a **Type**, **Summary**, and **Evidence** (PR numbers and the specific review comments). The types come from find-optimizations' configurable list in `.tessl/memory/improvement-types.md` (default: `skill`, `rule`, `hook`, `test`, `refactor`, `verifier`); read it for the names in effect. Recurring `skill`-type feedback is the strongest rubric signal.

### Stream B — agent logs (optional)

Run `tessl agent-logs view --json --since <ISO timestamp>` (add `--provider <name>` to narrow; it covers `claude-code`, `cursor-ide`, `cursor-agent`, `tessl-agent`). It reads local session history only. Empty `entries` means no sessions were found — no local history, as in a cloud sandbox or when collection was never enabled. Then this stream has no evidence: say so, proceed on Stream A alone, and skip the two signals below. Without logs you can't ground a trigger-clarity dimension in a real failed-to-fire transcript — but recurring PR feedback that a description is too vague to tell when the skill fires still grounds that dimension from Stream A. What you must not do is invent a log-based activation example you don't have. Entries present but with empty `content` is different — it only means nothing happened after `<ISO timestamp>`; widen the window rather than treating it as no history.

When entries are present, the output is `{ entries, failures }`; each entry has `provider`, `sessionId`, and a `content` transcript. For `claude-code`, `content` is the session's raw JSONL event lines. A skill activation shows up in one of two forms: an assistant `tool_use` block named `Skill` (the skill is in `input.skill`), or a user-message slash command — text that starts with `/<skill>` (sometimes wrapped in `<command-name>` tags), because Claude Code expands skill slash commands inline rather than as a tool call. Count both as activations. Other providers render the transcript as text; look for the equivalent invocation.

Scan each transcript for two signals:

- **Skill didn't activate** — a task that matched a skill's purpose where neither activation form for it appears. Count this only when the skill genuinely should have fired; a task its own DO-NOT-TRIGGER guidance excludes is a correct non-activation, not evidence.
- **Needed correction** — repeated tool errors and retries, or the user redirecting the agent after it acted on a skill.

## Step 2 — Map evidence to rubric content

Cluster and dedupe themes across both streams. For each theme, follow [references/evidence-to-rubric.md](references/evidence-to-rubric.md):

- Classify it: a judgmental quality attribute becomes a `dimensions[]` entry; a binary pass/fail invariant routes out of the rubric — to a verifier (an LLM-judge rule) when no deterministic lint or test can express it, otherwise to a lint/test.
- Group dimensions into judges by what each evaluates. `description` and `content` are the built-in `evaluation_target`s; an evidence-derived domain rubric may define its own (any string). A judge whose `evaluation_target` is `content` also requires a `scope` and `scoring_notes` — see [references/evidence-to-rubric.md](references/evidence-to-rubric.md).
- Set dimension weights (sum to 1.0 per rubric) and the judge + `validation_weight` split (sum to 1.0) by how often and how severely the pattern recurred.
- Populate each `scores[].example` with the **actual evidence** — the description that failed to fire, the flagged review comment, the corrected diff. Grounded anchors are what this skill adds over the generic template.

## Step 3 — Hand off to create-review-plugin

Write the assembled design (judges, their `evaluation_target`, dimensions with grounded anchors, the `scope` and `scoring_notes` of any `content` judge, and the weight split) to a workspace file, then invoke `/create-review-plugin` and point it at that file. `create-review-plugin` scaffolds the directory, copies the schemas, writes the rubric and config files, and validates with `tessl review run`.

Do not make any changes to the codebase in this skill beyond the design file. Gather, map, and hand off.
