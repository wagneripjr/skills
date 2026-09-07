# Nobody can find anything in our docs

I run the platform team at Fernbrook Freight. Our service `parcel-router` has accumulated a
docs folder over about a year and it has stopped being useful. New joiners ask in chat instead
of reading it, and our coding agents grep the whole tree and still come back with the wrong
file. There is no listing of what exists anywhere, so the only way to find out whether we have
a document about something is `ls` and guessing from filenames.

Please recreate the tree exactly as given below in the working directory, then fix it.

Two things you should know before you touch it:

- **Everything below is already committed in git.** The full history is intact and nothing you
  delete from the working tree is lost.
- **`docs/metrics/catalog.md` is rewritten every night** by `tools/gen-metric-catalog`, which
  lives in a different repository. Whatever is in that file each morning is whatever that tool
  produced.

We also want our coding agents to stop grepping. They read `CLAUDE.md` and `AGENTS.md` at the
repo root, so whatever standing instruction you leave for them belongs there.

## The tree as it stands

### `README.md`

```markdown
# parcel-router

Routes inbound parcels to carrier partners and tracks each hand-off until the carrier confirms
receipt.
```

### `CONTRIBUTING.md`

```markdown
# How to contribute

Open a pull request against master. One reviewer from the platform team is required before
merge.
```

### `docs/log.md`

```markdown
# Change log

- 2026-01-14 - added the carrier outage runbook
- 2026-02-11 - rewrote the deploy doc for the new pipeline
- 2026-03-02 - added ADR 0002
```

### `docs/deploy.md`

```markdown
# Deploying parcel-router

Deploys go out through the release pipeline. Tag the commit, wait for the build, then approve
the production stage. A rollback is a re-run of the previous tag.

## Changelog

| Date | Change |
| --- | --- |
| 2026-01-08 | First version |
| 2026-02-11 | Rewritten for the new pipeline |

Last updated: 2026-02-11 by Dana
```

### `docs/oncall.md`

```markdown
# On-call rotation

One primary and one secondary, rotating weekly at 10:00 on Mondays. The primary owns the pager;
the secondary owns anything that escalates past thirty minutes.

## Revision history

- v1 - initial rotation
- v2 - added the secondary
```

### `docs/adr/0001-redis-streams.md`

```markdown
# ADR 0001: Redis Streams for the dispatch queue

Status: accepted

We dispatch parcels through Redis Streams rather than a hosted queue, because we already run
Redis for rate limiting and the consumer-group semantics are enough for our throughput.
```

### `docs/adr/0002-retry-budget.md`

```markdown
# ADR 0002: Per-carrier retry budget

Status: accepted

Each carrier gets its own retry budget so that one flapping partner cannot exhaust the retries
available to the others.

Last updated: 2026-03-02
```

### `docs/runbooks/stuck-parcel.md`

```markdown
# Clearing a stuck parcel

A parcel is stuck when it has sat in the dispatch stream for more than fifteen minutes. Read the
consumer group lag, then re-queue the entry by id.
```

### `docs/runbooks/carrier-outage.md`

```markdown
# Carrier outage response

When a carrier stops accepting hand-offs, disable it in the routing table and let the fallback
carrier absorb the volume. Re-enable only after two clean health checks.
```

### `docs/metrics/catalog.md`

```markdown
# Metric catalog

| Metric | Unit |
| --- | --- |
| parcels_dispatched_total | count |
| carrier_handoff_seconds | seconds |
```

### `docs/scratch.md`

```markdown
# scratch

- ask Ruben about the Tuesday backlog
- check whether the carrier list is still hard-coded
- 4 open questions from the November review
```

## Output Specification

Write, in the working directory:

- Every document above, at the path given, with whatever corrections you decide it needs — or
  absent, if you conclude a file should not exist at all.
- `index.md` at the repo root.
- `docs/index.md`, `docs/adr/index.md`, `docs/runbooks/index.md`, plus a listing for any other
  folder you judge should have one.
- `CLAUDE.md` and `AGENTS.md` at the repo root, carrying the standing instruction for our agents.
- `NOTES.md` at the repo root: what you deleted and why, anything you deliberately left alone and
  why, and every document you could not summarise without guessing.
