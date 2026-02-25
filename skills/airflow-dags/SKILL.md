---
name: writing-airflow-dags
description: Use when creating, debugging, or configuring Apache Airflow 3 DAGs — builds data pipelines with TaskFlow API or traditional operators, configures scheduling and asset-driven triggers, wires XCom data passing, sets up sensors and deferrable operators, generates dynamic task mappings, and structures multi-layer test suites. Triggers on DAG authoring, TaskFlow API, operators, sensors, scheduling, assets, dynamic tasks, XCom, or pipeline testing.
---

# Writing Airflow 3 DAGs

Airflow 3 DAGs are Python code that define data pipeline workflows. Every DAG must follow three principles: **atomicity** (each task does one thing), **idempotency** (same input = same output on rerun), and **modularity** (reusable functions and operators, DRY).

## Project Structure

```
project/
  dags/                    # One .py file per DAG, filename = dag_id
  include/                 # Support code (NOT parsed by scheduler)
    sql/
    python_functions/
    custom_operators/
    custom_hooks/
  tests/
    dag_validation/        # DagBag-based structural checks
    unit_tests/            # Custom code with mocked dependencies
    integration_tests/     # Real external systems, no mocking
  plugins/
    cluster_policies/      # Environment-level enforcement (@hookimpl)
```

## Quick Decision Guide

| Need | Approach | Reference |
|------|----------|-----------|
| Standard multi-task pipeline | TaskFlow API (`@dag`/`@task`) | [dag-authoring.md](reference/dag-authoring.md) |
| Single data producer task | Asset-oriented (`@asset`) | [dag-authoring.md](reference/dag-authoring.md) |
| Legacy code / specific operators | Traditional syntax (`DAG` class) | [dag-authoring.md](reference/dag-authoring.md) |
| Variable number of task copies | Dynamic Task Mapping (`.expand()`) | [dynamic-tasks.md](reference/dynamic-tasks.md) |
| 50+ similar DAGs from config | Dynamic DAGs (`dag-factory`) | [dynamic-tasks.md](reference/dynamic-tasks.md) |
| Time-based runs | Cron / timetables | [scheduling.md](reference/scheduling.md) |
| Data-driven runs | Assets | [scheduling.md](reference/scheduling.md) |
| External event triggers | AssetWatcher + triggers | [scheduling.md](reference/scheduling.md) |
| Conditional execution | Branching / trigger rules | [dependencies.md](reference/dependencies.md) |
| Pass data between tasks | XCom / custom backends | [data-passing.md](reference/data-passing.md) |
| External system integration | Operators / hooks / sensors | [operators.md](reference/operators.md) |
| Credentials / secrets | Connections / secrets backends | [connections.md](reference/connections.md) |
| ETL/ELT pipeline patterns | 11 practical DAG examples | [etl-elt-patterns.md](reference/etl-elt-patterns.md) |
| Data quality checks in pipelines | Quality gates with temp-table swap | [data-quality.md](reference/data-quality.md) |
| Testing DAGs | 5-layer testing strategy | [testing.md](reference/testing.md) |
| Production operations | Versioning, scaling, monitoring | [production.md](reference/production.md) |
| Migrating Airflow 2 DAGs to 3 | Breaking changes, Ruff AIR30 linting | [migration.md](reference/migration.md) |
| API-triggered processing (GenAI) | Inference execution pattern | [dag-authoring.md](reference/dag-authoring.md) |

## Critical Rules

These rules are non-negotiable. Violating any of them causes production failures.

### 1. NO Top-Level Code

DAG files are parsed by the scheduler every 30 seconds. Top-level code executes on EVERY parse.

```python
# BAD - executes every 30 seconds during parsing
config = requests.get("https://config-api/settings").json()  # API hammered
data = pd.read_csv("/data/input.csv")                        # I/O on every parse
now = datetime.now()                                          # Different every parse

# GOOD - executes only when task runs
@task()
def fetch_config():
    return requests.get("https://config-api/settings").json()
```

**Allowed at top level**: imports, constants, `@dag`/`@task` decorators, `datetime(2024, 1, 1)` literals.

### 2. Use Airflow Hooks, Not Raw Clients

Always use Airflow hooks (`S3Hook`, `HttpHook`, `PostgresHook`) instead of raw clients (`boto3`, `requests`). Hooks use Airflow connections for credential management.

```python
# BAD - hardcoded/env credentials, no connection management
import boto3
s3 = boto3.client("s3")

# GOOD - credentials from Airflow connection
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
hook = S3Hook(aws_conn_id="aws_default")
```

### 3. Credentials at Task Time Only

Never fetch credentials during DAG definition. Use Airflow connections or secrets backends.

### 4. Each Task = One Atomic Unit

One task does one thing: extract OR transform OR load. Never combine. This enables partial reruns and clear observability.

### 5. Idempotent Tasks

Same input must produce same output. Use partitioning with Airflow context variables (`{{ ds }}`, `{{ data_interval_start }}`). Overwrite output, never append.

### 6. Always Set Retries

```python
default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
}
```

### 7. Always Set Execution Timeout

```python
@task(execution_timeout=timedelta(minutes=30))
def my_task():
    ...
```

### 8. Use Deferrable Operators for Long Waits

For tasks waiting >1 minute on external systems, use deferrable operators to release worker slots.

