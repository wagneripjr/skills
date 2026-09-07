# Step 4 — Database Context

This step runs immediately after step-03 (specs organization) and before activating the Code Analyst. It establishes two facts that gate downstream behavior across many agents (Detective, Architect, Writer, Reviewer, Data Master).

## Why this exists

Many legacy systems carry critical business logic **inside the database** (stored procedures, functions, views, triggers, rules, computed columns, non-trivial DEFAULT expressions, DB-side scheduled jobs). Worse, some legacy apps **do not own the database** — they integrate with one owned by a DBA team, vendor, or shared system. The reverse-engineering and reimplementation strategies diverge sharply between these cases.

## Two questions, both required

### Question 1 — Database ownership

Read Scout's `surface.json` to see if a database was detected (`database_hints` field). Then ask:

> "Does this app **own** its database, or does it integrate with a database owned by another team / vendor / shared system?
>
> 1. **Owned** — your team controls the schema and can change it; the database is an implementation detail of this app.
> 2. **External** — the database is owned elsewhere; the schema is a frozen contract this app must honor; DB-resident logic (procedures, functions, triggers) is an external dependency.
> 3. **Mixed** — the app owns some schemas/tables and integrates with others (common in integration-heavy systems).
> 4. **None** — this app has no relational database (file-based, in-memory only, or only third-party APIs).
>
> Quick test: can your team merge a schema migration to production without DBA approval? If yes → Owned. If no → External or Mixed.
>
> Press 1, 2, 3, or 4."

Map the answer to `state.json.database_ownership`: `owned` / `external` / `mixed` / `none`.

If Scout detected no DB hints AND the user picks 2 or 3 (external or mixed), confirm:
> "Just to confirm — Scout didn't find database hints in the codebase. Are you sure this app integrates with a DB? (y/N)"

### Question 2 — Schema versioning

Skip this question if `database_ownership = none`.

Otherwise ask:

> "How is the database schema versioned?
>
> 1. **In-repo** — migrations folder exists in this repo (e.g., `migrations/`, `db/migrate/`, Liquibase changelog, Flyway scripts, EF migrations, Alembic, Prisma)
> 2. **External** — schema is versioned by the DBA team in a separate repo or system
> 3. **Unversioned** — there's no migration history; schema lives as ad-hoc DDL or only in the live DB
> 4. **Unknown** — you're not sure; the Data Master agent will probe later
>
> Press 1, 2, 3, or 4."

Map to `state.json.schema_versioning`: `in-repo` / `external` / `unversioned` / `unknown`.

## Persist both answers

Update `.doc-this/state.json`:

```json
{
  "database_ownership": "external",
  "schema_versioning": "unversioned"
}
```

Per `references/checkpoint-guide.md` rules: read first, never remove existing fields, only add or update.

## Heads-up if `unversioned`

If `schema_versioning = unversioned`, warn:

> "⚠️  An unversioned schema means there's no canonical baseline to migrate from. I'll have Data Master snapshot the schema if there's a live DB connection available; otherwise this becomes a 🔴 GAP and we'll recommend capturing baseline DDL before any reimplementation work."

## Heads-up if `external` or `mixed`

> "Got it. The Architect will treat the external database as an external surface (same first-class status as a public API). The Writer will emit `@database` parity scenarios for app-side calls that must continue to interact with the external DB in a specific way. Doc-This-Promote will generate an `IDatabaseContractDriver` protocol driver interface to mechanically enforce the contract during reimplementation."

## What this gates downstream

| Field | Effect |
|-------|--------|
| `owned` | Data Master treats DB as implementation detail; Writer does NOT emit `@database` scenarios |
| `external` | Data Master produces `external-contract.md`; Architect adds `kind:database` to external-surface.json; Writer emits `@database` scenarios |
| `mixed` | Both behaviors apply, with explicit per-table/per-procedure ownership labels |
| `none` | Data Master is skipped entirely |
| `in-repo` | Data Master reads the migrations folder and builds an evolution timeline |
| `external` | Data Master reads the external schema location if provided; else snapshots from live DB |
| `unversioned` | Data Master snapshots from live DB if available; else creates a 🔴 GAP |
| `unknown` | Data Master probes for migration tooling on first run; auto-detects or falls back to `unversioned` flow |

## Continue

After both answers are persisted, ask:

> "[Name], shall we activate the **Code Analyst** to start the deep module-by-module analysis?"

After confirmation, hand control back to the Doc-This orchestrator to dispatch the Code Analyst.
