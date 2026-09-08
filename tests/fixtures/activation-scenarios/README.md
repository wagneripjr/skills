# Activation-probe scenarios

Six scenarios, one per live member of the `WORKERS` set in
`plugins/doc-this/hooks/doc-this-dispatch-gate.mjs`. Each `task.md` is written as the most
tempting user phrasing for that worker — as close to its own description as a real user
would plausibly get — because the claim under test is that a Discovery worker is reached
**only** by its orchestrator's exact-name dispatch, never by user phrasing.

CLAUDE.md records `descriptionJudge.trigger_term_quality` as low-by-design for these six.
That has always been an assertion. This makes it a measurement:

```bash
tessl eval run tests/fixtures/activation-scenarios \
  --context './plugins/doc-this/skills/*' \
  --skip-forced-context-activation --skip-scoring \
  --allow-unsafe-fixture-paths --wait
node scripts/eval-record.mjs --out tests/fixtures/activation-scenarios/RESULTS.json <run-id>
node tests/test-eval-record.mjs
```

`--allow-unsafe-fixture-paths` is needed because each `scenario.json` reaches back out of
this directory to the fixture app rather than carrying a sixth copy of it. The path stays
inside this repository; the flag is about leaving the *source* directory, not the repo.
`tessl eval lint` does not resolve fixture paths at all — it reports six valid scenarios
either way — so lint passing is not evidence the fixture will install.

`--skip-forced-context-activation` is the whole point: with activation forced, the agent is
made to use the injected context and the column says nothing. `--context` with a glob over
the skill directories gives it a real choice between the orchestrator and the six workers.

**Pass condition**: across every run, no member of `WORKERS` appears in the `activated`
column. The orchestrator `doc-this` activating is expected and allowed — that is the routing
working, not a violation.

**These are not eval coverage.** They live here, not under `plugins/doc-this/evals/`,
because anything in a plugin root's `evals/` is uploaded as that plugin's coverage and would
change its published score. They exist to be observed, not to be graded, which is why the
run passes `--skip-scoring`.

The fixture app is the one the judgment fixture already ships. An activation probe over an
empty directory proves nothing: an agent with nothing to do activates nothing, and the proof
passes for the wrong reason. `tests/test-eval-record.mjs` asserts that at least one probe
activated *something*, so a run where every agent sat on its hands is a failure rather than
a green.
