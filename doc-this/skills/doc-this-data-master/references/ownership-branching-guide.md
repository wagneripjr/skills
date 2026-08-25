# Ownership Branching — Decision Tree and Output Contract

How `doc-this-data-master` adapts behavior based on `state.json.database_ownership` and `state.json.schema_versioning` (set by `doc-this/references/step-04-database-context.md` during first run).

## Decision tree

```
database_ownership?
├─ none      → return immediately, no DB analysis needed
├─ owned     → full schema + business-logic + migrations-timeline (DB is implementation detail)
├─ external  → external-contract + business-logic with "owned by DBA team" markings + emit kind:database for external-surface.json
└─ mixed     → owned-set (per app-owned tables) + external-contract (per external tables) + per-object ownership label
                + emit kind:database entries only for the external-owned objects
```

## Per-case output contract

### Case: `owned`

The team controls the schema. DB is implementation detail of the app.

**Files produced** in `<output_folder>/database/`:
- `schema.md` — DDL + ERD (always)
- `business-logic.md` — narrated procedures/functions/views/triggers/computed columns/scheduled jobs (always)
- `data-dictionary.md` — all tables + columns (always)
- `relationships.md` — relationship matrix (always)
- `procedures.md` — extracted procedure/function bodies (when present)
- `orm-drift.md` — only when drift exists between ORM models and DB schema
- `migrations-timeline.md` — only when `schema_versioning = in-repo`

**Architect integration**: NO `kind: "database"` entries in `external-surface.json`. The DB is internal — its operations are covered transitively by `@api`/`@browser`/`@cli`/`@message` scenarios.

**Detective integration**: cross-references rules from `business-logic.md` into per-module domain rules in unit `requirements.md` (Detective's responsibility, but Data Master must produce the source).

**Writer integration**: NO `@database` scenarios.

**Reviewer integration**: flags any `@database` scenario as suspect (DB is implementation detail; should not appear in scenarios).

### Case: `external`

The team can't change the schema. DB is a frozen external contract.

**Files produced** in `<output_folder>/database/`:
- `external-contract.md` — every consumed table, view, procedure, function, trigger documented as a **frozen interface** with version metadata (where available) (always)
- `business-logic.md` — narrated logic of every consumed DB object, with explicit "🟢 external dependency, owned by [DBA team] — coordinate with the team for any change" markings (ownership is itself a citation from the snapshot/contract source per the describe-only pact)
- `schema-snapshot.sql` — when `schema_versioning ∈ {external, unversioned}` and a snapshot was possible (for posterity and migration baseline)
- `data-dictionary.md` — only the tables/columns the app actually consumes
- `relationships.md` — only relationships involving consumed objects
- `procedures.md` — extracted procedure/function bodies (always; this is the contract)

**Architect integration**: emit `kind: "database"` entries for `external-surface.json` covering each consumed object:

```json
{
  "kind": "database",
  "name": "dbo.usp_CalculateInvoiceTotal",
  "type": "stored_procedure",
  "schema_object": "dbo.usp_CalculateInvoiceTotal",
  "consumed_by": ["src/services/InvoiceService.cs:142"],
  "contract_owner": "DBA team",
  "schema_version": "<version or 'unknown 🔴'>",
  "visibility": "external_dependency",
  "confidence": "confirmed"
}
```

Architect renders the external DB as a separate Container in C4 diagrams, outside the team's deployment perimeter, labeled with the `contract_owner`.

**Detective integration**: external DB rules are NOT incorporated into per-module domain rules (the rules are NOT the team's; they're the DBA's contract). Instead, Detective creates per-FR notes: "Depends on external DB contract X — see external-contract.md."

**Writer integration**: emits `@database` scenarios for app-side calls that MUST continue to interact with the external DB in a specific way. Each scenario asserts observable contract behavior (parameter shape, return, side effects on rows the app reads next, transactional semantics) — NOT internal procedure logic.

**Reviewer integration**: Rule H (every `kind: "database"` entry is referenced from at least one `@database` or `@browser`/`@cli` scenario's call graph). Schema-version gate: if `schema_versioning = unversioned` AND no `schema-snapshot.sql` exists, refuse coverage completion.

### Case: `mixed`

Some schemas/tables app-owned, others externally owned.

**Files produced**: BOTH the `owned` set (for app-owned objects) AND the `external` set (for externally-owned objects). Each table/object carries an `ownership: app-owned | external` label in `data-dictionary.md` and `relationships.md`.

**Architect integration**: emit `kind: "database"` entries ONLY for externally-owned objects. App-owned objects stay implementation detail.

**Detective + Writer + Reviewer**: behave per-object based on the ownership label. App-owned object rules go into per-module domain rules + no `@database` scenarios; externally-owned object rules become external-contract notes + `@database` scenarios.

The boundary is rendered explicitly in C4 (the team's deployment perimeter encloses app-owned tables only).

### Case: `none`

Skipped. No DB analysis. Doc-Master returns "skipped — project has no relational database" to the orchestrator immediately.

## Schema-versioning interactions

| `schema_versioning` | Behavior |
|---|---|
| `in-repo` | Read migrations folder, build chronological evolution narrative, identify "interesting" migrations (drops, complex backfills, schema flips). Produce `migrations-timeline.md`. |
| `external` | Read schema from user-provided external location (path, dump file, or live read-only connection). Save as `schema-snapshot.sql` with extraction date. |
| `unversioned` | Snapshot from live DB if available. Else create 🔴 GAP recommending baseline capture before reimplementation; suggest the per-engine command. Add to `gaps.md`: "DB schema is not versioned — recommend capturing baseline DDL before any migration work." |
| `unknown` | Probe for migration tooling on first run; if found, switch to `in-repo` and tell orchestrator to update `state.json`; else fall back to `unversioned`. |

## Question priority for the user

If the team can't determine ownership cleanly during step-04, ask in this order:

1. "Can your team merge a schema migration to production without DBA approval?"
2. "Is there a `migrations/`, `db/migrate/`, or equivalent folder in this repo?"
3. "Is there a separate schema repo or DBA-managed location? Path?"
4. "If neither in-repo nor external location: do you have read-only access to the live DB to snapshot?"
5. "If no read-only access: who at the DBA team can grant it, and is there a database snapshot or dump available?"

Persist answers to `state.json` so future Discovery runs don't ask again.

## Customer-project safety

For customer projects — any project outside your own or your organization's namespace:
- NEVER provide write credentials or run any mutating SQL — read-only DSN only
- If the user provides write credentials by mistake, halt and ask for read-only credentials
- Never include unredacted production data in any output file — only schema, procedure bodies, view definitions, trigger logic
