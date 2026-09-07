# Template — `<unit>/requirements.md`

This template implements the describe-only pact (`${CLAUDE_PLUGIN_ROOT}/skills/doc-this/references/describe-only-pact.md`). Every claim is 🟢 (cited) or 🔴 (gap recorded in questions.md). No 🟡 INFERRED. NFRs only when a written non-functional contract exists; if there's no contract, the NFR section is **omitted entirely** — never invented to fill a template slot.

The template's body language follows `doc_language` (commonly English or Portuguese (pt-BR) for your projects). The describe-only rules apply by **meaning**, regardless of output language.

## Structure

```markdown
# Requirements — <unit name>

**Confidence summary**: 🟢 N | 🔴 N

## Purpose

[One paragraph stating what this unit does in business terms, with citation. Plain language, no implementation details. If purpose isn't stated anywhere in source — README, module-level comment, in-repo doc — record a 🔴 in the Gaps section instead of writing a generic guess.]

## External interfaces

**HTTP / gRPC / WebSocket**:
- 🟢 `POST /api/orders` (public) — places a new order. Cite: `OrdersController.cs:42`. From external-surface.json.
- 🟢 `POST /internal/sync/orders` (private) — internal sync; covered transitively via @browser scenario "Submit order through UI".

**UI routes**:
- 🟢 `/orders/new` — order placement form. Cite: `pages/OrderForm.tsx:1`.

**CLI**:
- (none)

**Messages**:
- 🟢 `orders.created` (publisher) — emitted after successful order. Cite: `OrderService.cs:91`.

**Database (external dependency)**: only when database_ownership = external or mixed
- 🟢 `dbo.usp_CalculateInvoiceTotal` — invoked during order finalization. Cite: `InvoiceService.cs:142`.

## Functional Requirements

### FR-Local-1 — Place a new order
- **Description**: User submits a cart and receives an order ID.
- **Source**: `OrdersController.cs:42` 🟢
- **MoSCoW**: Must (called from `pages/OrderForm.tsx:88` and `pages/Cart.tsx:142` — central path per spec-impact-matrix)

### FR-Local-2 — Reject orders for inactive subscriptions
- **Description**: When the customer's subscription is not active, the order is rejected with a 403.
- **Source**: `OrdersService.cs:88` 🟢
- **MoSCoW**: Must

## Non-Functional Requirements

> **Generate this section only when source has a written non-functional contract** (SLO doc, OpenAPI x-rate-limit / x-timeout, README quantitative commitment, contract test asserting a quantitative bound). If none exists, **omit the section entirely** — do not invent NFRs from middleware presence, timeout configs, or rate-limiter usage. Those are observed behaviors and belong in `design.md` as observations.

```
### NFR-Local-1 — Rate limit on order placement
- **Description**: 100 requests per minute per API key.
- **Source**: `openapi.yaml:#/paths/~1api~1orders/post/x-rate-limit` 🟢 — written contract.
- **MoSCoW**: Must
```

(Example shown only when an `x-rate-limit` extension or equivalent written contract exists in source. If the only "evidence" is `appsettings.json:Timeout=800` or `Program.cs:UseAuthentication()`, that is **not** an NFR — those are observations and go in `design.md`.)

## Acceptance scenarios

### Public API (@api scenarios)

```gherkin
@api
Scenario: Place a new order with valid items
  Given a customer with an active subscription
  When they POST /api/orders with valid items
  Then the response is 201 with an order ID
  And an "orders.created" event is published

@api
Scenario: Reject order for inactive subscription
  Given a customer whose subscription is inactive
  When they POST /api/orders
  Then the response is 403
  And no "orders.created" event is published
```
Confidence: 🟢 — extracted from `tests/orders.spec.ts:12`, `tests/orders.spec.ts:34`.

### UI (@browser scenarios)

```gherkin
@browser @api
Scenario: Submit order through the UI
  Given the customer is on /orders/new
  And they have an active subscription
  When they fill the cart and click "Place Order"
  Then they see "Order #N confirmed"
```
Confidence: 🟢 — extracted from `e2e/order-flow.spec.ts:18`.

### External DB (@database scenarios — only when database_ownership = external or mixed)

```gherkin
@database
Scenario: Order finalization invokes the legacy invoice procedure
  Given a finalized order with subtotal $100
  When the order completes
  Then dbo.usp_CalculateInvoiceTotal is invoked with @OrderId and @Subtotal
  And the result is persisted in invoices.total via the existing trigger chain
```
Confidence: 🟢 — call site `InvoiceService.cs:142`; behavior described in `.doc-this-sdd/database/external-contract.md`.

## Realization map

> **Derived view — perform no new analysis.** Build each row by joining `external-surface.json` (the external entry point) with `code-analysis.md` / `spec-impact-matrix.md` (the internal trace), reusing their `file:line` citations. This section is the home for the implementation detail that must stay OUT of scenario steps: the Gherkin describes the observable *what*, this table records the legacy *how*. Index rows by the existing scenario / FR-Local id — mint no new ids. The **internal-realization column is not a protocol-driver method source** — drivers bridge to the external entry point only (see `doc-this-promote`).

| Scenario / FR-Local | External entry point (→ driver surface) | Internal realization (cited) |
|---------------------|------------------------------------------|------------------------------|
| FR-Local-1 / "Place a new order" | `POST /api/orders` (@api) | `OrdersController.Place` → `OrderService.Finalize` → `orders` row created — `OrderService.cs:91` 🟢 |
| FR-Local-2 / "a pending invoice is recorded" | `/orders/new` (@browser) | `InvoiceService.Create` → `dbo.usp_CalculateInvoiceTotal` → `invoices (status=pending)` — `InvoiceService.cs:142` 🟢 |

(The owned-DB detail `invoices (status=pending)` lives here, not in the scenario step — the step says "a pending invoice is recorded". See `references/scenario-extraction-guide.md`.)

## Gaps (🔴)

Every 🔴 listed here is also recorded in `<output_folder>/questions.md` with the same question ID, so the Reviewer and Promote can cross-check.

- 🔴 Q-ORD-007 — Behavior on the 6th failed payment attempt within the rate-limiter window. Source code shows the rate-limiter configuration but does not state whether the user's account is locked. Needs human resolution.

## Traceability

| Requirement | Legacy source | Test file | Confidence |
|-------------|---------------|-----------|------------|
| FR-Local-1 | OrdersController.cs:42 | tests/orders.spec.ts:12 | 🟢 |
| FR-Local-2 | OrdersService.cs:88 | tests/orders.spec.ts:34 | 🟢 |
```

## Notes

- Local IDs (`FR-Local-1`) become `FR-NNN` global IDs only after `doc-this-promote` runs.
- "External interfaces" lists every surface the unit owns — pulled from `external-surface.json`.
- The **Realization map** is a derived projection (`external-surface.json` joined with `code-analysis.md` / `spec-impact-matrix.md`); it is where owned-DB table/column/proc, scheduler, and internal-orchestration detail lives so scenario steps stay externally observable. Author no fact not already cited upstream.
- **NFR section is omitted** when no written non-functional contract exists. The agent must not fabricate NFRs from middleware, timeouts, retry policies, or other observed behaviors.
- Every Gherkin scenario carries a 🟢 confidence with a citation, or it goes to `questions.md` as 🔴 — never 🟡.
- The reviewer rejects (does not downgrade) any output containing 🟡, judgment phrasing in any language, fabricated NFRs, or "should/recommend/propose" content.
