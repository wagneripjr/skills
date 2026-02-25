# Scheduling

## Contents
- [Airflow 3 Default Changes](#airflow-3-default-changes)
- [Time-Based Scheduling](#time-based-scheduling)
- [Asset-Based Scheduling](#asset-based-scheduling)
- [Asset Scheduling Gotchas](#asset-scheduling-gotchas)
- [Event-Driven Scheduling](#event-driven-scheduling)
- [Combined Scheduling](#combined-scheduling)
- [Scheduling Decision Guide](#scheduling-decision-guide)
- [Key Timestamps](#key-timestamps)
- [Catchup and Backfill](#catchup-and-backfill)
- [start_date Rules](#start_date-rules)

## Airflow 3 Default Changes

Airflow 3 changed several scheduling defaults. These affect new DAGs and DAGs without explicit parameters.

| Parameter | Airflow 2 Default | Airflow 3 Default |
|-----------|-------------------|-------------------|
| `schedule` | `timedelta(days=1)` | `None` (manual only) |
| `catchup` | `True` | `False` |
| Cron timetable | `CronDataIntervalTimetable` | `CronTriggerTimetable` |

**Critical**: DAGs without an explicit `schedule=` parameter will **not run automatically** in Airflow 3. Always set `schedule=` explicitly.

**Cron behavior change**: In Airflow 2, cron strings created data-interval-based runs where `logical_date = data_interval_start`. In Airflow 3, cron strings create point-in-time triggers where `logical_date = run_after` (no data interval). If your DAG relies on `data_interval_start/end` with cron, use `CronDataIntervalTimetable` explicitly or set `AIRFLOW__SCHEDULER__CREATE_CRON_DATA_INTERVALS=True`.

**logical_date meaning**: With `CronTriggerTimetable` (default), `logical_date = data_interval_start = data_interval_end = run_after`. With `CronDataIntervalTimetable`, `logical_date = data_interval_start` (previous interval's end).

See [migration.md](migration.md) for the full Airflow 2→3 migration guide.

## Time-Based Scheduling

### Cron Expressions

```python
@dag(schedule="0 2 * * MON")  # 2 AM every Monday
@dag(schedule="*/15 * * * *")  # Every 15 minutes
```

### Cron Presets

| Preset | Cron | Description |
|--------|------|-------------|
| `"@once"` | — | Run once |
| `"@hourly"` | `0 * * * *` | Every hour |
| `"@daily"` | `0 0 * * *` | Midnight daily |
| `"@weekly"` | `0 0 * * 0` | Midnight Sunday |
| `"@monthly"` | `0 0 1 * *` | 1st of month |
| `"@yearly"` | `0 0 1 1 *` | Jan 1st |
| `None` | — | Manual trigger only |

### Timedelta-Based

```python
from datetime import timedelta

@dag(schedule=timedelta(hours=2))   # Every 2 hours
@dag(schedule=timedelta(minutes=30))  # Every 30 minutes
```

### Timetables (Complex Schedules)

Use timetables when cron can't express your schedule (e.g., different times on different days, exclude holidays).

```python
from airflow.timetables.trigger import CronTriggerTimetable
from airflow.timetables.interval import CronDataIntervalTimetable, DeltaDataIntervalTimetable

# Point-in-time trigger (default in Airflow 3)
@dag(schedule=CronTriggerTimetable("0 8 * * MON-FRI"))

# With data interval (for windowed processing)
@dag(schedule=CronDataIntervalTimetable("0 0 * * *"))

# Continuous (runs one instance at a time, nonstop)
@dag(schedule="@continuous")
```

**CronTriggerTimetable** (default): Fires at specific points in time. `logical_date` = trigger time.

**CronDataIntervalTimetable**: Defines data processing windows. `data_interval_start/end` track what data the run covers.

**ContinuousTimetable** (`@continuous`): Runs continuously, one active run at a time. Good for streaming-like workloads.

## Asset-Based Scheduling

Schedule DAGs to run when upstream data is ready — no cron needed.

### Single Asset

```python
from airflow.sdk import Asset

@dag(schedule=[Asset("s3://bucket/customers.parquet")])
def process_customers():
    ...
```

Runs whenever a task with `outlets=[Asset("s3://bucket/customers.parquet")]` completes successfully.

### Multiple Assets (AND — all required)

```python
@dag(schedule=[Asset("customers"), Asset("orders")])
def join_data():
    ...  # Runs only when BOTH assets are updated
```

### Conditional Assets (OR — any triggers)

```python
@dag(schedule=(Asset("source_a") | Asset("source_b")))
def process_any():
    ...  # Runs when EITHER asset is updated
```

### Complex Expressions

```python
@dag(schedule=(Asset("a") & Asset("b")) | Asset("c"))
def complex_schedule():
    ...  # Runs when (a AND b) OR c
```

### Asset Aliases (Runtime-Generated Names)

```python
from airflow.sdk import AssetAlias

my_alias = AssetAlias("dynamic_output")


@task(outlets=[my_alias])
def produce(outlet_events):
    bucket = determine_bucket()  # dynamic at runtime
    outlet_events[my_alias].add(
        Asset(f"s3://{bucket}/data"),
        extra={"key": "value"},
    )
```

### Updating Assets

Assets are updated when:
1. Task with asset as `outlet` completes successfully
2. Manual REST API call
3. Manual UI click (materialize button)
4. AssetWatcher detects message queue event

## Asset Scheduling Gotchas

### Scheduling Cycles

DAG-level cycles are rejected by Airflow (DAGs must be acyclic). But **cross-DAG** asset triggers can silently create infinite loops:

```python
@asset(schedule=Asset("asset_b"))
def asset_a():
    pass  # Runs when asset_b updates → produces asset_a event

@asset(schedule=asset_a)
def asset_b():
    pass  # Runs when asset_a updates → produces asset_b event
# Trigger asset_a once → infinite loop between the two DAGs
```

This is technically valid Airflow code — no error is raised. **Always anchor at least one DAG in your dependency chain with a time-based or event-driven trigger** to prevent infinite loops.

### No logical_date for Asset-Triggered DAGs

Asset-triggered DAG runs react to an **event** (data is ready), not a **time interval**. The `logical_date` has no meaningful time context — it reflects when the run was created, not which data period to process.

**Problem**: A downstream DAG needs to know *which day's data* to process, but the upstream `logical_date` isn't available.

**Solution**: Propagate context via asset `Metadata`:

```python
from airflow.sdk import Asset, Metadata

my_asset = Asset("daily_features")

# Producer: attach date context to asset event
@task(outlets=[my_asset])
def produce_features(**context):
    run_date = context["logical_date"].strftime("%Y-%m-%d")
    # ... produce data ...
    yield Metadata(my_asset, {"run_date": run_date})

# Consumer: read date from triggering asset event
@task()
def consume_features(**context):
    event = context["triggering_asset_events"][my_asset][0]
    run_date = event.extra["run_date"]
    # ... process data for run_date ...
```

## Event-Driven Scheduling

Trigger DAGs from external events (Kafka, SQS) using `AssetWatcher` + `MessageQueueTrigger`.

### Kafka Example

```python
from airflow.sdk import Asset, AssetWatcher
from airflow.providers.apache.kafka.triggers.message_queue import MessageQueueTrigger

# Define trigger watching Kafka topic
kafka_trigger = MessageQueueTrigger(
    kafka_config_id="kafka_default",
    topics=["data-events"],
)

# Create asset with watcher
data_event = Asset(
    "kafka://data-events",
    watchers=[AssetWatcher(trigger=kafka_trigger)],
)

# DAG triggers on Kafka message
@dag(schedule=[data_event])
def process_event():
    ...
```

### Supported Triggers

| System | Provider Package |
|--------|-----------------|
| Apache Kafka | `apache-airflow-providers-apache-kafka` |
| Amazon SQS | `apache-airflow-providers-amazon` |
| Custom | Inherit from `BaseEventTrigger` |

## Combined Scheduling

### Time + Asset (Hybrid)

```python
from airflow.timetables.assets import AssetOrTimeSchedule
from airflow.timetables.trigger import CronTriggerTimetable

@dag(
    schedule=AssetOrTimeSchedule(
        timetable=CronTriggerTimetable("0 0 * * *"),  # Daily at midnight
        assets=(Asset("a") | Asset("b")),               # OR when asset updates
    )
)
def hybrid():
    ...  # Runs at midnight OR when either asset updates
```

## Scheduling Decision Guide

1. **Does the pipeline react to external events in real-time** (Kafka messages, SQS, webhooks)?
   - Yes → **Event-driven**: `AssetWatcher` + trigger
   - No → Q2
2. **Does the pipeline depend on upstream data being ready?**
   - Yes → Q3
   - No → Q4
3. **Are the upstream producers also Airflow DAGs in the same environment?**
   - Yes → **Asset-aware**: `schedule=Asset("name")` or asset expressions (`&`, `|`). Remember: anchor at least one DAG with a time-based trigger to prevent cycles.
   - No → Event-driven with `AssetWatcher` if the external system can emit events, otherwise sensors with time-driven scheduling.
4. **Does the pipeline need to run at predictable, regular intervals?**
   - Simple recurring (daily, hourly) → cron presets (`@daily`, `@hourly`)
   - Specific times → cron expression (`"5 4 * * *"`)
   - Regular cadence → `timedelta(minutes=30)`
   - Complex rules (business days, holidays) → custom timetable
   - No schedule needed → `schedule=None` (manual/API only)
5. **Need both time-based AND asset-aware triggers?**
   - Yes → `AssetOrTimeSchedule` (dual trigger — also useful as a migration safety net)
6. **Should the pipeline run continuously without gaps?**
   - Yes → `schedule="@continuous"` with `max_active_runs=1` (not for streaming — Airflow is batch)

## Key Timestamps

| Timestamp | Meaning |
|-----------|---------|
| `logical_date` | Point in time the DAG run is scheduled for |
| `data_interval_start` | Start of data processing window |
| `data_interval_end` | End of data processing window |
| `run_after` | Earliest time DAG can start executing |
| `start_date` (run) | When DAG actually started running |
| `end_date` (run) | When DAG finished running |

**Template variables** (use in Jinja-templated fields):

| Variable | Type | Example |
|----------|------|---------|
| `{{ ds }}` | String (YYYY-MM-DD) | `2024-01-15` |
| `{{ logical_date }}` | DateTime | `2024-01-15T00:00:00+00:00` |
| `{{ data_interval_start }}` | DateTime | Processing window start |
| `{{ data_interval_end }}` | DateTime | Processing window end |
| `{{ ts }}` | String (ISO) | `2024-01-15T00:00:00+00:00` |

## Catchup and Backfill

### Catchup

Default in Airflow 3: `catchup=False`.

- `catchup=True`: Airflow creates DAG runs for all missed intervals between `start_date` and now
- `catchup=False`: Only creates runs from current time forward

```python
@dag(
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,  # Default in Airflow 3 — no backfill on deploy
)
```

### Backfill

Airflow 3 makes backfills first-class citizens with three trigger methods:

**CLI:**

```bash
airflow dags backfill --start-date 2024-01-01 --end-date 2024-01-31 my_dag_id
```

**REST API:**

```bash
curl -X POST "https://airflow.example.com/api/v2/backfills" \
  -H "Content-Type: application/json" \
  -d '{
    "dag_id": "my_dag_id",
    "from_date": "2024-01-01T00:00:00Z",
    "to_date": "2024-01-31T00:00:00Z",
    "run_type": "missing",
    "max_active_runs": 3
  }'
```

**Airflow UI:** Browse → DAG Runs → Create Backfill — select date range, type (missing/errored/all), and concurrent limit.

Backfill types:
- **missing**: Only create runs for intervals without existing runs
- **errored**: Rerun only failed/errored intervals
- **all**: Create runs for all intervals (replaces existing)

## start_date Rules

**NEVER use `datetime.now()` or `pendulum.now()` as `start_date`.**

```python
# BAD — changes every parse, DAG never schedules correctly
start_date=datetime.now()

# GOOD — fixed date in the past
start_date=datetime(2024, 1, 1)
```

Rules:
1. Must be a fixed date in the past
2. Use timezone-aware datetime for production: `datetime(2024, 1, 1, tzinfo=timezone.utc)`
3. First DAG run schedules at `start_date + schedule_interval` (for interval-based)
4. Set once and never change — changing `start_date` resets scheduling history
