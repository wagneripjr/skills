# Production Operations

## Contents
- [DAG Versioning](#dag-versioning)
- [DAG Bundles](#dag-bundles)
- [Scaling Configuration](#scaling-configuration)
- [Callbacks & Notifications](#callbacks--notifications)
- [Executor Impact on DAG Authoring](#executor-impact-on-dag-authoring)
- [Debugging](#debugging)
- [Monitoring](#monitoring)

## DAG Versioning

Automatic in Airflow 3. No setup needed. A new version is created when a structural change occurs.

### What Creates a New Version

- Task/DAG parameter changes
- Task dependency changes
- Task IDs added or removed

### Versioned vs Unversioned Behavior

| Scenario | Unversioned (LocalDagBundle) | Versioned (GitDagBundle) |
|----------|------------------------------|--------------------------|
| Clear & rerun task | Uses latest code | Uses original version's code |
| Rerun single task | Uses latest code | Uses original version's code |
| Code change mid-run | Uses new code immediately | Finishes with original version |
| Each structural change | DAG version created | DAG version + bundle version |

### Rerun Behavior by Bundle Type

| Action | LocalDagBundle (unversioned) | GitDagBundle (versioned) |
|--------|---------------------------|------------------------|
| New DAG run | Uses current code | Uses current code |
| View previous run | Shows original version | Shows original version |
| Rerun entire DAG run | Uses **current** code | Uses **original bundle** code |
| Rerun single task | Uses **current** code | Uses **original bundle** code |
| Code changes mid-run | Running tasks use **new** code | Running tasks use **bundle** code |

**Key difference**: With GitDagBundle, reruns reproduce original behavior. With LocalDagBundle, reruns use whatever code is deployed now. Use GitDagBundle in production for reproducibility.

### Benefits

- No task history loss when removing/renaming tasks
- No version collisions during code pushes
- Tasks use consistent DAG version throughout a run
- Previous versions viewable in Airflow UI

## DAG Bundles

A bundle is a collection of DAG code + supporting files. Two types:

### LocalDagBundle (Default)

- Not versioned
- Reads from local filesystem
- Default for development

### GitDagBundle (Recommended for Production)

- Versioned — pulls from Git repository
- Automatic version tracking
- Consistent code across DAG run

### Setup GitDagBundle

1. Push DAGs to GitHub repository
2. Install git: add `git` to `packages.txt`
3. Install Git provider: `apache-airflow-providers-git`
4. Create Git connection in Airflow
5. Configure bundle:

```bash
AIRFLOW__DAG_PROCESSOR__DAG_BUNDLE_CONFIG_LIST='[
  {
    "name": "my_dags",
    "classpath": "airflow.providers.git.bundles.git.GitDagBundle",
    "kwargs": {
      "tracking_ref": "main",
      "git_conn_id": "my_git_conn"
    }
  }
]'
```

## Scaling Configuration

### Environment Level (All DAGs)

| Setting | Purpose | Default |
|---------|---------|---------|
| `AIRFLOW__CORE__PARALLELISM` | Max concurrent tasks globally | 32 |
| `AIRFLOW__CORE__MAX_ACTIVE_TASKS_PER_DAG` | Per-DAG concurrent task limit | 16 |
| `AIRFLOW__CORE__MAX_ACTIVE_RUNS_PER_DAG` | Concurrent DAG runs per DAG | 16 |
| `AIRFLOW__CORE__DAGBAG_IMPORT_TIMEOUT` | DAG file parse timeout | 30s |
| `AIRFLOW__SCHEDULER__MIN_FILE_PROCESS_INTERVAL` | Min seconds between file parses | 30s |
| `AIRFLOW__SCHEDULER__SCHEDULER_HEARTBEAT_SEC` | Scheduler loop frequency | 5s |
| `AIRFLOW__DAG_PROCESSOR__DAG_FILE_PROCESSOR_TIMEOUT` | Timeout per DAG file parse | 50s |
| `AIRFLOW__DAG_PROCESSOR__PARSING_PROCESSES` | Parallel DAG parsing processes | 2 |

### DAG Level

```python
@dag(
    max_active_runs=3,                   # Max concurrent runs of this DAG
    max_active_tasks=8,                  # Max parallel tasks per run
    max_consecutive_failed_dag_runs=5,   # Auto-disable after 5 consecutive failures
    dagrun_timeout=timedelta(hours=2),   # Fail entire run if exceeds 2 hours
)
```

### Task Level

```python
@task(
    pool="database_pool",           # Limit concurrent DB tasks
    max_active_tis_per_dag=2,       # Max 2 instances of this task across all runs
    execution_timeout=timedelta(minutes=30),
)
```

### Pools

Limit concurrent access to shared resources (databases, APIs):

```python
# Create pool via UI: Admin → Pools
# Or via CLI:
# airflow pools set database_pool 5 "Max 5 concurrent DB connections"

@task(pool="database_pool")
def query_db():
    pass  # Only 5 of these run concurrently across all DAGs
```

## Callbacks & Notifications

### Callback Types

| Callback | Level | When |
|----------|-------|------|
| `on_success_callback` | DAG + Task | Succeeded |
| `on_failure_callback` | DAG + Task | Failed |
| `on_skipped_callback` | Task only | Skipped |
| `on_execute_callback` | Task only | Before execution starts |
| `on_retry_callback` | Task only | Being retried |

### Usage

```python
from airflow.providers.slack.notifications.slack import SlackNotifier


def alert_on_failure(context):
    """Custom failure callback."""
    dag_id = context["dag"].dag_id
    task_id = context["task_instance"].task_id
    log_url = context["task_instance"].log_url
    print(f"ALERT: {dag_id}.{task_id} failed! Logs: {log_url}")


@dag(
    on_failure_callback=alert_on_failure,
    # Or use built-in notifiers:
    # on_failure_callback=SlackNotifier(
    #     slack_conn_id="slack_default",
    #     text="DAG {{ dag.dag_id }} failed!",
    #     channel="#alerts",
    # ),
)
def my_dag():
    ...
```

### Context Available in Callbacks

| Key | Type | Description |
|-----|------|-------------|
| `dag` | DAG | DAG object |
| `dag_run` | DagRun | Current DAG run |
| `task_instance` / `ti` | TaskInstance | Task instance |
| `logical_date` | datetime | Scheduled datetime |
| `ds` | str | Date string (YYYY-MM-DD) |
| `exception` | Exception | Error (failure callbacks) |

### Set via default_args

```python
@dag(
    default_args={
        "on_failure_callback": alert_on_failure,
        "on_retry_callback": log_retry,
    },
)
```

## Executor Impact on DAG Authoring

The executor determines how and where tasks run. Your choice affects how you write DAG code.

| Executor | Task Isolation | When to Use | DAG Code Impact |
|----------|---------------|-------------|-----------------|
| `LocalExecutor` | Process-level | Development, small production | Default — no special config needed |
| `CeleryExecutor` | Process on shared workers | Production, steady workloads | Pool management critical for shared resources |
| `KubernetesExecutor` | Pod-level (full isolation) | Production, heterogeneous tasks | Use `executor_config` for resource requests |
| `EdgeExecutor` | Remote worker | Hybrid/edge deployments | Consider network latency for data-heavy tasks |

### KubernetesExecutor: Resource Requests

Each task runs in its own Kubernetes pod. Specify resources per task:

```python
@task(
    executor_config={
        "pod_override": k8s.V1Pod(
            spec=k8s.V1PodSpec(
                containers=[
                    k8s.V1Container(
                        name="base",
                        resources=k8s.V1ResourceRequirements(
                            requests={"memory": "512Mi", "cpu": "250m"},
                            limits={"memory": "1Gi", "cpu": "500m"},
                        ),
                    )
                ]
            )
        )
    }
)
def heavy_transform():
    ...
```

### CeleryExecutor: Pool Management

Tasks share worker processes. Use pools to prevent resource contention:

```python
# Limit concurrent database connections across all DAGs
@task(pool="database_pool")
def query_warehouse():
    ...

# Limit concurrent API calls
@task(pool="api_rate_limit", pool_slots=2)  # Uses 2 slots per instance
def call_external_api():
    ...
```

### Choosing an Executor

- **Most teams**: Start with `CeleryExecutor` — good balance of isolation and simplicity
- **Need per-task resources**: `KubernetesExecutor` — different tasks need different CPU/memory
- **Multiple executors**: Airflow 3 supports running multiple executors — use `KubernetesExecutor` for heavy tasks and `CeleryExecutor` for lightweight ones

## Debugging

### DAGs Don't Appear in UI

1. Check import errors: `astro dev run dags list-import-errors` or `airflow dags list-import-errors`
2. Ensure `dag_id` is unique across all files
3. Ensure `@dag` function is called at module level
4. Wait for refresh interval (default 5 min for new files, 30s for changes)
5. Check file is in the DAGs folder
6. Verify no circular imports

### DAGs Not Running

1. DAG must be **unpaused** in UI
2. `start_date` must be in the past (never `datetime.now()`)
3. Scheduler must be running: `astro dev logs -s`
4. Test manually: `astro dev dags test <dag_id>`
5. Check `start_date` < current date

### Tasks Not Running

1. Check `depends_on_past` — if True, previous run must have succeeded
2. Verify task dependencies are correct
3. Check scheduling parameters haven't exhausted limits
4. Monitor `max_active_tasks`, pool slots, `PARALLELISM`
5. Ensure task function is called within `@dag` function

### Logs Missing

1. Rerun the task to collect logs
2. Increase `log_fetch_timeout_sec`
3. Increase worker resources (memory/CPU)
4. For K8s: pod may spin down before logs are collected
5. Configure remote log storage (S3, GCS)

### Connections Failing

1. Verify connection is defined: `airflow connections list`
2. Test connection: `airflow connections test <conn_id>`
3. Check provider package is installed
4. Test credentials directly in external tool
5. Check connection type matches provider
6. Verify `extra` JSON is valid

### Structured Debugging Approach

1. Is the problem in Airflow or the external system?
2. Check Airflow component logs (scheduler, webserver, worker)
3. Verify file access and permissions
4. Check connections and credentials
5. Is the issue all DAGs or one specific DAG?
6. Can you collect task logs?
7. Check Airflow and provider versions
8. Reproduce locally with `astro dev start`

## Monitoring

### Prometheus Metrics

Airflow exposes metrics at `/metrics` endpoint. Key metrics:

| Metric | What It Tells You |
|--------|------------------|
| `scheduler_heartbeat` | Scheduler is alive |
| `dag_processing.total_parse_time` | DAG parsing performance |
| `task_instance_created` | Task creation rate |
| `task_instance_successes` | Success rate |
| `task_instance_failures` | Failure rate |
| `executor.queued_tasks` | Queue depth |
| `executor.running_tasks` | Active tasks |

### Grafana Dashboards

Use the community Airflow Grafana dashboard or build custom dashboards tracking:

- Scheduler health and heartbeat
- Task success/failure rates over time
- Executor queue depth trends
- DAG parsing times
- Pool utilization

### Key Health Indicators

| Indicator | Healthy | Warning |
|-----------|---------|---------|
| Scheduler heartbeat | Regular interval | Missing beats |
| Parse time per DAG | < 30s | > 30s |
| Task queue depth | Stable | Growing |
| Failure rate | < 5% | > 10% |
| DAG run duration | Within SLA | Exceeding dagrun_timeout |