```python
# Set globally: AIRFLOW__OPERATORS__DEFAULT_DEFERRABLE=True
# Or per-sensor: mode="reschedule" for sensors with long waits
```

### 9. One DAG Per File

Filename should match `dag_id`. All support code goes in `include/`.

## TaskFlow DAG Template

Complete example applying all critical rules:

```python
"""ETL pipeline: API -> Transform -> S3."""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.providers.http.hooks.http import HttpHook

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "execution_timeout": timedelta(minutes=30),
}


@dag(
    dag_id="api_to_s3_etl",
    start_date=datetime(2024, 1, 1),
    schedule="@hourly",
    catchup=False,
    max_active_runs=1,
    max_consecutive_failed_dag_runs=5,
    default_args=default_args,
    tags=["etl", "api"],
    doc_md=__doc__,
)
def api_to_s3_etl():

    @task()
    def extract(**context) -> list[dict]:
        hook = HttpHook(http_conn_id="api_default", method="GET")
        response = hook.run(endpoint="/data")
        return response.json()

    @task()
    def transform(records: list[dict]) -> list[dict]:
        return [r for r in records if r.get("status") == "active"]

    @task()
    def load(records: list[dict], **context) -> None:
        ds = context["ds"]
        hook = S3Hook(aws_conn_id="aws_default")
        hook.load_string(
            string_data=json.dumps(records),
            key=f"hourly/{ds}/data.json",
            bucket_name="my-data-lake",
            replace=True,
        )

    data = extract()
    filtered = transform(data)
    load(filtered)


api_to_s3_etl()

if __name__ == "__main__":
    api_to_s3_etl().test()
```

Key patterns in this template:
- `@dag`/`@task` decorators (TaskFlow API) — not `with DAG()` context manager
- Hooks for external systems (`HttpHook`, `S3Hook`) — not raw `requests`/`boto3`
- Partitioned S3 key using `{{ ds }}` context — idempotent
- `default_args` with retries, backoff, timeout
- `max_consecutive_failed_dag_runs=5` — auto-pauses DAG after 5 consecutive failures
- `if __name__` block for `dag.test()` development testing
- `doc_md` for UI documentation
- No top-level computation

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `datetime.now()` as `start_date` | Use fixed date: `datetime(2024, 1, 1)` |
| `requests.get()` in task | Use `HttpHook(http_conn_id="...")` |
| `boto3.client("s3")` in task | Use `S3Hook(aws_conn_id="...")` |
| API call at top level | Move inside `@task` function |
| No retries configured | Set `retries` + `retry_delay` in `default_args` |
| No execution timeout | Set `execution_timeout` per task or in `default_args` |
| Catching all exceptions | Let tasks fail — Airflow handles retries |
| Large data in XCom | Use custom XCom backend (S3/GCS) — see [data-passing.md](reference/data-passing.md) |
| Local filesystem for staging | Use cloud storage (S3/GCS) — tasks may run on different workers |
| Testing official providers | Only test YOUR custom code — see [testing.md](reference/testing.md) |
| `pd.Timestamp.now()` in transforms | Pass timestamp from Airflow context for determinism |
| Missing `dag.test()` block | Add `if __name__: dag.test()` for IDE debugging |
| Mixing `with DAG()` + `@task` | Use `@dag` decorator consistently with `@task` |
| Operator inside `@asset`/`@task` body | Use operator as standalone task; connect via `outlets` |
| No data quality checks | Use temp-table + quality gates — see [data-quality.md](reference/data-quality.md) |
| Using `schedule_interval=` | Renamed to `schedule=` in Airflow 3 — see [migration.md](reference/migration.md) |
| Expecting daily schedule by default | Airflow 3 defaults to `schedule=None` (manual only) — set explicitly |
| Using `execution_date` in templates | Use `logical_date` — `execution_date` removed in Airflow 3 |

## Reference Files

Deep-dive documentation organized by topic. Claude loads these on-demand:

- **[DAG Authoring](reference/dag-authoring.md)** — TaskFlow API, Traditional syntax, Asset-oriented approach, when to use each
- **[Scheduling](reference/scheduling.md)** — Cron, assets, event-driven, timetables, catchup, backfill
- **[Dependencies](reference/dependencies.md)** — chain(), >>, trigger rules, branching, task groups
- **[Dynamic Tasks](reference/dynamic-tasks.md)** — .expand(), .partial(), dynamic task groups, dag-factory
- **[Data Passing](reference/data-passing.md)** — XCom, custom backends, Object Storage backend
- **[Operators](reference/operators.md)** — Operators, sensors, deferrable operators, hooks, providers
- **[Connections](reference/connections.md)** — Connection types, secrets backends, env vars
- **[ETL/ELT Patterns](reference/etl-elt-patterns.md)** — 11 practical DAG examples: classic ETL, ELT, incremental, asset-oriented, dynamic, fan-in, dbt, CDC, factory, ETLT hybrid, asset-sequence
- **[Data Quality](reference/data-quality.md)** — Quality gates, temp-table swap, SQLTableCheckOperator, stopping vs warning checks
- **[Testing](reference/testing.md)** — 5-layer testing: dag.test(), validation, unit, integration, policies
- **[Production](reference/production.md)** — DAG versioning, bundles, scaling, callbacks, debugging
- **[Migration](reference/migration.md)** — Airflow 2→3 breaking changes, parameter renames, Ruff AIR30 linting
