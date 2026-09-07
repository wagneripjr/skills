---
name: postmortem
description: "Write a production-incident postmortem that reads well for humans and stays parseable by tooling. Produces docs/postmortems/YYYY-MM-DD-<slug>.md with machine-read YAML frontmatter (severity critical|high|medium|low), a stable H1 + filename date that together form a finding-id, and a numbered spine — executive summary, impact/blast radius with per-service evidence, timeline, root cause (mechanism + 5 whys + discarded hypotheses), empirical proof, detection, remediation (palliative vs root fix), action items, lessons learned, read-only appendices. Triggers: 'write a postmortem', 'post-incident review', 'incident record', 'document this outage', 'RCA document', or right after resolving/mitigating any production incident. NOT for reconciling a postmortem with the decision it contradicted. NOT for bug reports. NOT for live incident response."
license: MIT
---

# Postmortem

Turn a resolved (or mitigated) production incident into a postmortem that reads well for a
human and stays parseable by tooling: a numbered spine for the narrative, and a small
machine-readable header for anything that scans the file. A postmortem here is a single-author evidence document, not meeting minutes: it is written
by whoever ran the investigation, from real telemetry, immediately after mitigation.

## When to write one

- Any material production incident (user-visible outage or degradation).
- Near-misses and novel failure modes — cheap to write now, expensive to rediscover later.
- Investigations that conclude "not actually an incident" — record the evidence so the same
  alarm doesn't trigger the same investigation twice (use the Investigation variant).

Write **immediately** after mitigation. Telemetry retention windows expire (Performance
Insights, CloudWatch detailed metrics, APM traces), and timeline precision degrades within
days. A postmortem written a week later is reconstructed from memory; one written the same day
is transcribed from dashboards.

## File contract — the surfaces a machine can read

Postmortems are worth more as a corpus than one at a time, so keep a few surfaces stable and
predictable: a severity a reader can filter on and an identity that does not drift. If your
project runs tooling that scans postmortems, it will almost certainly key on exactly these two.
Nothing below requires such tooling — it is just what makes the set queryable later:

1. **Path and name**: `docs/postmortems/YYYY-MM-DD-<slug>.md`. The date is the **incident**
   date, not the writing date — it feeds the finding-id.
2. **YAML frontmatter** (must be the first thing in the file, opening with a `---` fence):

   ```yaml
   ---
   id: INC-NNN
   type: Postmortem
   status: Resolved
   title: <component> — <short incident summary>
   description: One sentence, for a table of contents or a generated index.
   severity: high
   ---
   ```

   `severity` takes the enum `critical | high | medium | low`, and is the one frontmatter key
   worth treating as a contract. `critical|high` marks the incident **material** — the class
   that deserves follow-up beyond the writeup itself (see "After writing").
3. **Stable identity**: the finding-id is derived from the H1 title + the filename date.
   Renaming either after publication silently orphans anything that referenced the incident
   by that id — treat both as frozen once committed.

The body below the frontmatter is free-form narrative; nothing needs to parse it.

### Severity mapping

The body's metadata table keeps the human labels; the frontmatter carries the enum:

| Frontmatter | Body label | Meaning |
|---|---|---|
| `critical` | Critical (SEV-1) | Data loss, security breach, or whole-platform outage |
| `high` | High (SEV-2) | A major service down or degraded with real user impact |
| `medium` | Medium (SEV-3) | Partial degradation, workaround exists, limited principal impact |
| `low` | Low | Near-miss or no principal impact (includes "not an incident" investigations) |

## Language and timezone

- Write the body narrative in whatever language the rest of that repository's docs use, so the
  postmortem reads as part of the docs it lands in. Frontmatter keys and values stay English —
  that is the machine layer, and anything reading it will read it literally.
- Declare **one timezone** at the top and use it for every timestamp. Real telemetry is
  usually UTC while the operators think in local time — convert once, and state that you did:
  *"All times in local time (GMT−03:00); the raw AWS data is UTC and the conversion is already
  applied."* Mixed-timezone timelines are how root-cause windows get misread.

## Structure — the numbered spine

