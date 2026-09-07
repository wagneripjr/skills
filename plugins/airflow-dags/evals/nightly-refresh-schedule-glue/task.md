# Our nightly basket refresh keeps breaking when the upstream job runs late

Marrowfield Grocers runs three Apache Airflow 3 pipelines every night. They are glued together with
clock offsets and a long wait, and the glue keeps coming apart. Twice this month the downstream
pipeline published a dashboard built on the previous day's numbers, and nobody noticed until a
category manager did.

Rewrite all three so the chain is driven by the data rather than by the clock, and so a late
upstream run degrades into a late downstream run instead of a wrong one.

## How it works today

**1. `ingest_pos_events`** — starts at 01:00, pulls the previous day's point-of-sale events from our
till vendor, and writes one Parquet object to `s3://marrowfield-lake/pos/events/<business_date>/`.
Runtime is normally 20 minutes but has gone past four hours when the vendor is slow. This is the
only pipeline in the chain that is genuinely tied to a wall clock — the vendor does not open the
export window until 01:00.

**2. `build_basket_features`** — starts at 02:30 and is where most of the pain is:

- Its first task waits for the ingest output to appear, polling S3 every 30 seconds for up to six
  hours. On slow-vendor nights this one task sits there for four hours.
- Then it reads the whole Parquet file into a pandas DataFrame, converts it to a list of dicts, and
  returns it from the task so the next task can receive it. That is around 400 MB most nights.
- The transform step writes its intermediate output to `/tmp/marrowfield/basket/` and the load step
  reads it back from there. This works most of the time and mysteriously fails the rest of the time.
- It builds its S3 client with `boto3.client("s3")` reading `AWS_ACCESS_KEY_ID` from the worker
  environment, and calls our internal FX service with `requests.get("http://fx.internal/rates")`
  wrapped in `try: ... except Exception: return []` so that "a flaky rate service can't fail the
  pipeline".
- At the top of the file, outside any function, it does
  `SETTINGS = requests.get("http://config.internal/marrowfield/basket").json()` to pick up the
  category weightings. Our config team says that endpoint is getting hammered.
- `start_date=datetime.now()`, no retries, no timeouts. Its single `build` task does the extract,
  the transform and the load in one function.
- The feature table it writes is partitioned by **business date**, and the whole pipeline has to
  know which business date it is building. Today it derives that from its own 02:30 run time.

**3. `publish_dashboards`** — starts at 04:00 and "should be safe by then". It reads the feature
table for a business date and refreshes the BI extracts. It has the same missing retries and
timeouts, and it also derives the business date from its own run time.

## What we want

- The chain must fire off real data readiness. If ingest finishes at 06:00, the feature build starts
  at 06:00 and the dashboards follow it — no clock offsets left between the three.
- Every pipeline must be able to state which business date it is processing, and get that answer
  from the same place the rest of the chain got it, not from its own start time.
- Reruns must be safe: running any of the three twice for the same business date must leave exactly
  the same result as running it once.
- If the FX service is down, we want to know. Right now we get a green run and empty features.

## Constraints

- Nothing is installed and there is no network here. Do not try to install Airflow, parse a DAG, or
  run anything — you are judged on the files you write.
- Credentials must not be read from worker environment variables. We have connections configured
  under the ids `aws_default`, `fx_internal` and `config_internal`; use them.
- Keep the three pipelines as three pipelines. Do not merge them into one.

## Output Specification

Write these files into the working directory:

- **`dags/ingest_pos_events.py`**
- **`dags/build_basket_features.py`**
- **`dags/publish_dashboards.py`**
- **`DESIGN-NOTES.md`** — explain how the three pipelines are now wired together, how the business
  date travels along the chain, and what stops the chain from triggering itself in a loop.
