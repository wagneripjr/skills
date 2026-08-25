# Quick templates — minor incidents and non-incidents

Two variants. Both keep the full machine contract (frontmatter + stable H1 + filename date)
— brevity lives in the body, never in the machine surfaces.

## Variant A — quick postmortem (severity `low` | short `medium`)

For incidents resolved in minutes with a clear mechanism and limited blast radius.

```markdown
---
id: INC-NNN
type: Postmortem
status: Resolved
title: <component> — <short summary>
description: One sentence summarizing the incident, for a table of contents or index.
severity: low
---
# <Component> — <short summary>

**Date**: YYYY-MM-DD · **Window**: HH:MM–HH:MM (<timezone>) · **Duration**: <NN min> ·
**Severity**: Low · **Author**: <who>

## What happened

<2–3 sentences: observable symptom, who was affected, how it was mitigated.>

## Timeline

- HH:MM — <trigger / first signal>
- HH:MM — <detection>
- HH:MM — <mitigation>
- HH:MM — <recovery confirmed>

## Root cause

<Mechanism, not symptom — 2–4 sentences. If palliative, state the recurrence condition.>

## Remediation

- **Immediate**: <what restored service>
- **Root**: <what removes the mechanism — pending or applied; link BUG-NNN/issue if any>

## Lessons

<1–2 lines.>

## Evidence

<Metric/query with cited source + the read-only commands used.>
```

## Variant B — Investigation (concluded NOT an incident)

For an alarm or suspicious behavior investigated to a benign conclusion. Recording it stops
the same signal from triggering the same investigation twice. Severity is `low` (never
material); status stays `Resolved`.

```markdown
---
id: INC-NNN
type: Postmortem
status: Resolved
title: <component> — investigation: <observed signal>
description: Investigation of <signal> concluded as expected/benign behavior.
severity: low
---
# <Component> — investigation: <observed signal>

**Date**: YYYY-MM-DD · **Author**: <who> · **Conclusion**: not an incident

## 1. What was observed

<The signal that prompted the investigation — alarm, metric, behavior — with source and window.>

## 2. Confirmed cause

<Why the behavior is expected/benign, with the specific evidence that confirms it. Subdivide
(2.1, 2.2…) if the confirmation has more than one pillar.>

## 3. Remediation applied and next steps

<Alarm/threshold adjustment, documentation, or "no action needed" with justification.>

## 4. Raw evidence (commands used)

<Read-only commands + outputs that support the conclusion.>
```
