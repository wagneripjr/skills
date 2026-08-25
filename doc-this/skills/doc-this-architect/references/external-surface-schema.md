# Schema — `.doc-this-sdd/external-surface.json`

The unified catalog of every external surface the legacy system exposes or depends on. Produced by Architect; classified (`visibility`) by Detective; consumed by Writer (to decide which scenarios to emit), Reviewer (to validate coverage), and `doc-this-promote` (to generate ATDD scaffolding with proper tags).

> Paths, tables and type names in the examples below belong to a **fictional** orchard-packhouse
> WebForms application, reused across the doc-this references. They illustrate shape only.

## Top-level shape

```json
{
  "generated_at": "2026-05-04T16:00:00Z",
  "project_root": "/path/to/legacy-app",
  "database_ownership": "external",
  "entries": [
    /* ... see Entry shape below ... */
  ]
}
```

## Entry shape

Every entry has a `kind`. Per-kind required fields are listed below. All entries also carry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | string | yes | `http` / `grpc` / `websocket` / `cli` / `message` / `ui` / `job` / `database` |
| `name` | string | yes | Human-readable identifier (e.g., "POST /api/orders", "users.created topic", "auth.login.feature") |
| `consumed_by` | string[] | yes | List of `path:line` citations of internal call sites that produce/consume this surface |
| `visibility` | string | yes | `public` / `private` / `external_dependency` / `unknown`. Set to `unknown` by Architect, filled by Detective. `external_dependency` is reserved for `kind: "database"` entries when the DB is external/mixed — Architect sets that directly. |
| `confidence` | string | yes | `confirmed` / `unknown`. Mirrors the binary 🟢/🔴 scale (`inferred`/🟡 is retired per the describe-only pact). |
| `rationale` | string | no | One-sentence explanation of the visibility decision, populated by Detective |

### `kind: "http"` (REST endpoint)

```json
{
  "kind": "http",
  "name": "POST /api/orders",
  "path": "/api/orders",
  "method": "POST",
  "controller": "src/controllers/OrdersController.cs:42",
  "consumed_by": ["src/ui/OrderForm.tsx:88"],
  "visibility": "public",
  "confidence": "confirmed",
  "rationale": "Listed in developer portal; tagged @public-api in OpenAPI spec."
}
```

### `kind: "grpc"`

```json
{
  "kind": "grpc",
  "name": "OrderService.PlaceOrder",
  "service": "OrderService",
  "method": "PlaceOrder",
  "proto": "proto/order.proto:23",
  "consumed_by": [],
  "visibility": "unknown",
  "confidence": "unknown"
}
```

### `kind: "websocket"`

```json
{
  "kind": "websocket",
  "name": "/ws/notifications",
  "path": "/ws/notifications",
  "handler": "src/ws/NotificationsHub.cs:12",
  "consumed_by": ["src/ui/NotificationBell.tsx:24"],
  "visibility": "unknown",
  "confidence": "unknown",
  "rationale": "Called only from this repo's own UI — an observation about consumers, not evidence of contract status; recorded as a 🔴 question."
}
```

### `kind: "cli"`

```json
{
  "kind": "cli",
  "name": "import-orders",
  "command": "import-orders <file>",
  "entry": "src/cli/ImportOrdersCommand.cs:8",
  "consumed_by": [],
  "visibility": "public",
  "confidence": "confirmed",
  "rationale": "Documented in user-facing README as an operational command."
}
```

### `kind: "message"` (Kafka / SQS / RabbitMQ / etc.)

```json
{
  "kind": "message",
  "name": "orders.created",
  "topic": "orders.created",
  "broker": "kafka",
  "role": "publisher",
  "publisher": "src/services/OrderService.cs:91",
  "consumers_external": true,
  "consumed_by": ["external (per partner integration docs)"],
  "visibility": "public",
  "confidence": "confirmed",
  "rationale": "Consumed by the analytics partner per integration runbook."
}
```

### `kind: "ui"` (browser route / page)

**One entry per page — never grouped.** Every `markup` page in `file-manifest.json` (`.aspx`, `.master`, `.cshtml`, `.razor`, …) and every SPA route gets its own entry. A grouped entry ("WebForms pages of module X") collapses N pages into 1, makes per-page behavior untraceable, and is rejected by the Reviewer and the coverage gate.

```json
{
  "kind": "ui",
  "name": "/orders/new",
  "route": "/orders/new",
  "page": "src/pages/OrderForm.tsx:1",
  "consumed_by": [],
  "visibility": "public",
  "confidence": "confirmed",
  "rationale": "User-facing page reachable from main navigation."
}
```

User controls without an independent route (`.ascx`, partials, components) are cataloged with `subkind: "control"` and `mounted_in` (the pages hosting them) — they are covered transitively by their host pages' `@browser` scenarios:

```json
{
  "kind": "ui",
  "subkind": "control",
  "name": "crate_labels_edit",
  "page": "Web/packhouse/crate_labels_edit.ascx:1",
  "mounted_in": ["Web/packhouse/packhouse.aspx"],
  "consumed_by": [],
  "visibility": "private",
  "confidence": "confirmed",
  "rationale": "Hosted only inside packhouse.aspx (Register directive cited at packhouse.aspx:12)."
}
```

### `kind: "job"` (cron / queue consumer)

```json
{
  "kind": "job",
  "name": "DailyReconciliation",
  "schedule": "0 2 * * *",
  "handler": "src/jobs/ReconciliationJob.cs:14",
  "consumed_by": [],
  "visibility": "private",
  "confidence": "confirmed",
  "rationale": "Internal scheduled job; not externally observable."
}
```

### `kind: "database"` (external DB contract)

Only present when `database_ownership` is `external` or `mixed`. Merged from Data Master's output by Architect.

```json
{
  "kind": "database",
  "name": "dbo.usp_CalculateInvoiceTotal",
  "type": "stored_procedure",
  "schema_object": "dbo.usp_CalculateInvoiceTotal",
  "consumed_by": ["src/services/InvoiceService.cs:142"],
  "contract_owner": "DBA team",
  "schema_version": "unknown",
  "visibility": "external_dependency",
  "confidence": "confirmed",
  "rationale": "Externally-owned database; team cannot modify schema or procedure body."
}
```

## Why this exists

This is the single source of truth for the **external boundary** of the legacy system. Writer consults it to decide which scenarios to emit (`@api` only for `public` HTTP/gRPC; `@browser` for `ui`; `@cli` / `@message` / `@database` for those kinds). Reviewer uses it to enforce transitive coverage (every `private` endpoint must be reachable from a `public` scenario's call graph). `doc-this-promote` uses it to generate the right protocol driver interfaces.

Without this catalog being complete and accurate, the public/private API discipline collapses and the ATDD output regresses to "every endpoint gets an @api scenario" — exactly the failure mode this discipline prevents.
