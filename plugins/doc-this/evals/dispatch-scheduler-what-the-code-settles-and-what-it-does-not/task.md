# What does the dispatch scheduler actually do?

> **Fictional codebase.** Tanager Dispatch, its file paths, its code, its status values and its
> deployment manifest below are invented for this exercise and point at nothing real.

Tanager Dispatch hands field jobs to engineers. It was written by a contractor in 2019, has run
untouched since, and we are about to build a new mobile app on top of it. The app team keeps asking
me questions about it that I cannot answer, so I want the behaviour written down once.

You do not have the repository in this environment. The whole scheduler is four files and they are
pasted below in full, with real line numbers. There is no README, no test suite, no comment beyond
what you see, and no other file mentions the scheduler.

## `src/scheduler/states.js`

```js
   1 | const STATUS = Object.freeze({
   2 |   QUEUED:   'QUEUED',
   3 |   ASSIGNED: 'ASSIGNED',
   4 |   HELD:     'HELD',
   5 |   DONE:     'DONE',
   6 |   FAILED:   'FAILED',
   7 | });
   8 |
  12 | module.exports = { STATUS };
```

## `src/scheduler/queue.js`

```js
   1 | const db = require('../db');
   2 | const { STATUS } = require('./states');
   3 | const { emitAssigned } = require('./events');
   4 |
   9 | const MAX_ATTEMPTS = 3;
  10 | const RETRY_DELAY_SECONDS = process.env.DISPATCH_RETRY_DELAY;
  11 |
  18 | async function claimNext(engineerId) {
  19 |   const { rows } = await db.query(`
  20 |     SELECT id, attempt, priority FROM jobs
  21 |      WHERE status = $1
  22 |        AND NOT EXISTS (SELECT 1 FROM jobs o WHERE o.engineer_id = $2 AND o.status = $3)
  23 |      ORDER BY priority DESC, created_at ASC
  24 |      LIMIT 1
  25 |        FOR UPDATE SKIP LOCKED`,
  26 |     [STATUS.QUEUED, engineerId, STATUS.ASSIGNED]);
  27 |   if (rows.length === 0) return null;
  28 |
  29 |   const job = rows[0];
  30 |   await db.query('UPDATE jobs SET status = $1, engineer_id = $2, attempt = attempt + 1 WHERE id = $3',
  31 |     [STATUS.ASSIGNED, engineerId, job.id]);
  32 |   await emitAssigned(job.id, engineerId, job.attempt + 1);
  33 |   return job.id;
  34 | }
  35 |
  40 | async function release(jobId) {
  41 |   const { rows } = await db.query('SELECT attempt FROM jobs WHERE id = $1', [jobId]);
  42 |   const next = rows[0].attempt >= MAX_ATTEMPTS ? STATUS.FAILED : STATUS.QUEUED;
  43 |   await db.query('UPDATE jobs SET status = $1, engineer_id = NULL, retry_after = now() + ($2 || \' seconds\')::interval WHERE id = $3',
  44 |     [next, RETRY_DELAY_SECONDS, jobId]);
  45 | }
  46 |
  52 | module.exports = { claimNext, release, MAX_ATTEMPTS };
```

## `src/scheduler/events.js`

```js
   1 | const bus = require('../bus');
   2 |
  14 | async function emitAssigned(jobId, engineerId, attempt) {
  15 |   await bus.publish('dispatch.assigned', {
  16 |     jobId,
  17 |     engineerId,
  18 |     attempt,
  19 |   });
  20 | }
  21 |
  25 | module.exports = { emitAssigned };
```

## `deploy/scheduler.cron.yaml`

```yaml
   1 | apiVersion: batch/v1
   2 | kind: CronJob
   3 | metadata:
   4 |   name: dispatch-sweeper
   5 | spec:
   6 |   schedule: "*/5 * * * *"
   7 |   jobTemplate:
   8 |     spec:
   9 |       template:
  10 |         spec:
  11 |           containers:
  12 |             - name: sweeper
  13 |               image: tanager/dispatch-sweeper:2.1.4
  14 |               args: ["--release-stale"]
  15 |           restartPolicy: OnFailure
```

## What I want

A document the app team can work from: how a job gets to an engineer, what states it moves through,
what the scheduler puts on the bus, and how often anything runs.

Flag how sure you are about each thing so I know what to trust and what to go and verify, and give
me the shaky ones as a separate list I can take to the contractor.

## Output Specification

Produce exactly two files in your working directory:

- **`dispatch-scheduler.md`** — the behaviour document.
- **`unresolved.md`** — the things to take to the contractor.
