# Full postmortem template (material incidents — severity `medium`+)

Copy everything below the cutline to `docs/postmortems/YYYY-MM-DD-<slug>.md` — the date is the
**incident** date. This is the long form: sections 4.3, 5, 7.3, 8 and 11 are the ones the
quick template drops. Delete any section that genuinely does not apply — do not leave
placeholder headers.

---

```markdown
---
id: INC-NNN
type: Postmortem
status: Resolved
title: <component> — <short incident summary>
description: One sentence summarizing the incident, for a table of contents or index.
severity: high
---
<!--
  Keep two surfaces stable: (1) the `severity:` above (critical | high | medium | low —
  critical|high marks the incident material) and (2) the H1 title below. H1 + the filename
  date together form the finding-id, so renaming either after the commit breaks any reference
  to it. The whole body is free narrative.
-->
# <Component> — <short incident summary>

| Field           | Value                                                          |
|-----------------|----------------------------------------------------------------|
| Date            | YYYY-MM-DD                                                     |
| Window          | HH:MM – HH:MM (<timezone, e.g. America/Sao_Paulo>)             |
| Duration        | <e.g. 80 min>                                                  |
| Severity        | High (SEV-2)                                                   |
| Environment     | production                                                     |
| Component       | <affected service/resource>                                    |
| Status          | Resolved · or: Resolved (mitigated — root cause not fixed)     |
| Author          | <who investigated and wrote this>                              |
| Analysis source | <telemetry used — e.g. CloudWatch + APM + logs>                |

> All times in this document are in <timezone>. <If the raw source is UTC: "the raw data is
> UTC; the conversion is already applied.">

## 1. Executive summary

Two to four sentences for someone who wasn't on call: what happened, who was affected and how
it was mitigated — impact on the principal before any technical detail. If the mitigation was
a palliative, close with the recurrence condition: "this is a palliative; the incident will
recur under <condition> unless <root action> is applied".

## 2. Impact (blast radius)

- **Affected principal**: <end-user | buyer | operator | security | finance | maintainer>
- **Reach**: <customers/requests/data affected, with numbers and window>
- **Observable symptom**: <what the principal saw — error, slowness, wrong data>

| Service | Evidence (metric, per window) | Impact |
|---|---|---|
| <service A> | <e.g. 5XX NN → NNN over 5 min; p99 pinned at the timeout> | <unavailable ~NN min> |
| <service B> | <e.g. function errors up to NN at peak> | <feature X failing> |
| <service C (unaffected)> | <e.g. 5XX = 0 — own database> | **Unaffected** — blast-radius boundary |

Include what was **not** affected and why: the boundary of the blast radius is evidence about
the mechanism (a healthy service with its own dependency proves where the coupling point was).

## 3. Timeline

Times transcribed from telemetry, not from memory. Gaps are acceptable; invented precision is not.

| Time    | Event                                            |
|---------|--------------------------------------------------|
| HH:MM   | <trigger / first signal in telemetry>            |
| HH:MM   | <detection — alarm, customer, on-call>           |
| HH:MM   | <diagnosis / primary hypothesis formed>          |
| HH:MM   | <mitigation applied>                             |
| HH:MM   | <recovery confirmed in telemetry>                |

## 4. Root cause

### 4.1 Mechanism

What actually caused the incident — the mechanism, not the symptom. Chain the 5 whys when the
mechanism has depth: trigger → amplifier → missing limit → why the limit was missing. If
production contradicted an assumption a requirement was built on, name that requirement here —
it is the hook anyone tracing the incident back to a decision will follow.

### 4.2 Contributing factors

<Conditions that did not cause it but amplified or accelerated it — e.g. an instance with no
headroom, no connection limit, a shared single point.>

### 4.3 Discarded hypotheses

| Hypothesis | Evidence that discards it |
|---|---|
| <e.g. a back-office job as the trigger> | <e.g. crons ran normally and use another database> |
| <e.g. a recent deploy> | <e.g. no deploy correlated to the window> |

## 5. Empirical proof

The specific metrics/queries that support the causal claim, each with its source (monitoring
account, dashboard, query window). A causal claim without a cited measurement is a hypothesis
— label it as one.

## 6. Detection and response

How the incident was detected (alarm, customer, on-call), what worked, and what delayed
detection or response.

## 7. Remediation

### 7.1 Immediate (palliative)

<What restored service — restart, resize, rollback. Never a root fix.>

### 7.2 Root fix

<What removes the mechanism — pending or applied, with evidence if applied.>

### 7.3 Scope decision

<What deliberately will NOT be done, and why.>

## 8. Correlated findings

Real problems found during the investigation that did **not** cause this incident. Recording
them here keeps the root cause clean without losing the findings.

## 9. Action items

| # | Action | Type | Owner | Due |
|---|--------|------|-------|-----|
| 1 | <pending immediate fix> | corrective | <who> | YYYY-MM-DD |
| 2 | <recurrence prevention> | preventive | <who> | YYYY-MM-DD |

## 10. Lessons learned

What this incident proved about the system, the monitoring or the process.

## 11. Appendices — evidence and commands (read-only)

The actual commands run during the investigation (read-only ones only) and the relevant
output, so the next similar investigation starts from a working query set.

<command + output block>
```
