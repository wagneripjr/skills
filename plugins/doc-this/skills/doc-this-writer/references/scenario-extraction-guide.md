# Scenario Extraction Guide

How to write Gherkin scenarios scoped to externally observable behavior. The Writer follows this guide; the Reviewer enforces it.

## The principle

ATDD scenarios assert **external** observable behavior — what an external actor (user, public API consumer, partner system, external DB) can see. Internal class names, internal method calls, internal state mutations are NOT scenario content. Those belong in `design.md`.

If a scenario reads "OrdersService.Finalize updates `order.status` to `'finalized'`", it's wrong. It should read "When the customer finalizes the order, they see the confirmation page" — the same behavior, observed from outside.

### Three homes for what you discover

Reverse-engineering surfaces three kinds of fact about each behavior. Each has its own home — keep them separate and the ATDD tension disappears:

- **Scenario** (`requirements.md` → Acceptance scenarios) — the externally observable **what**: business language an external actor can verify. The only place that must stay implementation-free.
- **Realization map** (`requirements.md` → Realization map) — the internal **how**: which service → procedure → table/scheduler realizes the behavior, behavior-indexed and cited. This is where every class/method/table/proc/scheduler name belongs. Nothing is lost by keeping the scenario clean — the detail moves here.
- **Protocol driver** (`docs/design/protocol-drivers.md`, generated later by `doc-this-promote`) — the external **bridge**: the page/endpoint a test drives to exercise the behavior. It names the external entry point, never the internals.

The leak to avoid is collapsing the *how* into the *what* — naming `OrderService` or `TB_ORDERS` in a Given/When/Then step. When you feel that urge, it's a signal the fact belongs in the Realization map, not the scenario.

## What goes in a scenario

✅ DO assert:
- HTTP response status, headers, body shape
- UI text the user sees, screen they land on, button states
- Events published to a broker (topic name, payload shape)
- DB-state changes for **external** databases (rows changed, procedures invoked) — only `@database` scenarios
- CLI output (stdout, stderr, exit code)
- Side effects observable through the protocol (a follow-up GET returns the new state)

❌ DON'T assert:
- Internal class names, method calls, private fields
- Internal database table contents (when DB is owned)
- Internal log messages (unless they cross an external observability boundary)
- Internal events that don't leave the deployment perimeter

## Reframing internal detail into observable language

> Paths, tables and type names in the examples below belong to a **fictional** orchard-packhouse
> WebForms application, reused across the doc-this references. They illustrate shape only.

When the behavior you observed is realized by internal machinery (a service call, an async scheduler, an owned-DB write), don't name the machinery in the step — assert its **observable consequence** and record the machinery in the Realization map. Concrete reframes:

| Internal detail (what you saw) | Observable step (what to write) |
|--------------------------------|----------------------------------|
| `TB_PKH_CRATE (STATUS=0)` is created | "a pending crate is recorded" |
| `ConfirmWeighingScheduler` is enqueued | "the weighing confirmation is scheduled for asynchronous processing" |
| `AutoDispatch.SaveDispatch` is invoked | (drop the call — assert the downstream observable, e.g. "the dispatch is recorded from the signed manifest") |
| `UserId/PersonId/User` set in `Session` | "the user is authenticated for the session" |
| `ECrateGrade.Premium` enum branch | "a crate of grade Premium" |

Each reframed scenario gets a Realization-map row carrying the dropped detail with its `file:line` — the citation, not the step, is what preserves traceability to the legacy code.

## Scenario tag rules

| Tag | When to use | Source |
|-----|-------------|--------|
| `@api` | Public HTTP/gRPC/WebSocket endpoint | `external-surface.json` entry with `kind: http/grpc/websocket` AND `visibility: public` |
| `@browser` | UI route | `external-surface.json` entry with `kind: ui` |
| `@cli` | CLI command | `external-surface.json` entry with `kind: cli` AND `visibility: public` |
| `@message` | Message topic publisher | `external-surface.json` entry with `kind: message` AND `visibility: public` |
| `@database` | External DB call (external/mixed ownership only) | `external-surface.json` entry with `kind: database` AND `visibility: external_dependency` |
| `@browser-exempt` | Headless service consumed by partners only (no UI) | Manual annotation; needs reason |

**Dual-tag** `@api @browser` when the same scenario must pass against both drivers (UI flow that hits the public API).

**Don't tag private endpoints** with `@api`. Note in `design.md`: "covered transitively via @browser of consumer X."

## Confidence per scenario (binary per the describe-only pact)

Every scenario gets a confidence marker:

