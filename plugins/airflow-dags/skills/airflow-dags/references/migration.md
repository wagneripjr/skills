# Migrating Airflow 2 to 3

## Contents
- [Breaking Parameter Renames](#breaking-parameter-renames)
- [Removed Features](#removed-features)
- [Context Variable Changes](#context-variable-changes)
- [Trigger Rule Renames](#trigger-rule-renames)
- [Scheduling Default Changes](#scheduling-default-changes)
- [Provider and Import Changes](#provider-and-import-changes)
- [Configuration Changes](#configuration-changes)
- [Linting and Validation Tools](#linting-and-validation-tools)
- [Migration Checklist](#migration-checklist)
- [Migrating from Time-Driven to Asset-Aware Scheduling](#migrating-from-time-driven-to-asset-aware-scheduling)

## Breaking Parameter Renames

| Airflow 2 | Airflow 3 | Notes |
|-----------|-----------|-------|
| `schedule_interval=` | `schedule=` | Both `@dag()` and `DAG()` |
| `timetable=` | `schedule=` | Pass timetable object directly to `schedule` |
| `fail_stop=True` | `fail_fast=True` | DAG-level parameter |
| `days_ago(N)` | `pendulum.today("UTC").add(days=-N)` | Or use fixed `datetime(2024, 1, 1)` |
| `max_active_tasks` (global) | `max_active_tasks` (per-dag-run) | Scope changed — now limits tasks within a single run, not across all runs |

```python
# Airflow 2
from airflow.utils.dates import days_ago

with DAG(
    dag_id="my_dag",
    schedule_interval="@daily",
    start_date=days_ago(1),
    fail_stop=True,
):
    ...

# Airflow 3
from datetime import datetime

@dag(
    dag_id="my_dag",
    schedule="@daily",
    start_date=datetime(2024, 1, 1),
    fail_fast=True,
)
def my_dag():
    ...
```

## Removed Features

| Removed | Replacement |
|---------|-------------|
| SubDAGs | Task groups — see [dependencies.md](dependencies.md) |
| SLA callbacks (`sla` parameter) | `dagrun_timeout` + `on_failure_callback` |
| XCom pickling | JSON serialization or custom XCom backend — see [data-passing.md](data-passing.md) |
| `EmailOperator` | `SmtpNotifier` from `apache-airflow-providers-smtp` |
| REST API v1 (`/api/v1/`) | REST API v2 (`/api/v2/`) |
| Flask-AppBuilder in core | Install `apache-airflow-providers-fab` if needed |
| Python 3.8 support | Python 3.9+ required |
| PostgreSQL < 13 | PostgreSQL 13+ required |
| MySQL < 8.0 | MySQL 8.0+ required |

### SubDAG Migration

```python
# Airflow 2 — SubDAG (removed)
from airflow.operators.subdag import SubDagOperator

sub = SubDagOperator(
    task_id="section_1",
    subdag=create_subdag("parent", "section_1", args),
)

# Airflow 3 — Task Group
from airflow.decorators import task_group

@task_group(group_id="section_1")
def section_1():
    task_a()
    task_b()
    task_c()
```

### SLA Migration

```python
# Airflow 2 — SLA callback (removed)
@dag(sla=timedelta(hours=2))

# Airflow 3 — dagrun_timeout + failure callback
@dag(
    dagrun_timeout=timedelta(hours=2),
    on_failure_callback=alert_sla_breach,
)
```

## Context Variable Changes

| Airflow 2 | Airflow 3 | Notes |
|-----------|-----------|-------|
| `execution_date` | `logical_date` | Same concept, renamed |
| `next_execution_date` | `data_interval_end` | Use for windowed processing |
| `prev_execution_date` | `prev_data_interval_end_success` | Narrower: only if previous succeeded |
| `conf` (in context) | `airflow.configuration.conf` | Import directly, not from context |
| `dag_run.is_backfill` | `dag_run.run_type` | Check `run_type == DagRunType.BACKFILL_JOB` |
| `dag_run.external_trigger` | `dag_run.run_type` | Check `run_type == DagRunType.MANUAL` |
| `{{ execution_date }}` | `{{ logical_date }}` | Jinja template |
| `{{ next_ds }}` | `{{ data_interval_end \| ds }}` | Template filter |

```python
# Airflow 2
def my_task(**context):
    exec_date = context["execution_date"]
    is_backfill = context["dag_run"].is_backfill
    conf = context["conf"]

# Airflow 3
from airflow.configuration import conf

def my_task(**context):
    logical_date = context["logical_date"]
    is_backfill = context["dag_run"].run_type == "backfill"
```

## Trigger Rule Renames

| Airflow 2 | Airflow 3 |
|-----------|-----------|
| `dummy` | `always` |
| `none_failed_or_skipped` | `none_failed_min_one_success` |

```python
# Airflow 2
@task(trigger_rule="dummy")
@task(trigger_rule="none_failed_or_skipped")

# Airflow 3
@task(trigger_rule="always")
@task(trigger_rule="none_failed_min_one_success")
```

All other trigger rules (`all_success`, `all_failed`, `all_done`, `one_success`, `one_failed`, `none_failed`, `all_skipped`, `one_done`, `none_skipped`) remain unchanged.

## Scheduling Default Changes

These affect **new DAGs** and DAGs without explicit parameters:

| Parameter | Airflow 2 Default | Airflow 3 Default | Impact |
|-----------|-------------------|-------------------|--------|
| `schedule` | `timedelta(days=1)` | `None` | DAGs without `schedule=` won't run automatically |
| `catchup` | `True` | `False` | No automatic backfill on deploy |
| Cron timetable | `CronDataIntervalTimetable` | `CronTriggerTimetable` | No data interval by default |

### Cron Timetable Behavior Change

**Airflow 2**: Cron strings created `CronDataIntervalTimetable` — runs have `data_interval_start` and `data_interval_end` defining a processing window.

**Airflow 3**: Cron strings create `CronTriggerTimetable` — point-in-time triggers where `logical_date = run_after`. No data interval.

```python
# If your DAG relies on data_interval_start/end with cron, explicitly use:
from airflow.timetables.interval import CronDataIntervalTimetable

@dag(schedule=CronDataIntervalTimetable("0 0 * * *"))  # Preserves Airflow 2 behavior
```

Or set globally: `AIRFLOW__SCHEDULER__CREATE_CRON_DATA_INTERVALS=True`

See [scheduling.md](scheduling.md) for full timetable documentation.

## Provider and Import Changes

### Providers Not Preinstalled

These providers are no longer bundled with Airflow 3 core — install explicitly if needed:

```bash
pip install apache-airflow-providers-ftp
pip install apache-airflow-providers-http
pip install apache-airflow-providers-imap
pip install apache-airflow-providers-standard  # PythonOperator, BashOperator
```

### Import Path Changes

```python
# Airflow 2
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator

# Airflow 3
from airflow.providers.standard.operators.python import PythonOperator
from airflow.providers.standard.operators.bash import BashOperator
```

### .airflowignore Syntax

Default changed from **regexp** to **glob** patterns:

```
# Airflow 2 (regexp)
test_.*\.py

# Airflow 3 (glob)
test_*.py
```

Configure syntax: `AIRFLOW__CORE__DAG_IGNORE_FILE_SYNTAX=regexp` to keep old behavior.

## Configuration Changes

Validate your Airflow configuration file before upgrading:

```bash
# Check for moved, renamed, and removed config options
airflow config lint

# Auto-apply fixes
airflow config update
```

Key configuration renames — `airflow config lint` will detect these automatically.

## Linting and Validation Tools

### Ruff AIR30 Rules

Ruff provides automated detection of Airflow 2→3 breaking changes in DAG code.

```toml
# ruff.toml
[lint]
preview = true
select = ["AIR30"]
```

```bash
# Scan for issues
ruff check dags/

# Auto-fix where possible
ruff check --fix dags/

# Or without config file
ruff check --preview --select AIR30 --fix dags/
```

**What AIR30 detects**: deprecated imports, removed parameters (`schedule_interval`, `timetable`), removed functions (`days_ago`), renamed context variables.

### airflow config lint

```bash
# Check Airflow configuration for Airflow 3 compatibility
airflow config lint
```

Detects: moved settings, renamed sections, removed options, invalid values.

## Migration Checklist

Step-by-step process for migrating a DAG file from Airflow 2 to 3:

1. **Ensure Airflow >= 2.6.3** — minimum version for upgrade path
2. **Run Ruff AIR30** on DAG code — fix all flagged issues
3. **Run `airflow config lint`** — fix configuration issues
4. **Update parameters** — `schedule_interval`→`schedule`, `fail_stop`→`fail_fast`
5. **Replace `days_ago()`** — use fixed `datetime()` or `pendulum`
6. **Replace SubDAGs** with task groups
7. **Update context variables** — `execution_date`→`logical_date`, remove `conf` from context
8. **Update trigger rules** — `dummy`→`always`, `none_failed_or_skipped`→`none_failed_min_one_success`
9. **Add explicit `schedule=`** — Airflow 3 defaults to `None` (manual only)
10. **Verify `catchup=`** — Airflow 3 defaults to `False`
11. **Check cron behavior** — use `CronDataIntervalTimetable` if you rely on data intervals
12. **Install missing providers** — FTP, HTTP, IMAP, standard now separate packages
13. **Update import paths** — operators moved to provider packages
14. **Test locally** with `dag.test()` or `astro dev start`
15. **Run full test suite** — DAG validation, unit tests, integration tests

## Migrating from Time-Driven to Asset-Aware Scheduling

Beyond API-level migration (Airflow 2→3), many teams want to modernize their **scheduling paradigm** — moving from time-based cron to asset-aware scheduling. This is a separate, incremental process. Not every DAG should be migrated; daily reports at fixed times or calendar-based cleanup jobs are fine on cron.

### Step 1: Identify Assets and Define Outlets (Zero Risk)

Inventory existing DAGs and ask: *what data does this DAG produce?* Add `outlets` to tasks that produce meaningful assets. This is a metadata-only change — nothing triggers differently yet.

```python
# Before: no asset awareness
@task()
def build_features():
    ...

# After: outlet added, no scheduling change
@task(outlets=[Asset("player_login_features")])
def build_features():
    ...
```

### Step 2: Map the Dependency Graph

Start from your most important asset and trace upstream. Document which DAGs produce and consume which assets. This reveals data lineage and often surfaces DAGs that should be split (one DAG producing three unrelated assets → three focused DAGs).

### Step 3: AssetOrTimeSchedule as Safety Net

Replace cron schedules with `AssetOrTimeSchedule` — your pipeline runs on both triggers. Start at leaf nodes and work upstream.

```python
from airflow.timetables.assets import AssetOrTimeSchedule
from airflow.timetables.trigger import CronTriggerTimetable

@dag(
    schedule=AssetOrTimeSchedule(
        timetable=CronTriggerTimetable("0 9 * * *", timezone="UTC"),
        assets=Asset("player_events"),
    ),
    catchup=False,
)
def my_pipeline():
    ...
```

If DAGs are idempotent (they should be), dual triggering is safe — the asset-triggered run may fail initially while you debug timing or context issues, but the cron run keeps production stable.

### Step 4: Flip the Switch

After observing successful asset-triggered runs for 1-2 weeks alongside cron runs, replace `AssetOrTimeSchedule` with pure asset-based scheduling:

```python
@dag(schedule=Asset("player_events"), catchup=False)
def my_pipeline():
    ...
```
