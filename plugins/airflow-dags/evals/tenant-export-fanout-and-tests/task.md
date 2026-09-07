# Stop copy-pasting tenant pipelines, and give us a safety net

Halberd Analytics runs a nightly regional export for every tenant on our Apache Airflow 3 platform.
We are at 41 tenants and the way we got here does not survive number 42.

## What we have

There are 41 near-identical files in `dags/`, one per tenant, produced by copying
`dags/export_acme.py` and editing four strings. Every file looks like this:

```python
from datetime import datetime
from airflow.decorators import dag, task

@dag(dag_id="export_acme", schedule="0 2 * * *", start_date=datetime(2024, 1, 1), catchup=False)
def export_acme():

    @task()
    def export_all_regions():
        regions = fetch_enabled_regions("acme")     # hits our tenancy API
        results = []
        for region in regions:
            try:
                results.append(push_region_extract("acme", region, "s3://halberd-exports/acme/"))
            except Exception as exc:
                print(f"region {region} failed: {exc}")
        return results

    export_all_regions()

export_acme()
```

`fetch_enabled_regions` and `push_region_extract` are our own functions. Everything hurts:

- **The per-tenant files.** Last month someone fixed a bug in eleven of them and missed thirty. Two
  more were deployed with a typo in the decorator and simply never appeared in the UI; we found out
  three weeks later when a tenant asked where their extracts were.
- **The single export task.** A tenant has anywhere from 2 to 60 enabled regions and the number
  changes between runs — a region is enabled or disabled from a self-service console during the day.
  When region 47 of 60 fails, the whole task is red, the Airflow UI shows us one box, and rerunning
  it re-pushes the 46 extracts that already succeeded. We want one retryable unit of work per region,
  and we want the box in the UI to say which region it is rather than a number.
- **The `except Exception` in the loop.** It is the reason a failed export looks like a successful
  run. We want failures to be failures.
- **The tenancy API.** It rate-limits us at 5 concurrent calls per tenant. Today the single task
  hides this; once each region is its own unit of work, it will not.
- **No tests at all.** We want CI to catch a DAG that does not import, one with no tags, and one
  whose tasks have no execution timeout, before it ever reaches the scheduler.

## The tenants

Tenants differ in more than a name — they are on different schedules, owned by different squads, and
support asks us to pause a single tenant's pipeline without touching the other 40. Here are four
representative entries; assume the real file has 41 of them.

| tenant_id | schedule    | owner        | export_bucket                  | extract_format |
|-----------|-------------|--------------|--------------------------------|----------------|
| acme      | 0 2 * * *   | squad-atlas  | s3://halberd-exports/acme/     | parquet        |
| borealis  | 0 4 * * *   | squad-atlas  | s3://halberd-exports/borealis/ | csv            |
| cindermill| 30 1 * * 1  | squad-vega   | s3://cindermill-outbound/      | parquet        |
| dunbarrow | 0 */6 * * * | squad-vega   | s3://halberd-exports/dunbarrow/| csv            |

The business rule we keep getting wrong by hand, and which we want covered by tests: an export
filename is `<tenant_id>-<region>-<business_date>.<extract_format>`, where `region` is lowercased and
any spaces become hyphens; a region that is an empty string is a configuration error and must raise;
and a tenant with no enabled regions at all is a legitimate no-op, not an error.

## Constraints

- Nothing is installed and there is no network here. Do not try to install Airflow, run pytest, or
  parse a DAG — you are judged on the files you write.
- Keep `fetch_enabled_regions` and `push_region_extract` as the functions that talk to the outside
  world. You are not reimplementing them, only calling them.
- Every tenant keeps its own schedule, its own owner, and the ability to be paused on its own.

## Output Specification

Write these files into the working directory:

- **`dags/tenant_exports.py`** — the one file that produces every tenant's pipeline, with the four
  tenants above written out in it.
- **`include/export_rules.py`** — the filename rule described above, as a pure function.
- **`tests/dag_validation/test_dag_structure.py`** — the CI safety net.
- **`tests/unit_tests/test_export_rules.py`** — tests for `include/export_rules.py`.
- **`NOTES.md`** — a short explanation of how one file now produces 41 independently schedulable
  pipelines, and how the per-region work is created when the number of regions is not known until
  the pipeline is already running.
