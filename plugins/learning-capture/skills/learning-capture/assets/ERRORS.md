# Errors

Command failures, exceptions, and unexpected behaviors captured during development. Append each
entry below the final rule of this preamble; an entry starts at its
`## [ERR-YYYYMMDD-XXX] command_name` header and runs to the next one.

**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted

## Priority Guide

| Priority | When to Use |
|----------|-------------|
| `critical` | Blocks core functionality, data loss risk, security issue |
| `high` | Significant impact, affects common workflows, recurring issue |
| `medium` | Moderate impact, workaround exists |
| `low` | Minor inconvenience, edge case |

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being investigated or fixed |
| `resolved` | Error fixed (add Resolution block with commit/PR) |
| `wont_fix` | Won't address (add reason in Resolution notes) |
| `promoted` | Root cause promoted to CLAUDE.md or auto memory |

## Attribution and Evidence

An error may carry the same optional `**Skill**` and `**Fix-type**` lines as a learning, and the
same optional evidence fields under `### Metadata` (`- Applications: N`, `- Confirmations: N`,
`- Contradictions: N`, `- Confidence: 0.0–1.0`, `- Last-Observed: ISO-8601`), which a consumer may
score. `**Scenario**`, `**Verdict**` and `**Activation**` are reserved for a consumer and never
written at capture.

Quote the failing output inside the entry's `### Error` fence. Never put a line shaped like a
field (`**Name**: value` or `- Name: value` at column 0) inside a fence: a reader takes the last
occurrence of a field, fenced or not.

---
