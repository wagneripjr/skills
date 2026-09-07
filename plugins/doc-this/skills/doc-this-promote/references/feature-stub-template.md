# Feature Stub Template

`doc-this-promote` generates one `.feature` file per unit. The file pulls scenarios from the unit's `requirements.md` and applies the right tags.

## Tag rules (per scenario)

| Source `external-surface.json` entry | Tag |
|---|---|
| `kind: http`, `visibility: public` | `@api` |
| `kind: http`, `visibility: private` | (no `@api` — covered transitively via `@browser`/`@cli`) |
| `kind: grpc`, `visibility: public` | `@api` (gRPC is a public API) |
| `kind: websocket`, `visibility: public` | `@api` |
| `kind: ui` | `@browser` |
| `kind: cli`, `visibility: public` | `@cli` |
| `kind: message`, `visibility: public`, `role: publisher` | `@message` |
| `kind: database`, `visibility: external_dependency` | `@database` |
| Same scenario must pass via both API and UI drivers | `@api @browser` |
| UI-bearing project but this scenario truly has no UI flow (e.g., partner-only API) | `@browser-exempt` |

## Skeleton

```gherkin
@feature-orders
@FR-042
Feature: Place a new order
  As a subscribed customer
  I want to place an order through the API and the website
  So that the order is recorded and an event is published

  Background:
    Given a customer with an active subscription

  @api
  # Evidence: static + runtime (req log 2026-06-14T09:22:11Z, POST /api/orders → 201)
  Scenario: Place a new order via the API
    When they POST /api/orders with valid items
    Then the response is 201 with an order ID
    And an "orders.created" event is published

  @api
  # Evidence: static
  Scenario: Reject order for inactive subscription
    Given a customer whose subscription is inactive
    When they POST /api/orders
    Then the response is 403
    And no "orders.created" event is published

  @browser @api
  Scenario: Submit order through the website
    Given they are on /orders/new
    When they fill the cart and click "Place Order"
    Then they see "Order #N confirmed"

  @database
  Scenario: External billing DB receives the contract call
    Given a finalized order with subtotal $100
    When the order completes
    Then dbo.usp_CalculateInvoiceTotal is invoked with @OrderId and @Subtotal
    And the invoice total is persisted in invoices.total
```

## Tag conventions

- `@feature-<unit-slug>` — file-level tag for the whole feature; useful for filtering test runs
- `@FR-NNN` — links scenario(s) to the requirement ID; used by traceability tooling
- `@api`, `@browser`, `@cli`, `@message`, `@database` — protocol driver tags
- `@wip` — temporary, used when a scenario isn't ready for CI; should not appear in promoted output (Promote refuses to add `@wip`)
- `@browser-exempt` — explicit "this scenario has no UI counterpart and that's intentional"; needs reason in a comment

## Cross-layer pairing

The convention (enforced by a commit-time gate in projects that run one — this plugin ships none): any scenario tagged `@api` in a UI-bearing project gets a paired `@browser` scenario in the same `.feature` file OR an explicit `@browser-exempt` reason.

If the scenario is the same Given/When/Then for both surfaces, dual-tag `@api @browser`. If the UI flow has different Given clauses (e.g., navigation), split into two scenarios with shared When/Then.

If the API is genuinely UI-less (a partner endpoint, a webhook receiver consumed only by another system), tag `@browser-exempt`:

```gherkin
@api @browser-exempt
# Browser-exempt: webhook receiver, consumed only by Stripe; no UI flow.
Scenario: Process Stripe charge.succeeded webhook
  ...
```

## File naming

- `<unit-slug>.feature` (Cucumber.js / playwright-bdd / behave / godog / cucumber-rs)
- `<UnitName>.feature` for Reqnroll (PascalCase to match C# convention) at `tests/<Project>.Specs/Features/<UnitName>.feature`

## Confidence and evidence in the feature file

Promote does NOT carry the inline 🟢/🔴 markers from `requirements.md` into the `.feature` file (Gherkin doesn't have a confidence concept). Confidence stays in `requirements.md`. The `.feature` file's authoritative role is "what the new system must do" — once the dev team implements the protocol driver and the scenario passes, confidence becomes irrelevant for that scenario.

Promote DOES carry each scenario's `Evidence:` provenance line as a `# Evidence: ...` comment directly above the `Scenario:` line (see the skeleton). It tells the driver-implementing team which scenarios are runtime-corroborated (`static + runtime (<artifact cite>)`) and which rest on reading alone (`static`) — static-only scenarios deserve the earliest driver implementation and the most skeptical look when they fail RED. A scenario whose `requirements.md` block has no Evidence line (pre-provenance run) gets `# Evidence: static`. Once the scenario runs GREEN through its driver, the comment is historical.

## Anti-patterns Promote refuses

- Generating a `.feature` file with NO scenarios (means the unit had no public surfaces) — Promote prints a warning and skips
- Generating a `.feature` file that overwrites an existing one — Promote halts and asks
- Generating `@api` tags for `private` endpoints — Promote refuses; the unit's design.md should already have these as transitive coverage notes
