# Testing Airflow DAGs

## Contents
- [Testing Philosophy](#testing-philosophy)
- [Development Testing](#development-testing)
- [DAG Validation Tests](#dag-validation-tests)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [Cluster Policies](#cluster-policies)
- [CI/CD Integration](#cicd-integration)
- [Test Project Structure](#test-project-structure)

## Testing Philosophy

**Test YOUR custom code. Never test official Airflow providers** — they're already tested by provider maintainers.

Three types of pipeline testing exist:
1. **Pipeline code testing** — Does my DAG do what I expect? (this document)
2. **Data quality testing** — Does my data match expectations? (see [data-quality.md](data-quality.md))
3. **Pipeline efficiency testing** — Does my pipeline scale? (not covered here)

**Key rule**: Use test-driven development. Write failing tests first, then implement.

## Development Testing

### dag.test() — Fastest Feedback Loop

Executes an entire DAG in a single Python process without the scheduler. Supports IDE debugging (breakpoints, stepping).

```python
# At the bottom of your DAG file:
if __name__ == "__main__":
    dag_object.test()
```

Run: `python dags/my_dag.py`

### dag.test() with Parameters

```python
from datetime import datetime

if __name__ == "__main__":
    dag_object.test(
        logical_date=datetime(2025, 12, 15),
        conn_file_path="test_connections.yaml",
        variable_file_path="test_variables.yaml",
        run_conf={"my_param": 23},
    )
```

### Connection File Format

`test_connections.yaml`:
```yaml
my_postgres:
  conn_type: postgres
  host: localhost
  port: 5432
  schema: testdb
  login: test_user
  password: test_pass

aws_default:
  conn_type: aws
  extra:
    region_name: us-east-1
```

### Airflow CLI

```bash
airflow dags test my_dag_id 2025-01-01       # Test full DAG run
airflow tasks test my_dag_id my_task 2025-01-01  # Test single task
airflow connections test my_conn_id           # Test connection
```

**`--mark-success-pattern`**: Skip upstream tasks when testing a subset. Marks matching tasks as successful automatically:

```bash
airflow dags test my_dag_id 2025-01-01 --mark-success-pattern "sensor_*"
```

**Connection testing gotcha**: `airflow connections test` is **disabled by default**. Enable it first:

```
AIRFLOW__CORE__TEST_CONNECTION="Enabled"
```

### Astro CLI

```bash
astro dev parse          # Check all DAGs for import errors
astro dev pytest         # Run all tests in tests/ folder
astro dev upgrade-test   # Test DAGs against different Airflow versions
```

## DAG Validation Tests

Enforce organizational standards across all DAGs using pytest and `DagBag`.

### Helper Functions

```python
# tests/dag_validation/conftest.py
from airflow.models import DagBag


def get_import_errors():
    """Return all DAG import errors."""
    dag_bag = DagBag(include_examples=False)
    return list(dag_bag.import_errors.items())


def get_dags():
    """Return all DAG objects as (dag_id, dag, fileloc) tuples."""
    dag_bag = DagBag(include_examples=False)
    return [(dag_id, dag, dag.fileloc) for dag_id, dag in dag_bag.dags.items()]
```

### Import Validation

```python
import pytest
from tests.dag_validation.conftest import get_import_errors


@pytest.mark.parametrize(
    "rel_path,error",
    get_import_errors(),
    ids=[x[0] for x in get_import_errors()],
)
def test_no_import_errors(rel_path, error):
    """Every DAG file must import without errors."""
    if rel_path and error:
        raise Exception(f"{rel_path} failed to import:\n{error}")
```

### Tag Requirements

```python
@pytest.mark.parametrize(
    "dag_id,dag,fileloc",
    get_dags(),
    ids=[x[0] for x in get_dags()],
)
def test_dag_has_tags(dag_id, dag, fileloc):
    """Every DAG must have at least one tag."""
    assert dag.tags, f"DAG {dag_id} ({fileloc}) has no tags."
```

### Allowed Operators

```python
ALLOWED_OPERATORS = [
    "_PythonDecoratedOperator",
    "BashOperator",
    "S3CreateObjectOperator",
]


@pytest.mark.parametrize("dag_id,dag,fileloc", get_dags(), ids=[x[0] for x in get_dags()])
def test_allowed_operators_only(dag_id, dag, fileloc):
    """Only pre-approved operators are allowed."""
    for task in dag.tasks:
        assert task.task_type in ALLOWED_OPERATORS, (
            f"DAG {dag_id}: task '{task.task_id}' uses disallowed operator '{task.task_type}'"
        )
```

### Execution Timeout Enforcement

```python
from datetime import timedelta

MAX_TIMEOUT = timedelta(minutes=60)


@pytest.mark.parametrize("dag_id,dag,fileloc", get_dags(), ids=[x[0] for x in get_dags()])
def test_tasks_have_timeout(dag_id, dag, fileloc):
    """Every task must have an execution timeout set."""
    for task in dag.tasks:
        assert task.execution_timeout is not None, (
            f"DAG {dag_id}: task '{task.task_id}' has no execution_timeout"
        )
        assert task.execution_timeout <= MAX_TIMEOUT, (
            f"DAG {dag_id}: task '{task.task_id}' timeout {task.execution_timeout} exceeds max {MAX_TIMEOUT}"
        )
```

### Max Consecutive Failures

```python
@pytest.mark.parametrize("dag_id,dag,fileloc", get_dags(), ids=[x[0] for x in get_dags()])
def test_max_consecutive_failed_runs(dag_id, dag, fileloc):
    """Critical DAGs must auto-disable after repeated failures."""
    if "critical" in (dag.tags or []):
        assert dag.max_consecutive_failed_dag_runs is not None, (
            f"DAG {dag_id}: critical DAG must set max_consecutive_failed_dag_runs"
        )
        assert dag.max_consecutive_failed_dag_runs <= 5
```

## Unit Tests

Test custom Python functions and operators in isolation with mocked external dependencies.

### Test Custom Functions (Not Providers)

```python
# include/transformations.py
def calculate_macro_percentage(protein: float, carbs: float, fat: float) -> dict:
    total = protein + carbs + fat
    if protein < 0 or carbs < 0 or fat < 0:
        raise ValueError("Macros cannot be negative.")
    if total == 0:
        return {"protein_pct": 0.0, "carbs_pct": 0.0, "fat_pct": 0.0}
    return {
        "protein_pct": round((protein / total) * 100, 1),
        "carbs_pct": round((carbs / total) * 100, 1),
        "fat_pct": round((fat / total) * 100, 1),
    }
```

```python
# tests/unit_tests/test_transformations.py
import pytest
from include.transformations import calculate_macro_percentage


def test_happy_path():
    result = calculate_macro_percentage(23, 42, 19)
    assert result == {"protein_pct": 27.4, "carbs_pct": 50.0, "fat_pct": 22.6}


def test_zero_macros():
    result = calculate_macro_percentage(0, 0, 0)
    assert result == {"protein_pct": 0.0, "carbs_pct": 0.0, "fat_pct": 0.0}


def test_negative_raises():
    with pytest.raises(ValueError, match="cannot be negative"):
        calculate_macro_percentage(-10, 0, 0)
```

**Coverage pattern**: Happy path + edge cases + error conditions.

### Test Custom Operators with Mocking

```python
from unittest.mock import patch, MagicMock
import pytest


class TestMyCustomOperator:
    @pytest.fixture
    def mock_context(self):
        return {"ds": "2025-01-15", "ti": MagicMock()}

    @patch("include.custom_operators.my_operator.MyApiHook")
    def test_execute_returns_data(self, mock_hook_class, mock_context):
        mock_hook = MagicMock()
        mock_hook_class.return_value = mock_hook
        mock_hook.fetch_data.return_value = {"records": [1, 2, 3]}

        operator = MyCustomOperator(
            task_id="test",
            api_conn_id="test_conn",
        )
        result = operator.execute(mock_context)

        assert "records" in result
        mock_hook.fetch_data.assert_called_once()

    @patch("include.custom_operators.my_operator.MyApiHook")
    def test_api_error_propagates(self, mock_hook_class, mock_context):
        mock_hook = MagicMock()
        mock_hook_class.return_value = mock_hook
        mock_hook.fetch_data.side_effect = ConnectionError("API down")

        operator = MyCustomOperator(task_id="test", api_conn_id="test_conn")

        with pytest.raises(ConnectionError):
            operator.execute(mock_context)
```

### AI-Generated Code Warning

AI assistants often catch all exceptions indiscriminately and return mock/default data. This causes tasks to succeed silently when they should fail. **Always review exception handling** — let tasks fail so Airflow can retry.

```python
# BAD — AI-generated anti-pattern
@task()
def fetch():
    try:
        return api.get_data()
    except Exception:
        return []  # Silent failure! Downstream tasks get empty data

# GOOD — let Airflow handle retries
@task(retries=3)
def fetch():
    return api.get_data()  # Raises on failure → Airflow retries
```

## Integration Tests

Test custom code interacting with real external systems. **No mocking** — if the API is down, tests fail (that's the point).

```python
def test_operator_selects_correct_data(mock_context):
    """Integration test — calls real API method, not mocked."""
    operator = MyOperator(
        task_id="test",
        source="real_table",
    )
    result = operator.execute(mock_context)

    assert len(result["records"]) > 0
    assert all("id" in r for r in result["records"])
```

### Canary DAGs

Deploy simple health-check DAGs that regularly test integrations:

```python
@dag(dag_id="canary_postgres", schedule="*/30 * * * *", ...)
def canary_postgres():
    @task()
    def check_connection():
        hook = PostgresHook(postgres_conn_id="prod_postgres")
        hook.run("SELECT 1")

    check_connection()
```

## Cluster Policies

Environment-level enforcement via `@hookimpl`. Policies can modify or reject DAGs at deployment time.

### Reject DAGs with Dev Tags in Production

```python
# plugins/cluster_policies/policies.py
from airflow.policies import hookimpl
from airflow.exceptions import AirflowClusterPolicyViolation


@hookimpl
def dag_policy(dag):
    if "dev" in (dag.tags or []):
        raise AirflowClusterPolicyViolation(
            f"DAG {dag.dag_id} has 'dev' tag — cannot run in production."
        )
```

### Enforce Task Retries

```python
@hookimpl
def task_policy(task):
    if task.retries is None or task.retries == 0:
        task.retries = 2
```

### Enforce Max Active Tasks

```python
@hookimpl
def dag_policy(dag):
    dag.max_active_tasks = min(dag.max_active_tasks or 16, 10)
```

### Installation

```
plugins/
  cluster_policies/
    __init__.py
    policies.py
    pyproject.toml
```

`pyproject.toml`:
```toml
[project]
name = "cluster-policies"
version = "1.0.0"

[project.entry-points.'airflow.policy']
cluster_policies = "cluster_policies.policies"
```

Install in Dockerfile: `COPY plugins/ /opt/airflow/plugins/` + `pip install -e /opt/airflow/plugins/cluster_policies/`

## CI/CD Integration

### GitHub Actions

```yaml
name: Airflow CI
on:
  push:
    branches: [main, staging, dev]
  pull_request:
    branches: [main, staging]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Astro CLI
        run: curl -sSL install.astronomer.io | sudo bash -s

      - name: Parse DAGs
        run: astro dev parse

      - name: Run Tests
        run: astro dev pytest tests/ --args "--cov --cov-report=term"
```

### Test at Every Stage

| Stage | What to Run |
|-------|------------|
| Local development | `dag.test()`, `astro dev pytest` |
| Feature branch push | `astro dev parse` + `astro dev pytest` |
| Pull request | Full test suite + coverage |
| Pre-merge (staging) | Integration tests against staging env |
| Post-deploy | Canary DAGs verify production health |

## Test Project Structure

```
tests/
  conftest.py                  # Shared fixtures
  dag_validation/
    conftest.py                # DagBag helpers (get_dags, get_import_errors)
    test_dag_structure.py      # Import errors, tags, operators, timeouts
  unit_tests/
    test_transformations.py    # Custom function tests
    test_custom_operators.py   # Custom operator tests with mocking
  integration_tests/
    test_api_integration.py    # Real API tests (no mocking)
    test_db_integration.py     # Real database tests
```

Run: `astro dev pytest` or `pytest tests/`