- 🟢 — extracted from existing tests, integration tests, or unambiguous cited code (controller signature + clear handler logic + observable response, all with `file:line` citations)
- 🔴 — behavior inferred from signatures alone with no existing test, OR guessed from sparse code. Recorded in `<unit>/questions.md` with a question ID; the scenario draft is **not** written into the spec file. **No 🟡** — pattern-matching is not a fact.

Mark below each scenario block:

```gherkin
@api
Scenario: ...
  Given ...
  When ...
  Then ...
```
Confidence: 🟢
Evidence: static

## Evidence provenance (metadata on 🟢 — not a third color)

Every scenario carries an `Evidence:` line directly under its Confidence marker. The Writer
always emits `Evidence: static`. The Tracer's corroboration sweep upgrades it to
`Evidence: static + runtime (<artifact cite>)` when a specific runtime artifact (log line
with timestamp, span ID, HAR entry, error-tracker event ID) matches the scenario's
observable assertion — the same citation bar as a 🔴→🟢 promotion.

Rules:
- The Evidence line appears only under 🟢 markers (🔴 scenarios are never written into specs).
- Confidence stays binary; `Evidence:` records which evidence classes support an
  already-established fact, never how sure the agent feels. 🟡 stays retired.
- No runtime match never demotes the 🟢 or annotates doubt — the line simply stays
  `Evidence: static`. Absence of evidence is not evidence.

## Common pitfalls

### Pitfall 1: Asserting internal state

❌ Wrong:
```gherkin
When the user posts /api/orders
Then OrdersService.Finalize is called
And order.status equals "finalized"
```

✅ Right:
```gherkin
When the user POSTs /api/orders with valid items
Then the response is 201 with an order ID
And a GET /api/orders/{id} returns the order with status "finalized"
```

### Pitfall 2: Mentioning class or method names

If a scenario mentions a class name, it's coupling the spec to the implementation. The new system will have different class names; the scenario must still pass.

### Pitfall 3: Missing failure scenarios

Every public surface gets at least one happy-path AND one failure scenario. Failure scenarios document the rejection contract — equally important.

### Pitfall 4: Ambiguous external state

Use realistic, scenario-specific Given clauses. "Given a customer" is too vague — use "Given a customer with an active subscription and 2 items in cart."

### Pitfall 5: Scenario that requires private knowledge to verify

If verifying the scenario requires reading internal logs, querying internal tables, or stubbing internal methods, the scenario is testing the wrong layer. Redesign so the assertion is observable through the protocol.

## When external DB scenarios are right

`@database` scenarios are appropriate when:
- The DB is externally owned (`database_ownership = external` or the table is `external` in mixed)
- The new app must continue to call the same procedure/view/trigger with the same parameters
- The scenario asserts the contract: parameter shape, return value, side effect on rows the app reads next

`@database` scenarios are wrong when:
- The DB is owned (`database_ownership = owned`) — DB is implementation detail
- The scenario asserts internal table content that's not part of the external contract
- The scenario depends on the procedure's internal logic (that's the DBA's contract, not yours to assert)

## Owned-DB state as the only observable

For internal back-office flows, the only thing that visibly changes is owned-DB state — there's no API response or UI text to assert. The temptation is to write `Then TB_PKH_CRATE STATUS=0 is created` in an `@api`/`@browser` step. Resist it: that couples the spec to the legacy schema, so the scenario won't survive a reimplementation onto a different data model.

Instead, phrase the step in business terms ("a pending crate is recorded") and record the table/column mapping in the Realization map. The behavior is still fully captured — the observable assertion lives in the scenario, the schema-level truth lives in the map with its `file:line`. Strict, and painless, because nothing is discarded.

(This is owned-DB only. For external/mixed ownership, naming the procedure/table in a `@database` step is correct — there it is the external contract the new system must keep honoring.)

## Quick checklist before finalizing a scenario

- [ ] Tag matches the surface kind and visibility
- [ ] No internal class/method/scheduler names, owned-DB table/column names, session keys, or internal enums in any step (external/mixed `@database` procs are the exception)
- [ ] Any internal detail you reframed out has a row in the unit's Realization map (so the citation is preserved)
- [ ] Given clauses set ALL prerequisites observable from outside
- [ ] Then clauses assert ONLY observable outcomes
- [ ] Confidence marker present
- [ ] `Evidence:` line present under the Confidence marker (`static` from the Writer; `static + runtime (<artifact cite>)` only via the Tracer, with an artifact-specific citation)
- [ ] At least one happy + one failure scenario per public surface
