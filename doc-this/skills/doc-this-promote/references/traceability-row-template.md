# Traceability Row Template

## Generated mode — check FIRST

When the target repo's `docs/okf.yaml` carries `traceability: generated`, **never hand-append rows and
never hand-write the projection** — halt and tell the user. In that repo `docs/TRACEABILITY.md` is a
generated projection built from the frontmatter relation keys (`adrs`, `specs`, `derives-from`) that
promote stamps on each concept doc, and regenerating it belongs to whatever toolchain declared the
key. Hand-appended rows are clobbered on the next regeneration, and in a repo whose toolchain checks
the projection they read as out of sync.

The rest of this file applies to every other repo: no `traceability` key in okf.yaml, or no okf.yaml
at all. Never add the key to an existing repo's manifest, and never write it into a manifest promote
bootstraps — mode flips are a human decision.

## Curated mode

`doc-this-promote` appends rows to `docs/TRACEABILITY.md` in two tables, in the exact formats
given below. In a repo that already has a `docs/TRACEABILITY.md`, match that file's existing
column set instead — never reshape a table the repo already maintains.

## Requirements → Implementation

```markdown
| Req ID | Description | ADR(s) | Feature File | Spec Coverage | Status |
|--------|-------------|--------|--------------|---------------|--------|
| FR-042 | Place a new order | ADR-007 | tests/Acme.Specs/Features/Orders.feature | 0/2 TODO | Pending |
| FR-043 | Reject orders for inactive subscriptions | ADR-007 | tests/Acme.Specs/Features/Orders.feature | 0/1 TODO | Pending |
```

Spec Coverage starts at `0/N TODO` (where N is the count of `@api`/`@browser`/`@cli`/`@message`/`@database` scenarios for that FR in the `.feature` file). When tests start passing, update to `K/N GREEN` — that update is the dev team's responsibility, not Promote's.

NOTE: if the project enforces a spec-coverage gate at commit time, the `0/N TODO` initial value will trip it going forward — that's intentional. Such a gate's job is to nudge the dev team to write protocol drivers and start passing scenarios. See the `Why TODO is initial state` section below.

## ADRs → Requirements

```markdown
| ADR | Title | Status | Requirements |
|-----|-------|--------|--------------|
| ADR-007 | Order placement architecture | Accepted (retroactively) | FR-042, FR-043 |
| ADR-008 | External billing-DB contract | Accepted (retroactively) | FR-045 |
```

## Bugs → Traceability

Promote does not write to this table — it is reserved for `BUG-NNN` files the user creates
manually. Discovery describes what exists; it never labels behavior as a bug, so it has nothing
to put here.

## Why `0/N TODO` is the initial state

When the legacy reverse-engineering produces specs for an existing system, the legacy code was already running — so technically there's coverage. But:

1. The promoted `.feature` files are NEW; nobody has implemented protocol drivers for them yet.
2. The legacy code's tests (if any) are unrelated to the new spec scenarios.
3. The intent is to drive a reimplementation OR an evolution where the team uses the spec scenarios as living acceptance criteria.

So the row reflects "the new spec exists, no test passes yet" — which is accurate the moment promotion finishes. The dev team's first task is to implement the protocol drivers and turn `0/N TODO` into `K/N GREEN` as scenarios pass.

If the user explicitly does NOT want such a gate to fire on these (because the legacy code is still authoritative), and their gate supports a per-artifact exemption marker, that marker goes inside the `.feature` file with a reason — for example `reason="legacy spec; coverage migrating from legacy tests"`. Document this option in the suggested commit message comment. Ask the user what their project's exemption syntax is rather than assuming one.

## Format integrity

- Always preserve existing rows in `TRACEABILITY.md` — append, never replace
- Keep the table headers alignment consistent (the gate's parser tolerates pipe-table variations but consistency helps human readers)
- After append, run `grep -E '^\| (FR|NFR|BUG|ADR)-' docs/TRACEABILITY.md | wc -l` and confirm it equals (existing rows + appended rows)
