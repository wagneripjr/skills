# DAG Authoring Approaches

## Contents
- [Core Concepts](#core-concepts)
- [Authoring Paradigms](#authoring-paradigms)
- [TaskFlow API (Recommended)](#taskflow-api-recommended)
- [Asset-Oriented (Airflow 3)](#asset-oriented-airflow-3)
- [Traditional Syntax](#traditional-syntax)
- [Inference Execution (Airflow 3)](#inference-execution-airflow-3)
- [Authoring Decision Guide](#authoring-decision-guide)
- [DAG-Level Parameters](#dag-level-parameters)

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **DAG** | Workflow container — a collection of tasks with dependencies defining execution order. Always needed. |
| **Task** | One unit of work within a DAG (query a DB, call an API, transform data). Always needed. |
| **Operator** | Template/class that defines what a task does. Traditional: `PythonOperator(...)` returns operator directly. TaskFlow: `@task` creates operator + wraps in XComArg for automatic data passing. |
| **Asset** (object) | Logical representation of data (table, model, file) used to establish cross-DAG dependencies. Can be explicit (`Asset("name")`) or implicit (via `@asset` decorator). |
| **Asset event** | Record indicating an asset was updated — this is what triggers downstream consumer DAGs. |
| **Materialize** | Run the function/task that produces an asset. |
| **`@asset`** (decorator) | Declarative shorthand: creates a DAG + single task + asset outlet in one function. |

## Authoring Paradigms

Airflow offers a spectrum from **imperative** (you tell Airflow *how*, step by step) to **declarative** (you tell Airflow *what* you want, it handles the rest). Authoring and scheduling are independent choices — you can combine any authoring style with any scheduling approach.

- **Imperative, code-based**: TaskFlow API (`@dag`/`@task`), classic operators, mixed
- **Imperative, config-based**: DAG Factory (YAML) — see [dynamic-tasks.md](dynamic-tasks.md)
- **Declarative, asset-oriented**: `@asset` decorator

## TaskFlow API (Recommended)

The `@dag` and `@task` decorators provide the cleanest, most Pythonic syntax. Dependencies are inferred from function arguments, and XCom is handled automatically.

### Decorators

| Decorator | Purpose |
|-----------|---------|
| `@dag()` | Define a DAG |
| `@task()` | Python task |
| `@task.bash()` | Bash command task |
| `@task.virtualenv()` | Task in isolated Python virtualenv |
| `@task.branch()` | Conditional branching (returns task_ids to execute) |
| `@task.kubernetes()` | Task running in Kubernetes pod |
| `@task.sensor()` | Custom sensor (returns `PokeReturnValue`) |
| `@task.run_if()` | Skip task if condition is False (Airflow 2.10+) |
| `@task.skip_if()` | Skip task if condition is True (Airflow 2.10+) |

### Complete Example

```python
from __future__ import annotations

import json
from datetime import datetime, timedelta

from airflow.decorators import dag, task
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.providers.http.hooks.http import HttpHook


@dag(
    dag_id="taskflow_etl",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
        "execution_timeout": timedelta(minutes=30),
    },
    tags=["etl"],
    doc_md="Daily ETL pipeline using TaskFlow API.",
)
def taskflow_etl():

    @task()
    def extract(**context) -> list[dict]:
        """Fetch data using Airflow HTTP connection."""
        hook = HttpHook(http_conn_id="api_default", method="GET")
        ds = context["ds"]
        response = hook.run(endpoint=f"/data?date={ds}")
        return response.json()

    @task()
    def transform(records: list[dict]) -> list[dict]:
        """Filter active records — pure function, no I/O."""
        return [r for r in records if r.get("status") == "active"]

    @task()
    def load(records: list[dict], **context) -> None:
        """Write to S3 with partitioned key for idempotency."""
        ds = context["ds"]
        hook = S3Hook(aws_conn_id="aws_default")
        hook.load_string(
            string_data=json.dumps(records),
            key=f"daily/{ds}/data.json",
            bucket_name="my-bucket",
            replace=True,
        )

    # Dependencies inferred from function arguments
    data = extract()
    filtered = transform(data)
    load(filtered)


taskflow_etl()

if __name__ == "__main__":
    taskflow_etl().test()
```

**Key points:**
- Return values automatically pushed to XCom
- Passing output as argument creates dependency AND passes data
- `**context` gives access to Airflow template variables (`ds`, `logical_date`, etc.)
- Always call the `@dag` function at module level to register the DAG
- Add `if __name__` block for `dag.test()` development testing

## Asset-Oriented (Airflow 3)

The `@asset` decorator creates a single-task DAG that produces one asset. Best for data-first pipelines where scheduling is driven by data availability.

### Basic Asset

```python
from airflow.sdk import Asset, asset


@asset(
    uri="s3://my-bucket/clean/customers.parquet",
    schedule="@daily",
)
def clean_customers(self, context):
    """Produce a clean customers dataset."""
    # self.uri contains the asset URI
    # Task logic here
    pass
```

One `@asset` = one DAG with one task producing one asset. Minimal boilerplate.

### Producer + Consumer Pattern

```python
from airflow.sdk import Asset, asset
from airflow.decorators import dag, task

# Producer: creates asset event on success
customers_asset = Asset("s3://my-bucket/clean/customers.parquet")


@asset(uri="s3://my-bucket/clean/customers.parquet", schedule="@daily")
def produce_customers(self, context):
    pass


# Consumer: triggered when asset is updated
@dag(
    dag_id="consume_customers",
    schedule=[customers_asset],  # Triggered by asset update
    catchup=False,
)
def consume_customers():
    @task()
    def process():
        pass

    process()


consume_customers()
```

### Asset with Outlets (Task-Oriented)

```python
from airflow.sdk import Asset
from airflow.decorators import dag, task

my_asset = Asset("s3://bucket/data")


@dag(dag_id="producer", schedule="@daily")
def producer():
    @task(outlets=[my_asset])  # Marks this task as producing the asset
    def produce(**context):
        pass

    produce()


producer()
```

### Asset Identity

Asset identity is determined by **name**, not by Python object instance. Two `Asset("sales")` objects in different files are the same asset.

```python
a = Asset("sales")
b = Asset("sales")
# a and b are different Python objects but THE SAME asset in Airflow
```

For `@asset`-created assets, the asset name defaults to the function name. You can reference it implicitly (function) or explicitly (`Asset("name")`) — both are equivalent:

```python
@asset(schedule="@daily")
def daily_sales():
    pass

# These two are identical — same asset:
@dag(schedule=daily_sales)          # implicit: function reference
@dag(schedule=Asset("daily_sales")) # explicit: Asset object with same name
```

### @asset Litmus Test

Answer **yes to all three** → use `@asset`. **No to any** → use `@dag` with `outlets`.

1. Can I give the output a **meaningful name**?
2. Will someone/something **consume** the output?
3. Is the output produced by **one atomic function**?

### When to Use @asset vs @task with Outlets

| Asset is updated by | Use |
|---------------------|-----|
| A single Python function | `@asset` decorator |
| A SQL query, Bash script, or container | Imperative `@dag` with specific operator + `outlets` parameter |
| A multi-step pipeline | Imperative `@dag` with `outlets` on the final task(s) |

**Anti-pattern**: Never instantiate an operator (e.g., `SQLExecuteQueryOperator`) inside an `@asset` or `@task` function body. This hides the real work from Airflow, breaking visibility, logging, and connection management. Use the operator as a standalone task and connect via `outlets`.

### Limitations (Airflow 3.0)

- Does not support Dynamic Task Mapping
- One task per `@asset` DAG (for multi-task, use `@dag` with `outlets`)
- Avoid splitting a large pipeline into many `@asset` DAGs — it fragments execution and complicates cross-DAG orchestration. Use a single `@dag` with task groups instead.

## Traditional Syntax

Uses `DAG` class with operator instantiation. More verbose but necessary for specific operators that don't have decorator equivalents.

```python
from datetime import datetime, timedelta

from airflow.sdk import DAG
from airflow.providers.standard.operators.python import PythonOperator
from airflow.providers.standard.operators.bash import BashOperator


def _extract(**context):
    pass


def _transform(**context):
    ti = context["ti"]
    data = ti.xcom_pull(task_ids="extract")
    # Manual XCom pull required
    return [r for r in data if r["status"] == "active"]


with DAG(
    dag_id="traditional_etl",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args={"retries": 3, "retry_delay": timedelta(minutes=2)},
) as dag:

    extract = PythonOperator(
        task_id="extract",
        python_callable=_extract,
    )

    transform = PythonOperator(
        task_id="transform",
        python_callable=_transform,
    )

    load = BashOperator(
        task_id="load",
        bash_command="echo 'loading data'",
    )

    extract >> transform >> load
```

**Key differences from TaskFlow:**
- Manual XCom push/pull (`ti.xcom_pull(task_ids="...")`)
- Explicit dependency definition (`>>` or `chain()`)
- More boilerplate but tasks reusable across DAGs
- Required when using operators without decorator equivalents

## Inference Execution (Airflow 3)

Use DAGs as backends for API-driven applications (GenAI, request-response workflows). Airflow 3 allows `logical_date=None`, enabling multiple simultaneous runs of the same DAG.

### Push Pattern (REST API)

A web application triggers a DAG run via REST API and polls for the result.

```python
from __future__ import annotations

from datetime import timedelta

from airflow.decorators import dag, task
from airflow.providers.openai.hooks.openai import OpenAIHook


@dag(
    dag_id="genai_inference",
    schedule=None,  # API-triggered only
    catchup=False,
    max_consecutive_failed_dag_runs=10,
    default_args={
        "retries": 2,
        "retry_delay": timedelta(minutes=1),
        "execution_timeout": timedelta(minutes=5),
    },
    tags=["inference", "genai"],
)
def genai_inference():

    @task()
    def process_prompt(**context) -> dict:
        """Read user prompt from dag_run.conf and call LLM."""
        conf = context["dag_run"].conf or {}
        user_prompt = conf.get("prompt", "")
        hook = OpenAIHook(conn_id="openai_default")
        client = hook.get_conn()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": user_prompt},
            ],
        )
        return {"result": response.choices[0].message.content}

    process_prompt()


genai_inference()
```

**Trigger via REST API:**

```bash
curl -X POST "https://airflow.example.com/api/v2/dags/genai_inference/dagRuns" \
  -H "Content-Type: application/json" \
  -d '{"conf": {"prompt": "Summarize this quarter sales data"}}'
```

### Poll Pattern (Message Queue)

A web application posts to a message queue. An `AssetWatcher` polls the queue and triggers the DAG.

```python
from airflow.sdk import Asset, AssetWatcher
from airflow.providers.amazon.aws.triggers.sqs import SqsSensorTrigger

sqs_trigger = SqsSensorTrigger(
    sqs_queue="inference-requests",
    aws_conn_id="aws_default",
)

request_event = Asset(
    "sqs://inference-requests",
    watchers=[AssetWatcher(trigger=sqs_trigger)],
)


@dag(schedule=[request_event], catchup=False)
def process_inference_request():
    ...
```

### When to Use Inference Execution

- GenAI backends: user prompt → LLM processing → result
- Ad-hoc processing: on-demand report generation, data exports
- Request-response workflows: form submission → pipeline → notification
- Key advantage: reuse batch pipeline reliability (retries, observability, connection management) for interactive workloads

## Authoring Decision Guide

| Scenario | Best Approach | Why |
|----------|--------------|-----|
| New multi-task pipeline | TaskFlow API (`@dag`/`@task`) | Cleanest syntax, automatic XCom, inferred deps |
| Single data producer | Asset-oriented (`@asset`) | Minimal boilerplate, enables data-driven scheduling |
| Complex inter-task deps | TaskFlow API | Flexible dependency patterns |
| Operator without decorator | Traditional + TaskFlow mix | Use operator directly, mix with `@task` |
| Legacy migration | Traditional syntax | Match existing patterns |
| API-triggered / GenAI backend | Inference execution | `schedule=None`, read `dag_run.conf` for inputs |
| 50+ similar DAGs from config | DAG Factory (YAML) | See [dynamic-tasks.md](dynamic-tasks.md) |
| Reusable task across DAGs | Custom operator class | Inherit from `BaseOperator` |

### Decision Flow

1. **50+ similar DAGs, or team with limited Python?**
   - Similar in config but need full flexibility → DAG Factory (YAML)
   - Otherwise → continue to Q2
2. **Primary focus: tasks (how it runs) or data (what it produces)?**
   - Tasks → Q3
   - Data → Q4
3. **Is a TaskFlow decorator available for your operator?**
   - Yes → TaskFlow API (`@task`, `@task.bash`, `@task.kubernetes`, etc.)
   - No → Classic operator (can mix with `@task` in same DAG)
   - Then ask: does this task produce a distinct data asset? If yes, add `outlets`.
4. **Does the output pass the @asset Litmus Test?**
   - Pass (nameable + consumed + one function) → `@asset` decorator
   - Fail → Imperative `@dag` with `outlets` on producing task(s)

**Rule**: Pick ONE style per DAG. Do not randomly mix `with DAG()` and `@dag` in the same file.

## DAG-Level Parameters

### Essential

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `dag_id` | Unique name (defaults to function name) | `"my_etl"` |
| `start_date` | When DAG can begin scheduling (must be in past) | `datetime(2024, 1, 1)` |
| `schedule` | When DAG runs | `"@daily"`, `[Asset("x")]`, `None` |
| `catchup` | Backfill missed runs (default `False` in Airflow 3) | `False` |

### Operational

| Parameter | Purpose | Default |
|-----------|---------|---------|
| `max_active_runs` | Concurrent DAG runs | 16 |
| `max_active_tasks` | Concurrent tasks in one run | 16 |
| `max_consecutive_failed_dag_runs` | Auto-disable after N failures | None |
| `dagrun_timeout` | Timeout for entire DAG run | None |
| `fail_fast` | Stop on first task failure | False |
| `default_args` | Applied to all tasks | `{}` |

### UI / Documentation

| Parameter | Purpose |
|-----------|---------|
| `description` | Short text in Airflow UI |
| `doc_md` | Markdown documentation in UI |
| `tags` | Filtering and organization |
| `dag_display_name` | Override dag_id in UI (Airflow 2.9+) |

### Jinja Templating

| Parameter | Purpose |
|-----------|---------|
| `template_searchpath` | Directories for Jinja templates |
| `user_defined_macros` | Custom macros for templates |
| `render_template_as_native_obj` | Render as Python objects (not strings) |

### Callbacks

| Parameter | When |
|-----------|------|
| `on_success_callback` | DAG run succeeds |
| `on_failure_callback` | DAG run fails |
