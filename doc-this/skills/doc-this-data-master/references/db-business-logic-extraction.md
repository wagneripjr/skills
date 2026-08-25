# Per-Engine Recipes — DB Business Logic Extraction

How to extract views, stored procedures, functions, triggers, rules, computed/generated columns, and DB-side scheduled jobs from each major engine's system catalog. Use these when you have read-only access to the live DB. When you only have DDL/migrations, parse those instead.

## PostgreSQL

```sql
-- Views (including materialized)
SELECT table_schema, table_name, view_definition
FROM information_schema.views
WHERE table_schema NOT IN ('pg_catalog', 'information_schema');

SELECT schemaname, matviewname, definition
FROM pg_matviews;

-- Stored procedures and functions
SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS definition,
       l.lanname AS language, p.prokind AS kind  -- 'f' function, 'p' procedure, 'a' aggregate, 'w' window
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema');

-- Triggers
SELECT t.tgname, n.nspname || '.' || c.relname AS table,
       CASE t.tgtype::int4 & 66
           WHEN 2 THEN 'BEFORE' WHEN 64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal;

-- Rules
SELECT schemaname, tablename, rulename, definition
FROM pg_rules
WHERE schemaname NOT IN ('pg_catalog', 'information_schema');

-- Generated columns
SELECT table_schema, table_name, column_name, generation_expression
FROM information_schema.columns
WHERE is_generated = 'ALWAYS';

-- Non-trivial column DEFAULTs (filter out simple literals/now())
SELECT table_schema, table_name, column_name, column_default
FROM information_schema.columns
WHERE column_default IS NOT NULL
  AND column_default !~* '^(now\(\)|current_timestamp|current_date|true|false|null|\d+|\047[^\047]*\047|nextval)';

-- pg_cron scheduled jobs
SELECT jobid, schedule, command, nodename, jobname FROM cron.job;
```

## MySQL / MariaDB

```sql
-- Views
SELECT table_schema, table_name, view_definition
FROM information_schema.views
WHERE table_schema = DATABASE();

-- Stored procedures and functions
SELECT routine_schema, routine_name, routine_type, data_type, routine_definition
FROM information_schema.routines
WHERE routine_schema = DATABASE();

-- Triggers
SELECT trigger_name, event_manipulation, event_object_table,
       action_timing, action_statement
FROM information_schema.triggers
WHERE trigger_schema = DATABASE();

-- Generated columns
SELECT table_schema, table_name, column_name, generation_expression
FROM information_schema.columns
WHERE generation_expression IS NOT NULL AND generation_expression <> '';

-- Events (MySQL Events scheduler)
SELECT event_schema, event_name, event_definition, interval_value, interval_field
FROM information_schema.events
WHERE event_schema = DATABASE();
```

## SQL Server

```sql
-- Views
SELECT s.name + '.' + v.name AS view, m.definition
FROM sys.views v
JOIN sys.schemas s ON s.schema_id = v.schema_id
JOIN sys.sql_modules m ON m.object_id = v.object_id;

-- Stored procedures
SELECT s.name + '.' + p.name AS proc, m.definition
FROM sys.procedures p
JOIN sys.schemas s ON s.schema_id = p.schema_id
JOIN sys.sql_modules m ON m.object_id = p.object_id;

-- Functions (scalar / table-valued)
SELECT s.name + '.' + o.name AS function_name, o.type_desc AS kind, m.definition
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.type IN ('FN', 'IF', 'TF');

-- Triggers
SELECT s.name + '.' + t.name AS trigger_name,
       OBJECT_NAME(t.parent_id) AS table_name,
       m.definition
FROM sys.triggers t
JOIN sys.schemas s ON s.schema_id = OBJECTPROPERTY(t.object_id, 'SchemaId')
JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE t.is_ms_shipped = 0;

-- Computed columns
SELECT OBJECT_SCHEMA_NAME(c.object_id) + '.' + OBJECT_NAME(c.object_id) AS table_name,
       c.name AS column_name, cc.definition, cc.is_persisted
FROM sys.computed_columns cc
JOIN sys.columns c ON c.object_id = cc.object_id AND c.column_id = cc.column_id;

-- Default constraints (non-trivial)
SELECT OBJECT_SCHEMA_NAME(parent_object_id) + '.' + OBJECT_NAME(parent_object_id) AS table_name,
       COL_NAME(parent_object_id, parent_column_id) AS column_name,
       definition
FROM sys.default_constraints
WHERE definition NOT IN ('(getdate())', '(getutcdate())', '((0))', '((1))', '(0)', '(1)', 'NULL');

-- SQL Server Agent jobs (requires VIEW SERVER STATE / sysadmin)
SELECT j.name, s.step_id, s.step_name, s.command, sched.name AS schedule_name
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobsteps s ON s.job_id = j.job_id
LEFT JOIN msdb.dbo.sysjobschedules js ON js.job_id = j.job_id
LEFT JOIN msdb.dbo.sysschedules sched ON sched.schedule_id = js.schedule_id
WHERE j.enabled = 1;
```

## Oracle

```sql
-- Views
SELECT owner, view_name, text FROM all_views WHERE owner = USER;

-- Stored procedures, functions, packages
SELECT owner, name, type, line, text
FROM all_source
WHERE type IN ('PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY')
  AND owner = USER
ORDER BY owner, name, type, line;

-- Triggers
SELECT owner, trigger_name, trigger_type, triggering_event,
       table_owner, table_name, trigger_body
FROM all_triggers
WHERE owner = USER;

-- Virtual columns (computed)
SELECT owner, table_name, column_name, data_default
FROM all_tab_cols
WHERE virtual_column = 'YES' AND owner = USER;

-- DBMS_SCHEDULER jobs
SELECT owner, job_name, job_action, schedule_name, repeat_interval, enabled
FROM all_scheduler_jobs
WHERE owner = USER;
```

