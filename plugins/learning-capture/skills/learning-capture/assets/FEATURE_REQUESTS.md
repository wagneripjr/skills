# Feature Requests

Capabilities requested by the user that don't currently exist. Append each entry below the final
rule of this preamble; an entry starts at its `## [FEAT-YYYYMMDD-XXX] capability_name` header and
runs to the next one.

**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix

## Complexity Scale

| Complexity | Estimate |
|------------|----------|
| `simple` | Can be done in one session, minimal code changes |
| `medium` | Requires planning, touches multiple files |
| `complex` | Needs architecture decisions, multi-session effort |

## Frequency Tracking

Track how often a capability is requested:
- `first_time` — First request for this capability
- `recurring` — Requested multiple times (bump priority)

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet started |
| `in_progress` | Actively being implemented |
| `resolved` | Feature implemented (add Resolution block with commit/PR) |
| `wont_fix` | Won't implement (add reason in Resolution notes) |

## Optional Fields

A request may carry the optional evidence fields under `### Metadata` (`- Applications: N`,
`- Confirmations: N`, `- Contradictions: N`, `- Confidence: 0.0–1.0`, `- Last-Observed: ISO-8601`),
which a consumer may score. `**Scenario**`, `**Verdict**` and `**Activation**` are reserved for a
consumer and never written at capture.

---
