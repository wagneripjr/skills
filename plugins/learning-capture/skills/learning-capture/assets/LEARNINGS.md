# Learnings

Corrections, insights, and knowledge gaps captured during development. Append each entry below
the final rule of this preamble; an entry starts at its `## [LRN-YYYYMMDD-XXX] category` header
and runs to the next one.

**Categories**: correction | insight | knowledge_gap | best_practice | review_finding
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed or knowledge integrated |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, auto memory, or a skill (target in `**Promoted**`) |
| `promoted_to_skill` | Extracted as a reusable skill (path in `**Skill-Path**`) |

## Attribution Fields

Every entry may name the skill a finding is against. An entry without `**Skill**` reads as `none`:

```text
**Skill**: <plugin>:<name> | none
**Fix-type**: rule | skill | verifier | refactor
**Review**: <review job id> (category review_finding only)
```

`verifier` means an own-code hook or check.

## Optional Evidence Fields

Add these under an entry's `### Metadata` to record how proven it is. They are optional, and a
consumer of this corpus may score them; this skill computes nothing from them, so keep them as
observed facts rather than derived numbers:

```text
- Applications: N (times observed or applied; increment instead of logging a duplicate)
- Confirmations: N (observations that confirmed the learning)
- Contradictions: N (observations that contradicted it)
- Confidence: 0.0–1.0 (your judgement of how validated the learning is)
- Last-Observed: ISO-8601 timestamp (bump on each recurrence)
```

## Reserved Fields

`**Scenario**`, `**Verdict**` and `**Activation**` are reserved for a consumer that reconciles an
entry into a skill. Capture never writes them; leave them to that consumer.

## Skill Extraction Fields

When a learning is extracted as a skill, set:

```text
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

---