Copy `references/full-template.md` for material incidents (`medium` and up). Use
`references/quick-template.md` for `low`/short `medium` incidents and for the Investigation
variant. Section-by-section discipline the templates assume:

**1. Executive summary.** Two to four sentences for someone who wasn't on call: what happened,
who was affected, how it was mitigated — impact on the principal before any mechanism. End
honestly: if the mitigation is a palliative, say so and state the recurrence condition ("this
is a palliative; the incident will recur at the next peak unless X is done"). A summary that
reads "resolved" when only the symptom was suppressed is the single most damaging lie a
postmortem can tell.

**2. Impact (blast radius).** A per-service evidence table — service, the metric that proves
the impact (with its window), the user-facing effect. Include the services that were **not**
affected and why: the boundary of the blast radius is evidence about the mechanism (a service
on its own database staying healthy proves the shared database was the coupling point).

**3. Timeline.** Trigger/first signal → detection → diagnosis → mitigation → confirmed
recovery. Every timestamp transcribed from telemetry, not recalled. Gaps are fine; invented
precision is not.

**4. Root cause.** Describe the **mechanism, not the symptom** — "connections exhausted" is a
symptom; *why* nothing bounded them is the cause. Chain the 5 whys inside this section when
the mechanism has depth (trigger → amplifier → missing limit → why the limit was missing).
Record **discarded hypotheses** with the evidence that killed each one — discarded hypotheses
are half the investigation's value and stop the next responder from re-walking dead ends.

**5. Empirical proof.** The specific metrics/queries that support the causal claim, each with
its source (monitoring account, dashboard, query window). A causal claim without a cited
measurement is a hypothesis — label it as one.

**6. Detection and response.** How it was detected (alarm, customer report, on-call
observation), what worked, and what delayed detection or response.

**7. Remediation.** Split explicitly: **immediate** (the palliative that restored service),
**root fix** (what actually removes the mechanism), and **scope decision** (what was
deliberately not done and why). A restart/resize is never a root fix — the split keeps that
visible.

**8. Correlated findings.** Real problems found during the investigation that did *not* cause
this incident. Recording them here keeps the root cause clean while not losing the findings.

**9. Action items.** Table with type (corrective/preventive), owner, due date. No orphan
items — an action without an owner is a wish.

**10. Lessons learned.** What this incident proved about the system, monitoring, or process.

**11. Appendices — evidence and commands (read-only).** The actual commands run during the
investigation (read-only ones only) and the relevant output. This turns the postmortem into a
runbook: the next similar incident starts from a working query set instead of from zero.

## Evidence discipline

- Every number in the document comes from telemetry and cites its source. Never invent,
  round-trip from memory, or extrapolate figures — same invariant as "real payloads only".
- Appendices contain read-only commands exclusively. A postmortem must be safe to replay.
- Where telemetry cannot support a claim (missing spans, expired retention), say so
  explicitly and mark the claim a hypothesis rather than silently downgrading rigor.

## Blameless framing

Name conditions, not culprits: "the deploy process allowed X" rather than "so-and-so did X".
This is not politeness — a postmortem that assigns individual blame stops receiving accurate
information the moment it circulates, and its causal chain becomes fiction. The system that
allowed the mistake is the thing you can fix.

## Anti-patterns

- **Symptom as cause** — stopping at "disk full" / "connections exhausted" without the
  mechanism that allowed it.
- **Palliative as resolution** — status "Resolved" after a restart, with no recurrence
  warning. Use "Resolved (mitigated — root cause not fixed)".
- **Unsourced numbers** — figures with no telemetry citation.
- **Identity churn** — editing the H1 or renaming the file after commit (breaks the
  finding-id).
- **Deferred writing** — waiting past the telemetry retention window.

## After writing

- **A material (`critical|high`) incident is not closed by the writeup.** Production has just
  contradicted an assumption someone shipped on. Take the incident back to that decision and
  either revise it or record why it stands — this skill writes the record, it does not close
  the loop. If your project has a process for that, this is the point to run it.
- Action items that are code defects become tracked bugs or issues, per project convention —
  link them from the action-items table.
- Commit as `docs: postmortem <slug>` — a postmortem is documentation, not a code change.
