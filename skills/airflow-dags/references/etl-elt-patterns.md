# ETL/ELT Patterns with Apache Airflow 3

## Contents
- [ETL vs ELT](#etl-vs-elt)
- [Pattern 1: Classic ETL — API to Data Warehouse](#pattern-1-classic-etl--api-to-data-warehouse)
- [Pattern 2: ELT — Load Raw then Transform in Warehouse](#pattern-2-elt--load-raw-then-transform-in-warehouse)
- [Pattern 3: Incremental ETL with Partitioning](#pattern-3-incremental-etl-with-partitioning)
- [Pattern 4: Asset-Oriented Data Pipeline](#pattern-4-asset-oriented-data-pipeline)
- [Pattern 5: Dynamic ETL — One Task Per File](#pattern-5-dynamic-etl--one-task-per-file)
- [Pattern 6: Multi-Source Fan-In ETL](#pattern-6-multi-source-fan-in-etl)
- [Pattern 7: ELT with dbt Integration](#pattern-7-elt-with-dbt-integration)
- [Pattern 8: CDC (Change Data Capture) Pipeline](#pattern-8-cdc-change-data-capture-pipeline)
- [Pattern 9: Factory-Generated ETL from Config](#pattern-9-factory-generated-etl-from-config)
- [Pattern 10: ETLT Hybrid — Python + SQL Transforms](#pattern-10-etlt-hybrid--python--sql-transforms)
- [Pattern 11: Asset-Sequence ETL — Multi-DAG Pipeline](#pattern-11-asset-sequence-etl--multi-dag-pipeline)

## ETL vs ELT

| Aspect | ETL (Extract-Transform-Load) | ELT (Extract-Load-Transform) |
|--------|------------------------------|------------------------------|
| Transform location | In Airflow (Python/Spark) | In target system (SQL/dbt) |
| When to use | Complex Python transformations, API data, ML pipelines | SQL-heavy transformations, modern data warehouses |
| Airflow's role | Orchestrate all steps | Orchestrate extract+load, trigger transform |
| Scalability | Limited by worker resources | Leverages warehouse compute |
| Complexity | More Airflow code | Less Airflow code, more SQL |

**Rule of thumb**: If your warehouse supports it (Snowflake, BigQuery, Redshift), prefer ELT. Airflow is an orchestrator, not a data processor — offload heavy computation to external systems.

### First Decision: XCom or External Storage?

Before choosing a pattern, decide how data flows between tasks:

| Data Characteristic | Use XCom | Use External Storage (S3/GCS) |
|---------------------|----------|-------------------------------|
| Small metadata (IDs, counts, paths) | Yes | Overkill |
| Medium JSON (< 1 MB) | Yes (or Object Storage backend) | Also fine |
| Large datasets (> 1 MB) | No — degrades metadata DB | Yes — pass file path via XCom |
| Binary files (images, Parquet) | No | Yes |
| Cross-DAG data passing | Possible but fragile | Yes — assets + S3 paths |

See [data-passing.md](data-passing.md) for XCom backend configuration. Patterns below note their data-passing approach.

For **data quality gates** (temp-table swap, stopping/warning checks), see [data-quality.md](data-quality.md) — applies to any pattern.

## Pattern 1: Classic ETL — API to Data Warehouse

Extract from REST API, transform in Python, load to database. Follows the same structure as the [SKILL.md template](../SKILL.md#taskflow-dag-template), adapted for PostgreSQL.

```python
"""ETL: REST API → Python Transform → PostgreSQL."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.http.hooks.http import HttpHook
from airflow.providers.postgres.hooks.postgres import PostgresHook

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "execution_timeout": timedelta(minutes=30),
}


@dag(
    dag_id="etl_api_to_postgres",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    max_active_runs=1,
    default_args=default_args,
    tags=["etl", "api", "postgres"],
    doc_md=__doc__,
)
def etl_api_to_postgres():

    @task()
    def extract(**context) -> list[dict]:
        hook = HttpHook(http_conn_id="api_default", method="GET")
        return hook.run(endpoint=f"/records?date={context['ds']}").json()

    @task()
    def transform(records: list[dict]) -> list[dict]:
        """Pure function — no I/O, no side effects."""
        return [
            {"id": r["id"], "name": r["name"].strip().title(),
             "amount": round(float(r["amount"]), 2), "is_valid": r.get("amount", 0) > 0}
            for r in records
        ]

    @task()
    def load(records: list[dict], **context) -> None:
        """Idempotent via DELETE+INSERT on date partition."""
        ds = context["ds"]
        hook = PostgresHook(postgres_conn_id="warehouse_default")
        hook.run(f"DELETE FROM staging.records WHERE date = '{ds}'")
        hook.insert_rows(
            table="staging.records",
            rows=[(r["id"], r["name"], r["amount"], r["is_valid"], ds) for r in records],
            target_fields=["id", "name", "amount", "is_valid", "date"],
        )

    data = extract()
    load(transform(data))


etl_api_to_postgres()

if __name__ == "__main__":
    etl_api_to_postgres().test()
```

**Key patterns**: Hooks for all I/O, partitioned DELETE+INSERT for idempotency, pure transform function, `ds` context for date partitioning.

## Pattern 2: ELT — Load Raw then Transform in Warehouse

Load raw data first, then run SQL transformations inside the data warehouse.

```python
"""ELT: S3 Raw → Snowflake Load → SQL Transform."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "execution_timeout": timedelta(minutes=60),
}


@dag(
    dag_id="elt_s3_to_snowflake",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args=default_args,
    tags=["elt", "snowflake"],
    doc_md=__doc__,
)
def elt_s3_to_snowflake():

    @task()
    def extract_and_load(**context) -> str:
        """Copy raw data from S3 to Snowflake raw layer."""
        ds = context["ds"]
        # Snowflake COPY INTO is the most efficient bulk load method
        return f"s3://data-lake/raw/events/{ds}/"

    load_raw = SQLExecuteQueryOperator(
        task_id="load_raw_to_snowflake",
        conn_id="snowflake_default",
        sql="""
            COPY INTO raw.events
            FROM @my_s3_stage/events/{{ ds }}/
            FILE_FORMAT = (TYPE = 'PARQUET')
            MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
            ON_ERROR = 'SKIP_FILE';
        """,
    )

    transform_staging = SQLExecuteQueryOperator(
        task_id="transform_to_staging",
        conn_id="snowflake_default",
        sql="""
            INSERT OVERWRITE INTO staging.events
            SELECT
                event_id,
                user_id,
                LOWER(event_type) AS event_type,
                event_timestamp,
                PARSE_JSON(properties) AS properties,
                '{{ ds }}' AS load_date
            FROM raw.events
            WHERE load_date = '{{ ds }}';
        """,
    )

    transform_mart = SQLExecuteQueryOperator(
        task_id="transform_to_mart",
        conn_id="snowflake_default",
        sql="""
            MERGE INTO mart.daily_user_events AS target
            USING (
                SELECT
                    user_id,
                    event_type,
                    COUNT(*) AS event_count,
                    MIN(event_timestamp) AS first_event,
                    MAX(event_timestamp) AS last_event
                FROM staging.events
                WHERE load_date = '{{ ds }}'
                GROUP BY user_id, event_type
            ) AS source
            ON target.user_id = source.user_id
               AND target.event_type = source.event_type
               AND target.event_date = '{{ ds }}'
            WHEN MATCHED THEN UPDATE SET
                event_count = source.event_count,
                first_event = source.first_event,
                last_event = source.last_event
            WHEN NOT MATCHED THEN INSERT VALUES (
                source.user_id, source.event_type, source.event_count,
                source.first_event, source.last_event, '{{ ds }}'
            );
        """,
    )

    load_raw >> transform_staging >> transform_mart


elt_s3_to_snowflake()

if __name__ == "__main__":
    elt_s3_to_snowflake().test()
```

**Key patterns**: Raw layer loaded first (preserves original data), SQL transforms leverage warehouse compute, `INSERT OVERWRITE` for idempotency, `MERGE` for slowly changing dimensions, Jinja `{{ ds }}` for date partitioning.

## Pattern 3: Incremental ETL with Partitioning

Process only new/changed data using time-windowed partitions.

```python
"""Incremental ETL: Process only data within the current interval."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.amazon.aws.hooks.s3 import S3Hook

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "execution_timeout": timedelta(minutes=30),
}


@dag(
    dag_id="incremental_etl",
    start_date=datetime(2024, 1, 1),
    schedule="@hourly",
    catchup=True,  # Enable to backfill historical data
    max_active_runs=3,
    default_args=default_args,
    tags=["etl", "incremental"],
    doc_md=__doc__,
)
def incremental_etl():

    @task()
    def extract_window(**context) -> list[dict]:
        """Extract only records within the current data interval."""
        start = context["data_interval_start"].isoformat()
        end = context["data_interval_end"].isoformat()

        hook = PostgresHook(postgres_conn_id="source_db")
        records = hook.get_records(
            sql="""
                SELECT id, name, amount, updated_at
                FROM source.transactions
                WHERE updated_at >= %s AND updated_at < %s
            """,
            parameters=(start, end),
        )
        return [
            {"id": r[0], "name": r[1], "amount": r[2], "updated_at": str(r[3])}
            for r in records
        ]

    @task()
    def transform(records: list[dict]) -> list[dict]:
        """Apply business rules to the windowed batch."""
        return [
            {**r, "amount_usd": round(r["amount"] * 1.0, 2), "is_large": r["amount"] > 10000}
            for r in records
        ]

    @task()
    def load(records: list[dict], **context) -> None:
        """Load partition to S3 — idempotent via path partitioning."""
        import json

        ds = context["ds"]
        hour = context["logical_date"].strftime("%H")

        hook = S3Hook(aws_conn_id="aws_default")
        hook.load_string(
            string_data="\n".join(json.dumps(r) for r in records),
            key=f"warehouse/transactions/dt={ds}/hour={hour}/data.jsonl",
            bucket_name="data-lake",
            replace=True,  # Overwrite = idempotent
        )

    raw = extract_window()
    cleaned = transform(raw)
    load(cleaned)


incremental_etl()

if __name__ == "__main__":
    incremental_etl().test()
```

**Key patterns**: `data_interval_start/end` for windowed extraction, `catchup=True` for historical backfill, Hive-style partitioning (`dt=YYYY-MM-DD/hour=HH`), `replace=True` for idempotency.

## Pattern 4: Asset-Oriented Data Pipeline

Airflow 3's `@asset` decorator — minimal boilerplate, data-driven scheduling.

```python
"""Asset-oriented pipeline: raw → clean → aggregated."""
from __future__ import annotations

from datetime import datetime

from airflow.sdk import Asset, asset
from airflow.decorators import dag, task
from airflow.providers.postgres.hooks.postgres import PostgresHook

# Define assets
raw_orders = Asset("s3://data-lake/raw/orders")
clean_orders = Asset("s3://data-lake/clean/orders")
daily_summary = Asset("s3://data-lake/mart/daily_summary")


# Producer 1: Extract raw orders (scheduled)
@asset(uri="s3://data-lake/raw/orders", schedule="@hourly")
def raw_orders_asset(self, context):
    """Extract raw orders from source database."""
    hook = PostgresHook(postgres_conn_id="source_db")
    ds = context["ds"]
    records = hook.get_records(f"SELECT * FROM orders WHERE date = '{ds}'")
    # Write to S3 at self.uri
    return records


# Producer 2: Clean orders (triggered by raw_orders)
@asset(uri="s3://data-lake/clean/orders", schedule=[raw_orders])
def clean_orders_asset(self, context):
    """Clean and validate orders — triggered when raw data lands."""
    # Read from raw, clean, write to self.uri
    pass


# Consumer: Aggregate (triggered by clean_orders)
@dag(
    dag_id="daily_summary",
    schedule=[clean_orders],
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["mart", "aggregation"],
)
def daily_summary_dag():

    @task(outlets=[daily_summary])
    def aggregate(**context):
        """Build daily summary — marks daily_summary asset as updated."""
        pass

    aggregate()


daily_summary_dag()
```

**Key patterns**: `@asset` for single-producer tasks, `schedule=[Asset(...)]` for data-driven triggers, chain of assets creates implicit pipeline, no cron scheduling for downstream — runs when data is ready.

### Cross-DAG Data Passing with Assets

When assets span multiple DAGs, use **Metadata** to attach context and **cross-DAG XCom** to pull data from upstream producers:

```python
from airflow.sdk import Asset, Metadata

# Producer: attach metadata to asset events
@asset(uri="s3://data-lake/clean/orders", schedule=[Asset("s3://data-lake/raw/orders")])
def clean_orders_asset(self, context):
    """Emit metadata so consumers know what changed."""
    row_count = process_and_load()
    yield Metadata(Asset("s3://data-lake/clean/orders"), {"row_count": row_count, "schema_version": "2.1"})


# Consumer: read metadata from triggering asset event
@dag(schedule=[Asset("s3://data-lake/clean/orders")], ...)
def downstream_dag():

    @task()
    def consume(**context):
        # Read metadata attached by producer
        events = context["triggering_asset_events"]
        metadata = events[Asset("s3://data-lake/clean/orders")][0].extra
        row_count = metadata["row_count"]

        # Pull XCom from a different DAG's task
        upstream_data = context["ti"].xcom_pull(
            dag_id="clean_orders_asset", task_ids="clean_orders_asset", key="return_value",
            include_prior_dates=True,
        )
        return upstream_data
```

**When to use Metadata vs XCom for cross-DAG data**: Metadata for small context (row counts, schema versions, timestamps). XCom for actual data — but prefer external storage (S3 paths) for anything > 1 MB.

## Pattern 5: Dynamic ETL — One Task Per File

Process a variable number of files discovered at runtime.

```python
"""Dynamic ETL: Process all files in S3 prefix."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook

default_args = {
    "retries": 2,
    "retry_delay": timedelta(minutes=1),
    "execution_timeout": timedelta(minutes=15),
}


@dag(
    dag_id="dynamic_file_etl",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args=default_args,
    tags=["etl", "dynamic", "s3"],
    doc_md=__doc__,
)
def dynamic_file_etl():

    @task()
    def list_files(**context) -> list[str]:
        """Discover files in today's S3 prefix."""
        ds = context["ds"]
        hook = S3Hook(aws_conn_id="aws_default")
        keys = hook.list_keys(
            bucket_name="incoming-data",
            prefix=f"uploads/{ds}/",
        )
        return keys or []

    @task(map_index_template="{{ file_key }}")
    def process_file(file_key: str, **context) -> dict:
        """Process a single file — mapped dynamically."""
        hook = S3Hook(aws_conn_id="aws_default")
        content = hook.read_key(key=file_key, bucket_name="incoming-data")

        # Transform
        import json
        records = json.loads(content)
        valid = [r for r in records if r.get("id") is not None]

        # Write processed file
        ds = context["ds"]
        output_key = f"processed/{ds}/{file_key.split('/')[-1]}"
        hook.load_string(
            string_data=json.dumps(valid),
            key=output_key,
            bucket_name="processed-data",
            replace=True,
        )
        return {"file": file_key, "input_count": len(records), "output_count": len(valid)}

    @task()
    def summarize(results: list[dict]) -> None:
        """Log processing summary."""
        total_in = sum(r["input_count"] for r in results)
        total_out = sum(r["output_count"] for r in results)
        print(f"Processed {len(results)} files: {total_in} records in, {total_out} valid out")

    files = list_files()
    processed = process_file.expand(file_key=files)  # One task per file
    summarize(processed)


dynamic_file_etl()

if __name__ == "__main__":
    dynamic_file_etl().test()
```

**Key patterns**: `.expand()` creates one task instance per file, `map_index_template` for readable UI, upstream `list_files()` determines count at runtime, `summarize` receives list of all results.

## Pattern 6: Multi-Source Fan-In ETL

Extract from multiple sources in parallel, join, then load.

```python
"""Multi-source ETL: Parallel extraction → Join → Load."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task, task_group
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.http.hooks.http import HttpHook

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "execution_timeout": timedelta(minutes=30),
}


@dag(
    dag_id="multi_source_fan_in",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args=default_args,
    tags=["etl", "multi-source"],
    doc_md=__doc__,
)
def multi_source_fan_in():

    @task_group(group_id="extract_sources")
    def extract_all():
        @task()
        def extract_orders(**ctx) -> list[dict]:
            hook = PostgresHook(postgres_conn_id="orders_db")
            records = hook.get_records(
                "SELECT order_id, customer_id, amount FROM orders WHERE date = %s",
                parameters=(ctx["ds"],),
            )
            return [{"order_id": r[0], "customer_id": r[1], "amount": r[2]} for r in records]

        @task()
        def extract_customers(**ctx) -> list[dict]:
            hook = PostgresHook(postgres_conn_id="crm_db")
            records = hook.get_records("SELECT id, name, tier FROM customers")
            return [{"id": r[0], "name": r[1], "tier": r[2]} for r in records]

        return {"orders": extract_orders(), "customers": extract_customers()}

    @task()
    def join_and_transform(sources: dict) -> list[dict]:
        """Join all sources — pure function, no I/O."""
        orders = sources["orders"]
        customers = {c["id"]: c for c in sources["customers"]}
        return [
            {
                "order_id": o["order_id"],
                "customer_name": customers.get(o["customer_id"], {}).get("name", "Unknown"),
                "customer_tier": customers.get(o["customer_id"], {}).get("tier", "standard"),
                "amount": o["amount"],
            }
            for o in orders
        ]

    @task()
    def load(records: list[dict], **context) -> None:
        hook = PostgresHook(postgres_conn_id="warehouse_default")
        ds = context["ds"]
        hook.run(f"DELETE FROM mart.enriched_orders WHERE date = '{ds}'")
        hook.insert_rows(
            table="mart.enriched_orders",
            rows=[(r["order_id"], r["customer_name"], r["customer_tier"],
                   r["amount"], ds) for r in records],
            target_fields=["order_id", "customer_name", "customer_tier",
                          "amount", "date"],
        )

    sources = extract_all()
    joined = join_and_transform(sources)
    load(joined)


multi_source_fan_in()

if __name__ == "__main__":
    multi_source_fan_in().test()
```

**Key patterns**: `@task_group` organizes parallel extractions visually, tasks within group run in parallel by default, group returns dict of outputs, join is a pure function with no I/O.

## Pattern 7: ELT with dbt Integration

Airflow orchestrates extract+load, dbt handles SQL transformations.

```python
"""ELT with dbt: Airflow extracts & loads, dbt transforms."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "execution_timeout": timedelta(minutes=60),
}


@dag(
    dag_id="elt_with_dbt",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args=default_args,
    tags=["elt", "dbt"],
    doc_md=__doc__,
)
def elt_with_dbt():

    @task()
    def extract_to_s3(**context) -> str:
        """Extract source data and stage in S3."""
        from airflow.providers.postgres.hooks.postgres import PostgresHook
        import json

        ds = context["ds"]
        source_hook = PostgresHook(postgres_conn_id="source_db")
        records = source_hook.get_records(
            "SELECT * FROM source.events WHERE date = %s", parameters=(ds,)
        )

        s3_hook = S3Hook(aws_conn_id="aws_default")
        s3_hook.load_string(
            string_data="\n".join(json.dumps({"col": list(r)}) for r in records),
            key=f"staging/events/{ds}/data.jsonl",
            bucket_name="data-lake",
            replace=True,
        )
        return f"s3://data-lake/staging/events/{ds}/"

    load_to_warehouse = SQLExecuteQueryOperator(
        task_id="load_to_raw",
        conn_id="snowflake_default",
        sql="""
            COPY INTO raw.events
            FROM @s3_stage/staging/events/{{ ds }}/
            FILE_FORMAT = (TYPE = 'JSON')
            ON_ERROR = 'SKIP_FILE';
        """,
    )

    # dbt handles all transformations via BashOperator
    @task.bash()
    def dbt_run(**context) -> str:
        ds = context["ds"]
        return f"cd /opt/airflow/dbt && dbt run --select staging mart --vars '{{\"run_date\": \"{ds}\"}}'"

    @task.bash()
    def dbt_test() -> str:
        return "cd /opt/airflow/dbt && dbt test --select staging mart"

    staged = extract_to_s3()
    staged >> load_to_warehouse >> dbt_run() >> dbt_test()


elt_with_dbt()

if __name__ == "__main__":
    elt_with_dbt().test()
```

**Key patterns**: Airflow handles orchestration only (extract, load, trigger dbt), dbt handles SQL transformations and testing, `@task.bash()` for dbt CLI commands, separation of concerns (Airflow = when, dbt = what).

## Pattern 8: CDC (Change Data Capture) Pipeline

Process only changed records using event-driven scheduling.

```python
"""CDC Pipeline: Process database changes via Kafka events."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.sdk import Asset, AssetWatcher
from airflow.decorators import dag, task
from airflow.providers.postgres.hooks.postgres import PostgresHook

# Event-driven: trigger on Kafka CDC events
# Requires: apache-airflow-providers-apache-kafka, apache-airflow-providers-common-messaging
# cdc_event = Asset(
#     "kafka://cdc-events",
#     watchers=[AssetWatcher(trigger=MessageQueueTrigger(
#         kafka_config_id="kafka_default",
#         topics=["cdc.source.customers"],
#     ))],
# )

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=1),
    "execution_timeout": timedelta(minutes=15),
}


@dag(
    dag_id="cdc_pipeline",
    start_date=datetime(2024, 1, 1),
    schedule="*/5 * * * *",  # Every 5 minutes (or use asset-driven schedule above)
    catchup=False,
    max_active_runs=1,  # Prevent overlapping CDC runs
    default_args=default_args,
    tags=["cdc", "streaming"],
    doc_md=__doc__,
)
def cdc_pipeline():

    @task()
    def fetch_changes(**context) -> list[dict]:
        """Fetch records changed since last successful run."""
        hook = PostgresHook(postgres_conn_id="source_db")

        # Use a watermark table to track last processed timestamp
        last_ts = hook.get_first(
            "SELECT last_processed_at FROM cdc_watermarks WHERE table_name = 'customers'"
        )
        last_processed = last_ts[0] if last_ts else "1970-01-01T00:00:00"

        records = hook.get_records(
            """
            SELECT id, name, email, updated_at, operation
            FROM customers_changelog
            WHERE updated_at > %s
            ORDER BY updated_at
            LIMIT 10000
            """,
            parameters=(last_processed,),
        )
        return [
            {"id": r[0], "name": r[1], "email": r[2], "updated_at": str(r[3]), "op": r[4]}
            for r in records
        ]

    @task()
    def apply_changes(changes: list[dict]) -> dict:
        """Apply CDC operations to target — UPSERT for inserts/updates, soft delete for deletes."""
        if not changes:
            return {"applied": 0, "last_ts": None}

        hook = PostgresHook(postgres_conn_id="warehouse_default")
        for change in changes:
            if change["op"] in ("INSERT", "UPDATE"):
                hook.run("""
                    INSERT INTO warehouse.customers (id, name, email, updated_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, updated_at=EXCLUDED.updated_at
                """, parameters=(change["id"], change["name"], change["email"], change["updated_at"]))
            elif change["op"] == "DELETE":
                hook.run("UPDATE warehouse.customers SET deleted_at = NOW() WHERE id = %s", parameters=(change["id"],))

        last_ts = changes[-1]["updated_at"]
        hook.run("""
            INSERT INTO cdc_watermarks (table_name, last_processed_at) VALUES ('customers', %s)
            ON CONFLICT (table_name) DO UPDATE SET last_processed_at = EXCLUDED.last_processed_at
        """, parameters=(last_ts,))
        return {"applied": len(changes), "last_ts": last_ts}

    @task()
    def log_result(result: dict) -> None:
        if result["applied"] == 0:
            print("No changes to process")
        else:
            print(f"Applied {result['applied']} changes up to {result['last_ts']}")

    changes = fetch_changes()
    result = apply_changes(changes)
    log_result(result)


cdc_pipeline()

if __name__ == "__main__":
    cdc_pipeline().test()
```

**Key patterns**: Watermark-based tracking for idempotent reprocessing, `max_active_runs=1` prevents overlapping CDC runs, soft deletes (`deleted_at`) instead of hard deletes, UPSERT (`ON CONFLICT DO UPDATE`) for idempotent apply, ordered processing (`ORDER BY updated_at`).

## Pattern 9: Factory-Generated ETL from Config

Generate 50+ similar DAGs from YAML configuration using dag-factory.

### Config File

`config/etl_pipelines.yaml`:
```yaml
etl_users_daily:
  schedule: "0 6 * * *"
  tags: [etl, users, daily]
  default_args:
    owner: team-identity
    start_date: "2024-01-01"
    retries: 3
    retry_delay_sec: 120
    execution_timeout_secs: 1800
  tasks:
    extract:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: extract
      python_callable_file: /opt/airflow/include/etl/users.py
    transform:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: transform
      python_callable_file: /opt/airflow/include/etl/users.py
      dependencies: [extract]
    load:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: load
      python_callable_file: /opt/airflow/include/etl/users.py
      dependencies: [transform]

# Add more pipelines: one YAML block + one function module per domain
# etl_orders_hourly:
#   schedule: "@hourly"
#   tags: [etl, orders, hourly]
#   ...
```

### DAG File

```python
"""Factory-generated ETL pipelines from YAML config."""
from airflow import DAG
import dagfactory

config_path = "/opt/airflow/config/etl_pipelines.yaml"
dag_factory = dagfactory.DagFactory(config_path)
dag_factory.clean_dags(globals())
dag_factory.generate_dags(globals())
```

### Function Modules

`include/etl/users.py` — each function module contains extract/transform/load for one domain:
```python
"""ETL functions for users pipeline."""
from airflow.providers.postgres.hooks.postgres import PostgresHook


def extract(**context):
    ds = context["ds"]
    hook = PostgresHook(postgres_conn_id="source_db")
    records = hook.get_records(
        "SELECT * FROM source.users WHERE updated_at::date = %s", parameters=(ds,),
    )
    context["ti"].xcom_push(key="records", value=records)


def transform(**context):
    records = context["ti"].xcom_pull(task_ids="extract", key="records")
    context["ti"].xcom_push(key="records", value=[
        {"id": r[0], "name": r[1].strip().title(), "active": r[2]} for r in records
    ])


def load(**context):
    records = context["ti"].xcom_pull(task_ids="transform", key="records")
    ds = context["ds"]
    hook = PostgresHook(postgres_conn_id="warehouse_default")
    hook.run(f"DELETE FROM warehouse.users WHERE load_date = '{ds}'")
    hook.insert_rows(
        table="warehouse.users",
        rows=[(r["id"], r["name"], r["active"], ds) for r in records],
        target_fields=["id", "name", "active", "load_date"],
    )
```

**Key patterns**: dag-factory generates DAGs from YAML (no Python per pipeline), function modules contain business logic (one per domain), adding pipeline 51 = add YAML block + function module, different schedules/owners/retry configs per pipeline.

## Pattern 10: ETLT Hybrid — Python + SQL Transforms

In-flight Python transforms for API normalization, then in-database SQL transforms for aggregation. Combines strengths of ETL (Python flexibility for schema normalization) and ELT (warehouse compute for heavy aggregation).

```python
"""ETLT: API → Python Clean → S3 → Load Raw → SQL Aggregate."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.providers.http.hooks.http import HttpHook

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,
    "execution_timeout": timedelta(minutes=30),
}


@dag(
    dag_id="etlt_hybrid",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    max_active_runs=1,
    max_consecutive_failed_dag_runs=5,
    default_args=default_args,
    tags=["etlt", "hybrid"],
    doc_md=__doc__,
)
def etlt_hybrid():

    @task()
    def extract(**context) -> dict:
        """Extract from API."""
        hook = HttpHook(http_conn_id="weather_api", method="GET")
        response = hook.run(endpoint="/forecast", data={"latitude": 46.95, "longitude": 7.45})
        return response.json()

    @task()
    def transform_in_flight(api_response: dict) -> list[dict]:
        """Python transform: normalize schema, derive fields, coerce types."""
        hourly = api_response["hourly"]
        return [
            {
                "timestamp": t,
                "temp_c": round(float(temp), 1),
                "humidity_pct": int(hum),
                "date": t[:10],
                "month": int(t[5:7]),
            }
            for t, temp, hum in zip(hourly["time"], hourly["temperature_2m"], hourly["relative_humidity_2m"])
        ]

    @task()
    def load_to_warehouse(records: list[dict], **context) -> None:
        """Load cleaned data to warehouse staging table."""
        import json

        ds = context["ds"]
        s3_hook = S3Hook(aws_conn_id="aws_default")
        s3_hook.load_string(
            string_data="\n".join(json.dumps(r) for r in records),
            key=f"staging/weather/{ds}/data.jsonl",
            bucket_name="data-lake",
            replace=True,
        )

    transform_in_sql = SQLExecuteQueryOperator(
        task_id="transform_in_sql",
        conn_id="warehouse_default",
        sql="""
            INSERT OVERWRITE INTO mart.daily_weather
            SELECT
                date,
                AVG(temp_c) AS avg_temp,
                MIN(temp_c) AS min_temp,
                MAX(temp_c) AS max_temp,
                AVG(humidity_pct) AS avg_humidity
            FROM staging.weather
            WHERE date = '{{ ds }}'
            GROUP BY date;
        """,
    )

    raw = extract()
    cleaned = transform_in_flight(raw)
    load_to_warehouse(cleaned) >> transform_in_sql


etlt_hybrid()

if __name__ == "__main__":
    etlt_hybrid().test()
```

**Key patterns**: Python transform for schema normalization (field renaming, type coercion, derived fields), SQL transform for aggregation (leverages warehouse compute), clear separation — Python handles what SQL can't (API parsing, type coercion), SQL handles what it's best at (GROUP BY, joins).

## Pattern 11: Asset-Sequence ETL — Multi-DAG Pipeline

Each DAG produces an asset that triggers the next. Each DAG is independently deployable, testable, and versioned. Uses external storage (S3) for data passing between DAGs — avoids cross-DAG XCom fragility.

```python
"""Asset-sequence: Producer DAG → S3 → Consumer DAG."""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow.sdk import Asset, Metadata, asset
from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.providers.http.hooks.http import HttpHook
from airflow.providers.postgres.hooks.postgres import PostgresHook

# Shared asset definitions — both DAGs reference the same asset
weather_raw = Asset("s3://data-lake/raw/weather")

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "execution_timeout": timedelta(minutes=30),
}
```

**Producer DAG** — extracts data, writes to S3, marks asset:

```python
@asset(uri="s3://data-lake/raw/weather", schedule="@hourly")
def weather_raw_asset(self, context):
    """Extract weather data and write to S3."""
    hook = HttpHook(http_conn_id="weather_api", method="GET")
    response = hook.run(endpoint="/forecast", data={"latitude": 46.95, "longitude": 7.45})

    s3_hook = S3Hook(aws_conn_id="aws_default")
    ds = context["ds"]
    s3_hook.load_string(
        string_data=response.text,
        key=f"raw/weather/{ds}/data.json",
        bucket_name="data-lake",
        replace=True,
    )
    # Attach metadata so consumer knows what was produced
    yield Metadata(Asset("s3://data-lake/raw/weather"), {"ds": ds, "row_count": 24})
```

**Consumer DAG** — triggered by asset, reads from S3, loads to warehouse:

```python
@dag(
    dag_id="weather_load",
    schedule=[weather_raw],  # Triggered when producer marks asset
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_consecutive_failed_dag_runs=5,
    default_args=default_args,
    tags=["elt", "asset-sequence"],
)
def weather_load():

    @task()
    def read_and_load(**context):
        """Read from S3, load to warehouse. Uses asset metadata for the date."""
        events = context["triggering_asset_events"]
        metadata = events[weather_raw][0].extra
        ds = metadata["ds"]

        s3_hook = S3Hook(aws_conn_id="aws_default")
        raw_data = s3_hook.read_key(key=f"raw/weather/{ds}/data.json", bucket_name="data-lake")

        import json
        data = json.loads(raw_data)
        hook = PostgresHook(postgres_conn_id="warehouse_default")
        hook.run(f"DELETE FROM raw.weather WHERE date = '{ds}'")
        hook.insert_rows(
            table="raw.weather",
            rows=[(ds, json.dumps(data))],
            target_fields=["date", "payload"],
        )

    read_and_load()


weather_load()
```

**Key patterns**: Each `@asset` is one DAG = one task = independently deployable, `Metadata` passes context (dates, row counts) between DAGs without XCom, consumer uses `triggering_asset_events` to read metadata, S3 for actual data (not XCom), asset graph in UI shows the full pipeline across DAGs.

## Pattern Selection Guide

| Scenario | Pattern | Why |
|----------|---------|-----|
| Simple API → DB pipeline | Pattern 1 (Classic ETL) | Straightforward, full control |
| Warehouse-heavy transforms | Pattern 2 (ELT) | Leverage warehouse compute |
| Hourly/windowed processing | Pattern 3 (Incremental) | Efficient, backfillable |
| Data-driven scheduling | Pattern 4 (Asset-oriented) | No cron, runs when data ready |
| Unknown number of files | Pattern 5 (Dynamic) | `.expand()` handles variable count |
| Multiple data sources | Pattern 6 (Fan-in) | Parallel extraction, single join |
| dbt for transformations | Pattern 7 (ELT+dbt) | Separation of concerns |
| Real-time-ish updates | Pattern 8 (CDC) | Process only changes |
| 50+ similar pipelines | Pattern 9 (Factory) | Config-driven, no code duplication |
| Python + SQL transforms needed | Pattern 10 (ETLT) | Best of both: Python flexibility + warehouse compute |
| Multi-DAG pipeline with data handoff | Pattern 11 (Asset-sequence) | Independent deployment, asset triggers |
| Need quality gates before final load | See [data-quality.md](data-quality.md) | Applies to any pattern above |