## SQLite

```sql
-- Views and triggers (definitions stored in sqlite_master)
SELECT type, name, tbl_name, sql
FROM sqlite_master
WHERE type IN ('view', 'trigger') AND sql IS NOT NULL;

-- Generated columns: parse from CREATE TABLE statements
SELECT name, sql
FROM sqlite_master
WHERE type = 'table' AND sql LIKE '%GENERATED%';
```

SQLite has no stored procedures and no DB-side scheduler.

## Data distribution profiling

Queries for SKILL.md §5a data-distribution mining. Read-only; run against a snapshot or a
read-only connection. Replace `<table>`/`<col>` per target; keep every executed query in
`data-profile.md` next to its finding so the profile stays reproducible.

```sql
-- Distinct values of an enum-ish column (compare against code / CHECK-constraint handling)
SELECT <col>, COUNT(*) AS rows FROM <table> GROUP BY <col> ORDER BY COUNT(*) DESC;

-- Null rate for a column the code dereferences unguarded
SELECT COUNT(*) AS total, COUNT(<col>) AS non_null, COUNT(*) - COUNT(<col>) AS nulls
FROM <table>;

-- Orphan rows where the FK is enforced only in application code
SELECT COUNT(*) AS orphans
FROM <child> c LEFT JOIN <parent> p ON p.<id> = c.<parent_id>
WHERE p.<id> IS NULL;

-- Rows per state (compare against the extracted state machine)
SELECT <status_col>, COUNT(*) AS rows FROM <table> GROUP BY <status_col>;

-- Ranges the code bounds implicitly
SELECT MIN(<col>) AS min_value, MAX(<col>) AS max_value FROM <table>;
```

Finding candidate enum-ish columns (low distinct counts) per engine:

```sql
-- PostgreSQL (needs ANALYZE-fresh stats)
SELECT tablename, attname, n_distinct
FROM pg_stats
WHERE schemaname = 'public' AND n_distinct BETWEEN 1 AND 50;

-- MySQL / MariaDB: shortlist CHAR/VARCHAR/TINYINT columns, then sampled COUNT(DISTINCT ...)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND data_type IN ('char', 'varchar', 'tinyint', 'smallint', 'enum');

-- SQL Server
SELECT OBJECT_NAME(s.object_id) AS table_name, c.name AS column_name
FROM sys.stats s
JOIN sys.stats_columns sc ON sc.object_id = s.object_id AND sc.stats_id = s.stats_id
JOIN sys.columns c ON c.object_id = sc.object_id AND c.column_id = sc.column_id;
-- then sampled COUNT(DISTINCT ...) on the shortlist

-- Oracle
SELECT table_name, column_name, num_distinct
FROM all_tab_col_statistics
WHERE owner = USER AND num_distinct BETWEEN 1 AND 50;
```

Large-table notes:

- Sample instead of full-scanning: `TABLESAMPLE SYSTEM (1)` (PostgreSQL, SQL Server),
  `SAMPLE(1)` (Oracle); on MySQL fall back to an indexed-range slice. A sampled profile is
  still a citation, but the recorded query must show the sampling.
- Never select identifying columns' raw values — profile counts and distinct values of
  non-identifying columns only (PII rules in SKILL.md §5a).

## When live access is unavailable

Parse from DDL files / migrations / ORM metadata. Approximate ordering:

1. Look for files named `*.sql`, `migrations/`, `db/migrate/`, Liquibase `changelog.xml`, Flyway `V*__*.sql`
2. ORM files: Prisma `schema.prisma`, Rails `db/schema.rb`, EF Core `Migrations/`, TypeORM `entities/`, SQLAlchemy `models/`
3. For procs/triggers/views: search migrations for `CREATE PROCEDURE`, `CREATE TRIGGER`, `CREATE VIEW`, `CREATE OR REPLACE`
4. For computed columns: search for `GENERATED ALWAYS AS` or framework-specific generated-column declarations

If neither live access nor sufficient DDL artifacts exist, mark as 🔴 GAP and ask the user.

## Output narration format

For every extracted DB object, write a `business-logic.md` entry like:

```markdown
### `dbo.usp_CalculateInvoiceTotal` (stored procedure)

**Parameters**: `@OrderId INT`, `@Subtotal MONEY`
**Returns**: `MONEY` (final invoice total)

**Business logic** (narrated, 🟢 confirmed from procedure body):
1. Computes tax based on customer's region (lookup in `regions.tax_rate`)
2. Applies discount when customer's loyalty tier is GOLD or PLATINUM (read from `customers.tier`)
3. Adds shipping fee from `shipping_zones` table joined on customer's zip code
4. Inserts a row into `invoices` and updates `orders.invoice_id` via the `tr_orders_invoice_link` trigger

**Side effects**:
- INSERT into `invoices`
- UPDATE on `orders` (via trigger `tr_orders_invoice_link`)

**Source**: `BillingDB/Procedures/usp_CalculateInvoiceTotal.sql:1-42` (extracted via `sys.sql_modules`)
**Ownership** (when ownership=mixed): app-owned | external — fill in per state.json.database_ownership
```

This narration is what Detective cross-references into per-module domain rules (when DB ownership = `owned` or for app-owned objects in `mixed`) or into per-FR external-contract notes (when `external` or for externally-owned objects in `mixed`).
