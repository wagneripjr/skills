# Frontmatter — the OKF v0.2 field families

Every concept document is a UTF-8 markdown file opening with a YAML block delimited by `---` on
its own line, closed by `---` on its own line. Everything after is the body.

Only `type` is required (§11). Every other field below is optional, and **its absence carries
meaning**: an unverified concept is distinguishable from a verified one, and is never rejected for
it. Do not stamp a field to look complete — stamp it when there is a fact to record.

## Core (§4.1)

| Key | Required | Notes |
|---|---|---|
| `type` | **yes** | Free string, no central registry. The key the index groups by — keep values consistent within a bundle. |
| `title` | recommended | Display name. Consumers may fall back to the filename. |
| `description` | recommended | One sentence, **160 characters or fewer** — the index drops a longer one rather than truncating it. This is what the index projects; derive it from the document, never invent it. |
| `resource` | optional | Canonical URI of the underlying asset. Absent for abstract concepts. |
| `tags` | optional | YAML list of short strings for cross-cutting grouping. |

Producers MAY add any other keys, and consumers MUST NOT reject a document for keys they do not
recognise, so a repo-specific field (`owner`, `team`, `jira`) is legal. Preserve unknown keys when
rewriting a document — they belong to someone.

Example `type` values from the spec: `BigQuery Table`, `API Endpoint`, `Metric`, `Playbook`,
`Reference`, `Attested Computation`.

## Timestamps

Every timestamp-valued key is an ISO 8601 datetime **with an explicit UTC offset**:
`2026-06-30T14:00:00Z`. A date-only value names a different instant in every timezone.

## Actors (§7)

Three forms, and the prefix is load-bearing:

- `<producer>/<version>` — an agent or tool, e.g. `reference_agent/gemini-2.5-pro`
- `human:<id>` — a person, e.g. `human:jdoe`
- `process:<id>` — an automated process, e.g. `process:finance-nightly`

Trust classification keys off the `human:` prefix, so hand-authored or human-confirmed content
MUST use it. An agent writing `verified: {by: claude}` instead of `human:jdoe` silently downgrades
a human sign-off to a machine one.

## Trust (§5.2)

```yaml
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified:
  - { by: human:jdoe, at: 2026-06-25T09:00:00Z }
  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }
```

- `generated.by` is required inside `generated`; `generated.at` marks the last **meaningful**
  content change — not a reformatting, not a typo fix.
- `verified` is a list of independent confirmations. It is deliberately separate from `generated`:
  who wrote a document is rarely who confirmed it, content can change without re-confirmation, and
  a fact can be re-confirmed without being rewritten.
- A single verifier may be written as a bare mapping without the list dash. Consumers **must**
  treat that as a one-element list.

### Trust tiers (§5.3)

Derived at read time, never stored:

| `verified` state | Tier |
|---|---|
| key absent | unverified |
| only non-`human:` actors | machine-confirmed |
| any `human:<id>` actor | human-reviewed |

Storing a tier would freeze a value that the underlying fields change out from under. Tiers are
advisory signals, not access control.

## Lifecycle (§5.4, §5.5)

```yaml
status: stable        # draft | stable | deprecated
stale_after: 2026-09-23T00:00:00Z
```

- `draft` not yet reviewed, possibly incomplete · `stable` ready for consumption · `deprecated`
  kept for links and history, no longer current. **Absent means `stable`.** Do not invent a fourth
  value: a consumer that does not recognise it learns nothing, which is worse than the default.
- `stale_after` is an **absolute instant**, not a TTL, so staleness is a plain `now >= stale_after`
  comparison that does not depend on when the document was read.
- A date-only `stale_after` (`2026-12-31`) must be **ignored rather than guessed at** — it names a
  different instant in every timezone, and picking one invents a fact.

## Provenance (§5.1)

```yaml
sources:
  - id: ga4-schema
    resource: https://developers.google.com/analytics/bigquery/export-schema
    title: GA4 BigQuery Export schema
    author: team:docs-platform
    usage_count: 5000
    last_modified: 2026-05-30T00:00:00Z
usage_window: { from: 2026-06-01T00:00:00Z, to: 2026-06-30T00:00:00Z }
```

`resource` is required within an entry and names either a followable artifact (URL,
bundle-relative path, or a path into `references/`) or a scope descriptor it cannot follow
(`all queries in BigQuery project X`). `id` is optional but should be present whenever the body
cites the source.

The credibility signals `author`, `usage_count`, and `last_modified` are **objective per-source
facts**. OKF deliberately records the signals and not a score: a score is subjective, unportable
between consumers, and goes stale. `usage_count` is coarse — read it as liveness and trend, not as
a cross-kind ranking. `usage_window` frames every `usage_count` in the block; an entry may carry
its own to override it.

`last_modified` describes the **source**; `generated.at` describes the **concept**. They answer
different questions and are not interchangeable.

### Per-claim attribution

Attribute a specific claim with a markdown footnote whose label is a `sources[].id`:

```markdown
The `events_` table is sharded daily as `events_YYYYMMDD`.[^ga4-schema]

[^ga4-schema]: GA4 BigQuery Export schema
```

The label is the join key. Labels are keyed rather than positional (`sources[0]`) precisely
because agents rewrite these documents constantly: a positional index misattributes silently the
moment the list is reordered, while a stable `id` survives it.

## Body conventions (§4.2)

No section is required. Prefer structural markdown — headings, lists, tables, fenced code — over
freeform prose, since structure helps both human scanning and agent retrieval. Three headings have
conventional meaning: `# Schema`, `# Examples`, `# Computation`.

Do **not** add `## History`, `## Changelog`, `## Revision history`, version tables, or
`Last updated:` lines. `generated.at` and `verified[].at` are the sanctioned answer to "when", and
git holds the rest losslessly.

## Cross-links (§6)

Bundle-relative links beginning with `/` are the recommended form — they survive a document being
moved within its subdirectory. Relative links work too. A link asserts an untyped relationship;
the kind is conveyed by surrounding prose, not by the link.

Broken links are **not** a conformance failure. A link to a document that does not exist yet is
legitimate: it represents knowledge not written down. Never delete a link to make a checker happy.

## Attested Computation (§10) — scope note

OKF v0.2 defines a `type: Attested Computation` concept carrying `runtime`, `parameters`,
`computation`, `executor`, and `attester`, so a consumer can confirm a value was produced by the
sanctioned computation rather than improvised. It is a full subsystem with a runtime protocol.

This skill treats such documents as ordinary concepts: it indexes them, checks their frontmatter,
and leaves their contract fields untouched. It does not author, execute, or attest them.
