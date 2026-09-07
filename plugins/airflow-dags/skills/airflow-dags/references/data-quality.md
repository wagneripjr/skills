# Data Quality in Pipelines

## Contents
- [Quality Gate Pattern](#quality-gate-pattern)
- [Stopping vs Warning Checks](#stopping-vs-warning-checks)
- [SQL Check Operators](#sql-check-operators)
- [Complete Example: ETL with Data Quality Checks](#complete-example-etl-with-data-quality-checks)
- [Adding Quality Gates to Any Pattern](#adding-quality-gates-to-any-pattern)

## Quality Gate Pattern

Load data to a **temporary table** first, run quality checks, then swap to the permanent table only if checks pass. This prevents bad data from reaching production tables.

Pipeline flow:

```
extract → transform → load_to_temp → stopping_checks → swap_to_permanent → warning_checks
```

Three stages of validation:

1. **Stopping checks on temp table** — If failed, DAG stops. Bad data never reaches production.
2. **Stopping checks on permanent table** — After swap, verify the permanent table is consistent.
3. **Warning checks** — Run with `trigger_rule="all_done"`. Failures log alerts but don't block the pipeline.

## Stopping vs Warning Checks

| Check Type | On Failure | Use For |
|------------|-----------|---------|
| **Stopping** | Pipeline fails, bad data stays in temp | Null primary keys, row count = 0, duplicate records, schema violations, wrong data types |
| **Warning** | Pipeline continues, alert sent | Stale timestamps, outlier values (temp outside -10..50°C), unexpected nulls in optional fields, data freshness |

**Implementation**:
- **Stopping**: Place checks between load and swap. Default behavior — check failure = task failure = DAG stops.
- **Warning**: Place in a separate downstream `@task_group` with `trigger_rule="all_done"` on a sentinel task so the DAG continues regardless of check outcome.

## SQL Check Operators

Both operators inherit `conn_id` from `default_args`. Always set `default_args={"conn_id": "your_conn_id"}` at the DAG level.

### SQLTableCheckOperator

Validates table-level aggregate properties:

```python
from airflow.providers.common.sql.operators.sql import SQLTableCheckOperator

SQLTableCheckOperator(
    task_id="check_row_count",
    table="staging.orders",
    checks={
        "row_count_check": {"check_statement": "COUNT(*) > 0"},
        "no_duplicates": {"check_statement": "COUNT(*) = COUNT(DISTINCT order_id)"},
    },
    retry_on_failure="True",  # string, not boolean
)
```

Each entry in `checks` maps a check name to a dict with `"check_statement"` — an SQL aggregate expression that must evaluate to `True`.

### SQLColumnCheckOperator

Validates column-level constraints:

```python
from airflow.providers.common.sql.operators.sql import SQLColumnCheckOperator

SQLColumnCheckOperator(
    task_id="check_columns",
    table="staging.orders",
    column_mapping={
        "order_id": {
            "null_check": {"equal_to": 0},          # no nulls allowed
        },
        "amount": {
            "min": {"geq_to": 0},                    # amount >= 0
            "max": {"leq_to": 1_000_000},            # amount <= 1M
        },
        "month": {
            "min": {"geq_to": 1},
            "max": {"leq_to": 12},
        },
    },
    accept_none="True",  # string — allows NULLs in non-checked columns
    retry_on_failure="True",
)
```

Supported comparison operators: `geq_to` (>=), `leq_to` (<=), `gt` (>), `lt` (<), `equal_to` (=).

## Complete Example: ETL with Data Quality Checks

```python
"""ETL with data quality checks: API → Transform → Temp Table → Quality Gates → Permanent Table."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task, task_group
from airflow.models.baseoperator import chain
from airflow.providers.common.sql.operators.sql import (
    SQLColumnCheckOperator,
    SQLExecuteQueryOperator,
    SQLTableCheckOperator,
)
from airflow.providers.http.hooks.http import HttpHook
from airflow.providers.postgres.hooks.postgres import PostgresHook

_CONN_ID = "postgres_default"
_SCHEMA = "public"
_TMP_TABLE = "tmp_weather_data"
_PERM_TABLE = "model_weather_data"
_BACKUP_TABLE = "backup_weather_data"

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "execution_timeout": timedelta(minutes=30),
    "conn_id": _CONN_ID,  # inherited by all SQL check operators
}


@dag(
    dag_id="etl_with_quality_checks",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    max_active_runs=1,
    max_consecutive_failed_dag_runs=5,
    default_args=default_args,
    tags=["etl", "data-quality"],
    doc_md=__doc__,
)
def etl_with_quality_checks():

    @task()
    def extract(**context) -> dict:
        hook = HttpHook(http_conn_id="weather_api", method="GET")
        response = hook.run(endpoint="/forecast", data={"latitude": 46.95, "longitude": 7.45})
        return response.json()

    @task()
    def transform(api_response: dict, **context) -> list[dict]:
        hourly = api_response["hourly"]
        return [
            {"timestamp": t, "temp_c": temp, "humidity": hum}
            for t, temp, hum in zip(hourly["time"], hourly["temperature_2m"], hourly["relative_humidity_2m"])
        ]

    @task_group
    def load_and_validate(records):

        create_tmp = SQLExecuteQueryOperator(
            task_id="create_tmp_table",
            sql=f"""
                DROP TABLE IF EXISTS {_SCHEMA}.{_TMP_TABLE};
                CREATE TABLE {_SCHEMA}.{_TMP_TABLE} (
                    timestamp TIMESTAMPTZ NOT NULL,
                    temp_c NUMERIC,
                    humidity NUMERIC
                );
            """,
        )

        @task()
        def load_to_tmp(records: list[dict]) -> None:
            hook = PostgresHook(postgres_conn_id=_CONN_ID)
            hook.insert_rows(
                table=f"{_SCHEMA}.{_TMP_TABLE}",
                rows=[(r["timestamp"], r["temp_c"], r["humidity"]) for r in records],
                target_fields=["timestamp", "temp_c", "humidity"],
            )

        @task_group
        def stopping_checks_tmp():
            """Checks that BLOCK the pipeline if they fail."""
            SQLTableCheckOperator(
                task_id="row_count",
                table=f"{_SCHEMA}.{_TMP_TABLE}",
                checks={"has_rows": {"check_statement": "COUNT(*) > 0"}},
                retry_on_failure="True",
            )
            SQLColumnCheckOperator(
                task_id="column_ranges",
                table=f"{_SCHEMA}.{_TMP_TABLE}",
                column_mapping={
                    "timestamp": {"null_check": {"equal_to": 0}},
                },
                retry_on_failure="True",
            )

        swap = SQLExecuteQueryOperator(
            task_id="swap_to_permanent",
            sql=f"""
                DROP TABLE IF EXISTS {_SCHEMA}.{_BACKUP_TABLE};
                ALTER TABLE IF EXISTS {_SCHEMA}.{_PERM_TABLE} RENAME TO {_BACKUP_TABLE};
                ALTER TABLE {_SCHEMA}.{_TMP_TABLE} RENAME TO {_PERM_TABLE};
            """,
        )

        @task_group
        def stopping_checks_perm():
            """Verify permanent table after swap."""
            SQLTableCheckOperator(
                task_id="row_count",
                table=f"{_SCHEMA}.{_PERM_TABLE}",
                checks={"has_rows": {"check_statement": "COUNT(*) > 0"}},
                retry_on_failure="True",
            )

        drop_backup = SQLExecuteQueryOperator(
            task_id="drop_backup",
            sql=f"DROP TABLE IF EXISTS {_SCHEMA}.{_BACKUP_TABLE};",
        )

        _load = load_to_tmp(records)
        chain(create_tmp, _load, stopping_checks_tmp(), swap, stopping_checks_perm(), drop_backup)

    @task_group
    def warning_checks():
        """Checks that LOG warnings but do NOT block the pipeline."""
        SQLColumnCheckOperator(
            task_id="value_ranges",
            table=f"{_SCHEMA}.{_PERM_TABLE}",
            column_mapping={
                "temp_c": {"min": {"geq_to": -50}, "max": {"leq_to": 60}},
                "humidity": {"min": {"geq_to": 0}, "max": {"leq_to": 100}},
            },
            accept_none="True",
            retry_on_failure="True",
        )

        @task(trigger_rule="all_done")
        def checks_done():
            """Sentinel — runs regardless of check outcome so DAG completes."""
            return "Warning checks finished."

        checks_done()

    # Orchestrate
    data = extract()
    transformed = transform(data)
    validate_group = load_and_validate(transformed)
    validate_group >> warning_checks()


etl_with_quality_checks()

if __name__ == "__main__":
    etl_with_quality_checks().test()
```

**Key patterns**:
- **Temp-table-swap**: Load to temp → validate → rename to permanent. Bad data never reaches production.
- **Stopping checks**: `SQLTableCheckOperator` + `SQLColumnCheckOperator` inside `@task_group` between load and swap.
- **Warning checks**: Separate `@task_group` downstream with `trigger_rule="all_done"` sentinel task.
- **`conn_id` in default_args**: SQL check operators inherit connection — no need to repeat per operator.
- **Backup before swap**: `ALTER TABLE perm RENAME TO backup` before `ALTER TABLE tmp RENAME TO perm`.

## Adding Quality Gates to Any Pattern

Quality gates can be inserted into any of the 11 ETL/ELT patterns in [etl-elt-patterns.md](etl-elt-patterns.md). The insertion point is between load and any downstream consumers:

| Pattern | Where to Insert Quality Gate |
|---------|------------------------------|
| Pattern 1 (Classic ETL) | Between transform and load: load to temp, check, swap |
| Pattern 2 (ELT) | Between load_raw and transform: validate raw quality first |
| Pattern 3 (Incremental) | After load: validate partition row counts match source |
| Pattern 4 (Asset-oriented) | After asset produces data: check before marking asset complete |
| Pattern 5 (Dynamic) | After `.expand()` load tasks: fan-in check on merged data |
| Pattern 6 (Fan-in) | After join: validate joined dataset before final load |
| Pattern 7 (dbt) | Use `dbt test` — dbt handles quality natively |
| Pattern 8 (CDC) | After UPSERT: validate no duplicate keys, watermark advanced |
| Pattern 9 (Factory) | Add quality config per pipeline in YAML |
| Pattern 10 (ETLT) | Between Python transform and SQL transform |
| Pattern 11 (Asset-sequence) | Each asset DAG runs its own quality gate before marking complete |
