# Dynamic Tasks & Dynamic DAGs

## Contents
- [Dynamic Task Mapping](#dynamic-task-mapping)
- [expand() and partial()](#expand-and-partial)
- [expand_kwargs()](#expand_kwargs)
- [Mapped Task Output](#mapped-task-output)
- [Dynamic Task Groups](#dynamic-task-groups)
- [Constraints](#constraints)
- [Dynamic DAGs](#dynamic-dags)
- [dag-factory](#dag-factory)
- [When to Use What](#when-to-use-what)

## Dynamic Task Mapping

Create a variable number of task copies at runtime based on upstream data. Use for "one task per X" scenarios (files, tables, records, etc.).

### Basic Pattern (TaskFlow)

```python
@task()
def get_files() -> list[str]:
    return ["file1.csv", "file2.csv", "file3.csv"]

@task()
def process_file(file: str) -> str:
    return f"processed {file}"

files = get_files()
process_file.expand(file=files)  # Creates 3 task instances at runtime
```

### Traditional Operator Pattern

```python
PythonOperator.partial(
    task_id="process",
    python_callable=my_func,
).expand(op_args=[[1], [2], [3]])
```

## expand() and partial()

- `.expand()`: Parameters that vary across mapped instances
- `.partial()`: Parameters constant across all instances

```python
@task()
def process(file: str, output_dir: str) -> None:
    pass

process.partial(output_dir="/output").expand(file=["a.csv", "b.csv"])
# Instance 0: process(file="a.csv", output_dir="/output")
# Instance 1: process(file="b.csv", output_dir="/output")
```

## expand_kwargs()

Map over multiple keyword arguments simultaneously:

```python
BashOperator.partial(task_id="cmd").expand_kwargs([
    {"bash_command": "echo hello", "env": {"WORD": "hello"}},
    {"bash_command": "echo world", "env": {"WORD": "world"}},
])
```

## Map Index Template

Customize how mapped instances appear in the Airflow UI:

```python
@task(map_index_template="{{ file_name }}")
def process(file_name: str):
    pass

# UI shows: process [file1.csv], process [file2.csv]
# Instead of: process [0], process [1]
```

## Mapped Task Output

Results from mapped tasks are stored as a list. Access by index:

```python
@task()
def aggregate(results: list[str]) -> str:
    """Receives list of all mapped outputs."""
    return ", ".join(results)

files = get_files()
processed = process_file.expand(file=files)
aggregate(processed)  # Gets list of all process_file results
```

Access specific mapped output:

```python
ti.xcom_pull(task_ids="process_file", map_indexes=[0])  # First instance only
```

## Dynamic Task Groups

Map entire task groups over a list:

```python
from airflow.decorators import task_group, task


@task_group(group_id="etl_table")
def etl_table(table_name: str):
    @task()
    def extract(table: str) -> dict:
        return {"table": table, "rows": 100}

    @task()
    def transform(data: dict) -> dict:
        return {**data, "transformed": True}

    @task()
    def load(data: dict) -> None:
        pass

    raw = extract(table_name)
    clean = transform(raw)
    load(clean)


@dag(...)
def pipeline():
    tables = ["users", "orders", "products"]
    etl_table.expand(table_name=tables)

pipeline()
```

Creates 3 task group instances, each with extract → transform → load.

## Constraints

| Constraint | Value |
|-----------|-------|
| Max mapped instances | `max_map_length` config (default: 1024) |
| Can't map over | `task_id`, `pool`, most `BaseOperator` args |
| Limit parallel execution | `max_active_tis_per_dag`, `max_active_tis_per_dagrun` |

## Dynamic DAGs

Generate multiple entire DAGs from configuration. Use when you have many similar DAGs that differ only by parameters.

### Python Loop

```python
from airflow.decorators import dag, task
from datetime import datetime

CONFIGS = {
    "users": {"table": "raw.users", "schedule": "@daily"},
    "orders": {"table": "raw.orders", "schedule": "@hourly"},
}

for name, config in CONFIGS.items():
    @dag(
        dag_id=f"etl_{name}",
        schedule=config["schedule"],
        start_date=datetime(2024, 1, 1),
        catchup=False,
    )
    def etl_factory(table=config["table"]):
        @task()
        def process(tbl: str):
            pass
        process(table)

    etl_factory()
```

**Caution**: Closures in loops — use default args (`table=config["table"]`) to capture the value.

## dag-factory

YAML-driven DAG generation. Install: `pip install dag-factory`

### Config File

`config/etl_pipelines.yaml`:
```yaml
etl_users:
  schedule: "0 6 * * *"
  default_args:
    owner: "team-data"
    start_date: "2024-01-01"
    retries: 3
    retry_delay_sec: 120
  tasks:
    extract:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: extract_users
      python_callable_file: /opt/airflow/include/etl_functions.py
    transform:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: transform_users
      python_callable_file: /opt/airflow/include/etl_functions.py
      dependencies: [extract]
    load:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: load_users
      python_callable_file: /opt/airflow/include/etl_functions.py
      dependencies: [transform]

etl_orders:
  schedule: "@hourly"
  default_args:
    owner: "team-commerce"
    start_date: "2024-01-01"
  tasks:
    extract:
      operator: airflow.providers.standard.operators.python.PythonOperator
      python_callable_name: extract_orders
      python_callable_file: /opt/airflow/include/etl_functions.py
```

### TaskFlow Decorator Syntax

dag-factory also supports TaskFlow decorators in YAML. Use `decorator:` instead of `operator:` and `+task_name` to pass XCom output:

```yaml
process_quotes:
  schedule: "@daily"
  tasks:
    get_quotes:
      decorator: airflow.sdk.task
      python_callable: include.quotes.get_quotes
    transform:
      decorator: airflow.sdk.task
      python_callable: include.quotes.transform
      quotes: +get_quotes
```

### DAG File

```python
# import ensures Airflow's DAG processor parses this file
from airflow.sdk import dag  # noqa: F401
from dagfactory import load_yaml_dags

load_yaml_dags(globals_dict=globals())
```

**Note**: Airflow's `DAG_DISCOVERY_SAFE_MODE` only parses files containing certain keywords. The `from airflow.sdk import dag` import ensures discovery. Alternatively, disable the config flag.

**Benefits**: Non-engineers can add pipelines via YAML PRs. No Python knowledge needed.

## When to Use What

| Scenario | Solution |
|----------|----------|
| Process N files in one DAG run | Dynamic Task Mapping (`.expand()`) |
| Run same ETL for 50 tables | Dynamic DAGs (dag-factory or Python loop) |
| Variable subtasks per run | Dynamic Task Mapping |
| Different schedules per table | Dynamic DAGs (each DAG has its own schedule) |
| Different owners per pipeline | Dynamic DAGs (each DAG has its own `owner`) |
| Process all items, count unknown at write time | Dynamic Task Mapping |
| Configuration-driven pipelines | dag-factory (YAML) |

**Key difference**: Dynamic Tasks = variable tasks within ONE DAG. Dynamic DAGs = variable number of ENTIRE DAGs.
