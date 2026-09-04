# Operators, Sensors, Hooks & Providers

## Contents
- [Operators](#operators)
- [TaskFlow Decorators](#taskflow-decorators)
- [Sensors](#sensors)
- [Deferrable Operators](#deferrable-operators)
- [Waiting Strategies Comparison](#waiting-strategies-comparison)
- [Hooks](#hooks)
- [Provider Packages](#provider-packages)
- [Custom Components](#custom-components)

## Operators

Operators are Python classes that encapsulate a unit of work. Instantiating an operator with parameters creates a task.

### Common Operators

| Operator | Purpose | Provider |
|----------|---------|----------|
| `PythonOperator` | Execute Python callable | `apache-airflow-providers-standard` |
| `BashOperator` | Execute bash command | `apache-airflow-providers-standard` |
| `KubernetesPodOperator` | Run in K8s pod | `apache-airflow-providers-cncf-kubernetes` |
| `DockerOperator` | Run in Docker container | `apache-airflow-providers-docker` |
| `SQLExecuteQueryOperator` | Run SQL query | `apache-airflow-providers-common-sql` |
| `S3CreateObjectOperator` | Create S3 object | `apache-airflow-providers-amazon` |
| `GCSToGCSOperator` | Copy GCS objects | `apache-airflow-providers-google` |

### Operator Anatomy

```python
from airflow.providers.standard.operators.python import PythonOperator

extract_task = PythonOperator(
    task_id="extract",           # Unique within DAG
    python_callable=my_function,  # What to execute
    op_kwargs={"param": "value"}, # Arguments to callable
    retries=3,
    retry_delay=timedelta(minutes=2),
    execution_timeout=timedelta(minutes=30),
    pool="database_pool",        # Limit concurrency
)
```

## TaskFlow Decorators

Decorators wrap Python functions into operators with cleaner syntax:

| Decorator | Equivalent Operator | Use Case |
|-----------|-------------------|----------|
| `@task()` | `PythonOperator` | Python logic |
| `@task.bash()` | `BashOperator` | Shell commands |
| `@task.virtualenv()` | `PythonVirtualenvOperator` | Isolated Python env |
| `@task.kubernetes()` | `KubernetesPodOperator` | K8s pod execution |
| `@task.sensor()` | Custom sensor | Wait for condition |
| `@task.branch()` | `BranchPythonOperator` | Conditional branching |

```python
@task.bash()
def run_dbt() -> str:
    return "dbt run --models staging"

@task.virtualenv(requirements=["pandas==2.0"])
def process_in_venv(data: dict) -> dict:
    import pandas as pd  # Available in virtualenv
    return data

@task.kubernetes(image="python:3.11", namespace="airflow")
def heavy_compute():
    pass
```

## Sensors

Sensors wait for a specific condition before allowing downstream tasks to execute.

### Modes

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `poke` | Holds worker slot, sleeps between checks | Short waits (< 5 min) |
| `reschedule` | Releases worker slot, reschedules later | Long waits (> 5 min) |

**Always prefer `reschedule` for long waits** to avoid blocking worker slots.

### Common Sensors

| Sensor | Waits For |
|--------|-----------|
| `S3KeySensor` | File exists in S3 |
| `HttpSensor` | HTTP endpoint returns success |
| `SqlSensor` | SQL query returns truthy result |
| `ExternalTaskSensor` | Task in another DAG completes |
| `FileSensor` | File exists on filesystem |
| `DateTimeSensor` | Specific datetime reached |

### Sensor Parameters

```python
from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor

wait_for_file = S3KeySensor(
    task_id="wait_for_file",
    bucket_name="my-bucket",
    bucket_key="incoming/{{ ds }}/data.csv",
    aws_conn_id="aws_default",
    mode="reschedule",           # Release worker slot
    poke_interval=300,           # Check every 5 minutes
    timeout=3600,                # Fail after 1 hour
    exponential_backoff=True,    # Increase interval between checks
    max_wait=timedelta(minutes=30),  # Max interval with backoff
)
```

### Custom Sensor with @task.sensor

```python
from airflow.sensors.base import PokeReturnValue

@task.sensor(mode="reschedule", poke_interval=60, timeout=3600)
def wait_for_api(**context) -> PokeReturnValue:
    from airflow.providers.http.hooks.http import HttpHook
    hook = HttpHook(http_conn_id="api_default")
    response = hook.run(endpoint="/status")
    is_ready = response.json().get("ready", False)
    return PokeReturnValue(is_done=is_ready, xcom_value=response.json())
```

## Deferrable Operators

Use Python `asyncio` to efficiently wait for external resources without occupying a worker slot. Requires the `triggerer` service running.

### When to Use

- Any task waiting > 1 minute on external systems
- Sensors with long polling intervals
- Tasks that call slow APIs or wait for batch jobs

### How It Works

1. Task starts on worker, initiates external operation
2. Task defers — releases worker slot, creates a Trigger
3. Trigger runs on `triggerer` service using asyncio (lightweight)
4. When condition is met, trigger fires
5. Task resumes on a worker to complete

### Enabling

```bash
# Enable deferrable mode globally for all operators that support it
AIRFLOW__OPERATORS__DEFAULT_DEFERRABLE=True
```

Or per-operator: use the deferrable version (many providers offer both):

```python
# Standard (blocks worker)
from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor

# Deferrable (releases worker) — often same class with deferrable=True
S3KeySensor(
    task_id="wait",
    deferrable=True,  # Uses triggerer instead of worker
    ...
)
```

### Cost Impact

Deferrable operators significantly reduce worker costs. A sensor waiting 2 hours:
- **Poke mode**: Blocks 1 worker slot for 2 hours
- **Reschedule mode**: Intermittently blocks slot, occupies scheduler
- **Deferrable**: Zero worker slots, minimal triggerer resources

## Waiting Strategies Comparison

Choose the right mechanism for waiting on external events:

| Mechanism | How It Works | Worker Impact | Best For |
|-----------|-------------|---------------|----------|
| Sensor (poke) | Holds worker slot, sleeps between checks | **High** — blocks 1 slot | Short waits (< 5 min), simple conditions |
| Sensor (reschedule) | Releases slot, scheduler reschedules | **Medium** — intermittent | Medium waits (5-60 min) |
| Deferrable operator | Async trigger on `triggerer` service | **Zero** — no worker slot | Long waits (> 1 min), slow APIs, batch jobs |
| AssetWatcher | Always-on background polling via triggerer | **Zero** — no task created | External event → DAG trigger (Kafka, SQS) |

### Decision Guide

- **"Wait for a file, then process it"** → Deferrable `S3KeySensor` (deferrable=True)
- **"Wait for a quick API response"** → Sensor with `mode="poke"` or `@task.sensor()`
- **"Run DAG when a Kafka message arrives"** → AssetWatcher + `MessageQueueTrigger`
- **"Wait for another DAG's task to complete"** → `ExternalTaskSensor` (reschedule mode) or Assets
- **"Process data whenever upstream produces it"** → Asset-based scheduling (no sensor needed)

**Rule of thumb**: If the wait is > 1 minute, use deferrable. If you want to trigger a DAG (not a task), use AssetWatcher. Sensors are for in-DAG waiting only.

## Hooks

Hooks abstract external system connections. Used inside operators, decorators, or task code.

### Common Hooks

| Hook | External System |
|------|----------------|
| `S3Hook` | AWS S3 |
| `PostgresHook` | PostgreSQL |
| `HttpHook` | REST APIs |
| `MySqlHook` | MySQL |
| `GCSHook` | Google Cloud Storage |
| `SlackHook` | Slack |

### Usage

```python
@task()
def fetch_from_postgres(**context) -> list[dict]:
    from airflow.providers.postgres.hooks.postgres import PostgresHook
    hook = PostgresHook(postgres_conn_id="my_postgres")
    df = hook.get_pandas_df("SELECT * FROM users WHERE date = %(ds)s", parameters={"ds": context["ds"]})
    return df.to_dict(orient="records")
```

**Always use hooks instead of raw clients** (`boto3`, `requests`, `psycopg2`). Hooks use Airflow connections for credential management.

## Provider Packages

Providers are Python packages containing operators, sensors, hooks, and connections for specific systems. 300+ available.

### Installation

```bash
pip install apache-airflow-providers-amazon
pip install apache-airflow-providers-google
pip install apache-airflow-providers-postgres
```

Or in `requirements.txt` for Astro CLI projects.

### Finding Providers

- [Astronomer Registry](https://registry.astronomer.io/) — searchable catalog
- [PyPI](https://pypi.org/search/?q=apache-airflow-providers) — all packages

### Version Compatibility

Provider versions must be compatible with your Airflow version. Check the provider's PyPI page or Astronomer Registry for compatibility matrix.

## Custom Components

### Custom Operator

```python
from airflow.models import BaseOperator

class MyCustomOperator(BaseOperator):
    template_fields = ("source", "destination")  # Jinja-templatable fields

    def __init__(self, source: str, destination: str, **kwargs):
        super().__init__(**kwargs)
        self.source = source
        self.destination = destination

    def execute(self, context):
        # Task logic here
        self.log.info(f"Processing {self.source} -> {self.destination}")
        return {"status": "success"}
```

### Custom Hook

```python
from airflow.hooks.base import BaseHook

class MyApiHook(BaseHook):
    conn_name_attr = "my_api_conn_id"
    default_conn_name = "my_api_default"
    conn_type = "http"

    def __init__(self, my_api_conn_id: str = default_conn_name):
        super().__init__()
        self.my_api_conn_id = my_api_conn_id

    def get_conn(self):
        conn = self.get_connection(self.my_api_conn_id)
        return {"base_url": conn.host, "token": conn.password}

    def fetch_data(self, endpoint: str) -> dict:
        config = self.get_conn()
        # Implementation here
        pass
```

### Custom Sensor

```python
from airflow.sensors.base import BaseSensorOperator

class MyCustomSensor(BaseSensorOperator):
    def __init__(self, target_value: str, **kwargs):
        super().__init__(**kwargs)
        self.target_value = target_value

    def poke(self, context) -> bool:
        # Return True when condition is met
        current = check_external_system()
        return current == self.target_value
```

### Packaging Custom Components

For reuse across DAGs and teams, package as a Python package:

```
my_airflow_components/
  __init__.py
  operators/
    __init__.py
    my_operator.py
  hooks/
    __init__.py
    my_hook.py
  sensors/
    __init__.py
    my_sensor.py
  setup.py
```

Install via `pip install -e .` or publish to private PyPI.
