# Get the freight rollup running again after the platform upgrade

Kettlebridge Logistics moved its Apache Airflow deployment from 2.7 to 3.0 over the weekend. Since
the cutover our `freight_daily_rollup` pipeline has been broken and nobody on the team has worked
on 3.x before. Here is everything we know and everything we have.

## What broke

1. The DAG does not appear in the UI at all any more — the DAG processor logs an import error.
2. Before the upgrade, deploying the DAG after an outage would replay every missed day on its own.
   Our other, already-fixed pipelines no longer do that, and we still need the replay behaviour here.
3. Our rollup slices the shipment table on a **window**: every run must process exactly the 24 hours
   preceding its 03:00 trigger. In 2.7 the two context timestamps we use gave us that window. On the
   pipelines we have already patched by hand, those two timestamps now come back **identical**, so
   the window is zero-width and the rollup writes an empty partition. We need the window back.
4. Our `.airflowignore` has the single line `test_.*\.py` in it. Since the upgrade the DAG processor
   is trying to parse our test files.

## The pipeline, exactly as it is on disk today

`dags/freight_daily_rollup.py`:

```python
from datetime import timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator
from airflow.operators.subdag import SubDagOperator
from airflow.utils.dates import days_ago

from freight.subdags import build_carrier_subdag

default_args = {
    "owner": "data-eng",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "sla": timedelta(hours=3),
}


def load_rollup(**context):
    window_start = context["execution_date"]
    window_end = context["next_execution_date"]
    replaying = context["dag_run"].is_backfill
    warehouse = context["conf"].get("kettlebridge", "warehouse_schema")
    # ... writes one partition covering [window_start, window_end) ...


def send_summary(**context):
    # ... posts the run summary to the ops channel ...
    ...


with DAG(
    dag_id="freight_daily_rollup",
    schedule_interval="0 3 * * *",
    start_date=days_ago(30),
    default_args=default_args,
    fail_stop=True,
    max_active_tasks=8,
    tags=["freight"],
) as dag:

    extract = BashOperator(
        task_id="extract_manifests",
        bash_command="python /opt/kettlebridge/pull_manifests.py --date {{ execution_date | ds }}",
    )

    carriers = SubDagOperator(
        task_id="carriers",
        subdag=build_carrier_subdag("freight_daily_rollup", "carriers", default_args),
    )

    load = PythonOperator(
        task_id="load_rollup",
        python_callable=load_rollup,
        trigger_rule="none_failed_or_skipped",
    )

    notify = PythonOperator(
        task_id="notify_ops",
        python_callable=send_summary,
        trigger_rule="dummy",
    )

    extract >> carriers >> load >> notify
```

`freight/subdags.py`:

```python
from airflow import DAG
from airflow.operators.python import PythonOperator

from freight.carriers import normalize, dedupe, score_on_time


def build_carrier_subdag(parent_dag_id, child_dag_id, args):
    subdag = DAG(
        dag_id=f"{parent_dag_id}.{child_dag_id}",
        default_args=args,
        schedule_interval="@daily",
    )
    with subdag:
        normalize_task = PythonOperator(task_id="normalize_carrier_codes", python_callable=normalize)
        dedupe_task = PythonOperator(task_id="dedupe_shipments", python_callable=dedupe)
        score_task = PythonOperator(task_id="score_on_time", python_callable=score_on_time)
        normalize_task >> dedupe_task >> score_task
    return subdag
```

`normalize`, `dedupe`, `score_on_time`, `load_rollup` and `send_summary` are our own functions in
`freight/` — their bodies are unchanged by this work and you do not need them. Keep importing them.

## Constraints

- Nothing is installed and there is no network here. Do not try to install Airflow, parse the DAG,
  or run anything. This is a code-and-notes exercise; you are judged on the files you write.
- The three carrier steps must keep their task ids and their order.
- We want one pipeline, not two. Do not solve the nested-workflow problem by adding a second
  scheduled DAG that the first one triggers.

## Output Specification

Write these files into the working directory:

- **`dags/freight_daily_rollup.py`** — the whole pipeline, working on 3.0, including whatever
  replaces the nested workflow. One file.
- **`requirements.txt`** — every package we now have to install explicitly for this DAG to import.
  One requirement per line, no version pins needed.
- **`.airflowignore`** — the corrected file.
- **`UPGRADE-NOTES.md`** — a table with one row per change you made: what it was before, what it is
  now, and why the change was required. A reviewer who has also never used 3.x must be able to
  check your work from this table alone.
