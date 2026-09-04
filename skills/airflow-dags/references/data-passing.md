# Data Passing (XCom)

## Contents
- [TaskFlow Automatic XCom](#taskflow-automatic-xcom)
- [Manual XCom](#manual-xcom)
- [Default Backend Limits](#default-backend-limits)
- [Custom XCom Backends](#custom-xcom-backends)
- [Object Storage XCom Backend](#object-storage-xcom-backend)
- [When to Use XCom vs External Storage](#when-to-use-xcom-vs-external-storage)
- [Airflow Object Storage Abstraction](#airflow-object-storage-abstraction)

## TaskFlow Automatic XCom

With `@task` decorators, return values are automatically pushed to XCom. Passing one task's output as another's argument creates the dependency AND passes data.

```python
@task()
def extract() -> list[dict]:
    return [{"id": 1}, {"id": 2}]

@task()
def transform(data: list[dict]) -> list[dict]:
    return [d for d in data if d["id"] > 1]

# Automatic: extract's return value → transform's data parameter
raw = extract()
filtered = transform(raw)
```

No `xcom_push` or `xcom_pull` needed. This is the recommended approach.

### Returning Multiple Values

```python
@task(multiple_outputs=True)
def extract() -> dict:
    return {"users": [...], "orders": [...]}

@task()
def process_users(users: list):
    pass

@task()
def process_orders(orders: list):
    pass

data = extract()
process_users(data["users"])
process_orders(data["orders"])
```

## Manual XCom

For traditional operators or when you need explicit control:

### Push

```python
def my_task(**context):
    ti = context["ti"]
    ti.xcom_push(key="my_key", value={"result": 42})
```

### Pull

```python
def downstream_task(**context):
    ti = context["ti"]
    # Pull by task_id (default key: "return_value")
    data = ti.xcom_pull(task_ids="my_task")

    # Pull by specific key
    data = ti.xcom_pull(task_ids="my_task", key="my_key")
```

### Jinja Template

```python
BashOperator(
    task_id="use_xcom",
    bash_command='echo "{{ ti.xcom_pull(task_ids="extract") }}"',
)
```

## Default Backend Limits

XCom stores data in the Airflow metadata database by default.

| Database | Max Size |
|----------|----------|
| PostgreSQL | 1 GB |
| MySQL | 64 MB |
| SQLite | 2 GB |

**Supported types**: JSON-serializable objects, pandas DataFrame, Delta Lake, Apache Iceberg.

**Warning**: Storing large data in the metadata DB degrades Airflow performance. Use a custom backend for data > 1 MB.

## Custom XCom Backends

Store data in external systems (S3, GCS, Azure Blob). The metadata DB only stores a reference URI.

### Benefits

- No size limits
- No type restrictions
- Metadata DB stays small and fast
- Data accessible outside Airflow

### Implementation

Create a class inheriting from `BaseXCom`:

```python
from airflow.models.xcom import BaseXCom

class S3XComBackend(BaseXCom):
    @staticmethod
    def serialize_value(value, *, key=None, task_id=None, dag_id=None, run_id=None, map_index=None):
        # Upload to S3, return reference
        s3_key = f"xcom/{dag_id}/{task_id}/{run_id}/{key}"
        # ... upload logic ...
        return s3_key

    @staticmethod
    def deserialize_value(result):
        # Download from S3
        # ... download logic ...
        return data
```

Configure: `AIRFLOW__CORE__XCOM_BACKEND=my_module.S3XComBackend`

## Object Storage XCom Backend

The easiest way to set up a custom backend — built into Airflow providers.

### Setup

```bash
# Environment variables
AIRFLOW__CORE__XCOM_BACKEND=airflow.providers.common.io.xcom.backend.XComObjectStorageBackend
AIRFLOW__COMMON_IO__XCOM_OBJECTSTORAGE_PATH=s3://my-bucket/xcom/
AIRFLOW__COMMON_IO__XCOM_OBJECTSTORAGE_THRESHOLD=1000  # bytes
```

- Data smaller than threshold stays in metadata DB
- Data larger than threshold goes to object storage
- Transparent — no code changes needed in DAGs

### Supported Storage

| Provider | Path Format |
|----------|------------|
| AWS S3 | `s3://bucket/prefix/` |
| Google GCS | `gs://bucket/prefix/` |
| Azure Blob | `wasb://container@account/prefix/` |

Requires the corresponding provider package installed.

## When to Use XCom vs External Storage

| Data Size | Approach |
|-----------|----------|
| < 1 KB (task IDs, counts, flags) | Default XCom |
| 1 KB - 1 MB (small JSON, configs) | Default XCom or Object Storage backend |
| 1 MB - 1 GB (datasets, files) | Object Storage XCom backend |
| > 1 GB (large datasets) | Direct external storage (S3/GCS), pass path via XCom |

**Rule of thumb**: If data is too large to comfortably store in a database column, use an external backend. Pass the storage path/URI through XCom instead of the data itself.

```python
# GOOD: Large data → external storage, path via XCom
@task()
def extract() -> str:
    df = fetch_large_dataset()
    path = "s3://bucket/staging/data.parquet"
    df.to_parquet(path)
    return path  # Only the path goes through XCom

@task()
def transform(path: str) -> str:
    df = pd.read_parquet(path)
    output = "s3://bucket/staging/transformed.parquet"
    df.to_parquet(output)
    return output
```

**Never store data on local filesystem** — tasks may run on different workers. Always use cloud storage (S3, GCS, Azure Blob) or shared network filesystems.

## Airflow Object Storage Abstraction

Beyond XCom, Airflow provides a universal file I/O abstraction via `ObjectStoragePath`. Write DAG code once, deploy to any storage backend.

### Universal Path Syntax

| Provider | Path Format | Package |
|----------|------------|---------|
| Local filesystem | `file:///path/to/data` | Built-in |
| AWS S3 | `s3://bucket/prefix/` | `apache-airflow-providers-amazon[s3fs]` |
| Google GCS | `gs://bucket/prefix/` | `apache-airflow-providers-google[gcs]` |
| Azure Blob | `wasb://container@account/` | `apache-airflow-providers-microsoft-azure` |

### Usage in DAG Code

```python
from airflow.io.path import ObjectStoragePath

base = ObjectStoragePath("s3://my-bucket/data/", conn_id="aws_default")


@task()
def write_output(records: list[dict], **context) -> str:
    ds = context["ds"]
    path = base / f"daily/{ds}/output.json"
    path.write_text(json.dumps(records))
    return str(path)


@task()
def read_output(path_str: str) -> list[dict]:
    path = ObjectStoragePath(path_str, conn_id="aws_default")
    return json.loads(path.read_text())
```

### Write Once, Deploy Anywhere

Use environment variables to switch storage backends without changing DAG code:

```python
import os

STORAGE_BASE = os.environ.get("OBJECT_STORAGE_BASE", "file:///tmp/airflow/data")
STORAGE_CONN = os.environ.get("OBJECT_STORAGE_CONN_ID", None)

base = ObjectStoragePath(STORAGE_BASE, conn_id=STORAGE_CONN)
```

- Local dev: `OBJECT_STORAGE_BASE=file:///tmp/airflow/data`
- Staging: `OBJECT_STORAGE_BASE=s3://staging-bucket/data`
- Production: `OBJECT_STORAGE_BASE=s3://prod-bucket/data`

### Object Storage vs XCom Backend

| Use Case | Mechanism |
|----------|-----------|
| Pass small data between tasks | XCom (default or Object Storage backend) |
| Read/write files in DAG logic | `ObjectStoragePath` |
| Store large intermediate data | `ObjectStoragePath`, pass path via XCom |
| Transparent hybrid storage | Object Storage XCom Backend (auto-routes by size) |

`ObjectStoragePath` is for general file I/O. The Object Storage XCom Backend is specifically for transparent XCom data offloading.
