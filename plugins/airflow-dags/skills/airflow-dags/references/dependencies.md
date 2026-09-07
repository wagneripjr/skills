# Dependencies & Control Flow

## Contents
- [Setting Dependencies](#setting-dependencies)
- [Chain Functions](#chain-functions)
- [Inferred Dependencies](#inferred-dependencies)
- [Trigger Rules](#trigger-rules)
- [Branching](#branching)
- [Task Groups](#task-groups)

## Setting Dependencies

### Bitshift Operators

```python
t1 >> t2 >> t3       # t1 → t2 → t3
t3 << t2 << t1       # Same as above (reverse)
t1 >> [t2, t3] >> t4  # t1 → (t2, t3 parallel) → t4
```

### set_downstream / set_upstream

```python
t1.set_downstream(t2)
t3.set_upstream(t2)
```

## Chain Functions

### chain() — Different-Length Lists

```python
from airflow.sdk import chain

chain(t1, t2, t3)                    # Linear: t1 → t2 → t3
chain(t0, [t1, t2], [t3, t4], t5)   # Fan-out and fan-in (lists must match length)
```

Lists within `chain()` must have the same length — each element connects 1:1.

### chain_linear() — All-to-All

```python
from airflow.sdk import chain_linear

chain_linear([t1, t2], [t3, t4, t5])  # Every element in first list → every element in second
```

`chain_linear()` connects every upstream to every downstream. Lists can be different lengths.

## Inferred Dependencies

With TaskFlow API, passing one task's output to another's input automatically creates the dependency:

```python
@task()
def extract() -> dict:
    return {"key": "value"}

@task()
def transform(data: dict) -> dict:
    return {**data, "processed": True}

# This creates extract → transform dependency automatically
data = extract()
result = transform(data)
```

No explicit `>>` or `chain()` needed.

## Trigger Rules

Control when a task should execute based on upstream task states.

| Trigger Rule | Condition |
|-------------|-----------|
| `all_success` | All upstream succeeded (DEFAULT) |
| `all_failed` | All upstream failed or upstream_failed |
| `all_done` | All upstream completed (any state) |
| `all_skipped` | All upstream skipped |
| `one_failed` | At least one upstream failed (doesn't wait for all) |
| `one_success` | At least one upstream succeeded (doesn't wait for all) |
| `one_done` | At least one upstream completed |
| `none_failed` | All upstream succeeded OR were skipped |
| `none_failed_min_one_success` | None failed AND at least one succeeded |
| `none_skipped` | No upstream was skipped |
| `always` | Run regardless of upstream state |

```python
@task(trigger_rule="none_failed")
def cleanup():
    """Runs even if some upstream tasks were skipped."""
    pass
```

**Common patterns:**
- `none_failed` after branching (to avoid unintended skips)
- `all_done` for cleanup/notification tasks
- `one_success` for "proceed when any path succeeds"

## Branching

### @task.branch (Most Common)

Returns list of `task_id` strings to execute. All other downstream tasks are skipped.

```python
@task.branch()
def choose_path(**context) -> str:
    if context["logical_date"].weekday() < 5:
        return "weekday_task"
    return "weekend_task"

@task()
def weekday_task():
    pass

@task()
def weekend_task():
    pass

@task(trigger_rule="none_failed")
def join():
    """Must use none_failed to run after branching."""
    pass

branch = choose_path()
branch >> [weekday_task(), weekend_task()] >> join()
```

**Important**: Tasks downstream of branching need `trigger_rule="none_failed"` to prevent being skipped when one branch isn't taken.

### @task.run_if / @task.skip_if (Airflow 2.10+)

Conditionally run or skip individual tasks at runtime:

```python
def is_weekend(context) -> bool:
    return context["logical_date"].weekday() >= 5


@task.skip_if(is_weekend)
def weekday_only_task():
    """Skipped on weekends."""
    pass


@task.run_if(is_weekend)
def weekend_only_task():
    """Only runs on weekends."""
    pass
```

### Other Branch Operators

| Operator | Branches On |
|----------|------------|
| `BranchSQLOperator` | SQL query result |
| `BranchDayOfWeekOperator` | Day of week |
| `BranchDateTimeOperator` | Time range |
| `BranchPythonVirtualenvOperator` | Python in virtualenv |

## Task Groups

Visually organize complex DAGs without affecting execution logic.

### @task_group Decorator

```python
from airflow.decorators import task_group, task


@task_group(group_id="etl_customers")
def etl_customers():
    @task()
    def extract():
        return {"data": [1, 2, 3]}

    @task()
    def transform(data):
        return [x * 2 for x in data["data"]]

    raw = extract()
    transform(raw)


@dag(...)
def my_dag():
    etl_customers()
    # Task IDs: etl_customers.extract, etl_customers.transform
```

### TaskGroup Context Manager

```python
from airflow.utils.task_group import TaskGroup

with TaskGroup(group_id="my_group") as tg:
    t1 = PythonOperator(task_id="step1", ...)
    t2 = PythonOperator(task_id="step2", ...)
    t1 >> t2
```

### Task Group Parameters

| Parameter | Purpose | Default |
|-----------|---------|---------|
| `group_id` | Name of group | Required |
| `default_args` | Applied to all tasks in group | `{}` |
| `prefix_group_id` | Prefix task IDs with group name | `True` |

### Nesting

Task groups can be nested to any depth:

```python
@task_group(group_id="outer")
def outer():
    @task_group(group_id="inner")
    def inner():
        @task()
        def deep_task():
            pass
        deep_task()
    inner()
```

Task ID: `outer.inner.deep_task`

### Passing Data Between Groups

```python
@task_group()
def producer_group():
    @task()
    def produce():
        return {"key": "value"}
    return produce()  # Must return output if needed downstream


@task_group()
def consumer_group(data):
    @task()
    def consume(input_data):
        print(input_data)
    consume(data)


@dag(...)
def my_dag():
    result = producer_group()
    consumer_group(result)
```

### Dynamic Task Group Mapping

```python
@task_group(group_id="per_table")
def process_table(table_name: str):
    @task()
    def extract(table: str):
        return f"data from {table}"

    @task()
    def load(data: str):
        print(data)

    data = extract(table_name)
    load(data)


@dag(...)
def my_dag():
    process_table.expand(table_name=["users", "orders", "products"])
```

### When to Use Task Groups

- Big ETL/ELT DAGs (one group per table)
- MLOps DAGs (one group per model)
- Multi-team ownership (one group per team's tasks)
- Reusable task patterns across DAGs
- Dynamic inputs (combine with `.expand()`)
