# wagner-skills

A marketplace of **nine plugins** — eight standalone engineering skills you install one at a
time, and a reverse-engineering pipeline that turns a legacy codebase into traceable, ATDD-ready
specifications.

Each plugin is a root under [`plugins/`](plugins), the layout Tessl documents for a repository
holding more than one:

```
plugins/<name>/
├─ .tessl-plugin/plugin.json     # Tessl registry manifest
├─ .claude-plugin/plugin.json    # Claude Code manifest
├─ skills/<name>/SKILL.md
├─ evals/                        # scenarios, when the skill has them
└─ .tesslignore
```

## Install

Install only what you want:

```bash
claude plugin marketplace add wagneripjr/skills

claude plugin install postmortem@wagner-skills-marketplace
claude plugin install okf-maintain@wagner-skills-marketplace
claude plugin install doc-this@wagner-skills-marketplace
```

Restart Claude Code to apply. There is no bundle to install and nothing to disable afterwards —
a plugin you did not install costs no context and spawns no hooks.

### On the Tessl registry

The same nine plugins are published to the [Tessl](https://tessl.io) registry, versioned
independently so a fix to one ships without republishing the rest:

```bash
tessl install wagneripjr/postmortem      # one skill
tessl install wagneripjr/doc-this        # the whole pipeline
```

Publishing is automatic on every push to `master` (`.github/workflows/tessl-publish.yml`) and is a
maintainer step — it needs a workspace API key stored as the `TESSL_TOKEN` repository secret.
Contributors never need one.

## The skills

| Plugin | What it does |
|---|---|
| `agent-cli` | Design and score CLIs meant for **AI agents** — JSON on stdout, diagnostics on stderr, `--help-json` introspection, semantic exit codes. Scores 0–21 across 7 axes. |
| `human-cli` | The sibling for **human** CLIs — naming grammar, prompts with flag bypasses, colors, progress, error messages with resolution URLs, XDG paths, shell completions. Same 0–21 rubric. |
| `airflow-dags` | Apache Airflow 3 DAG authoring — TaskFlow API, asset-driven scheduling, XCom, deferrable operators, dynamic task mapping, multi-layer test suites. 12 reference docs. |
| `platform-sre-kubernetes` | SRE-focused Kubernetes production deployments and manifest review. |
| `okf-maintain` | Adopts the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 in a repo and keeps the bundle healthy — frontmatter repair, generated `index.md` chained from the project root, `log.md` and in-document changelogs removed because git already holds history, and `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` pointed at the index so `docs/` is never grepped for a document's identity. Ships one hook: in a repository that has adopted OKF (an `okf.yaml` is the opt-in), editing a document regenerates the indexes above it, so the catalog cannot drift from the corpus between manual runs. |
| `postmortem` | Production-incident postmortems with a numbered spine — impact and blast radius with per-service evidence, timeline, root cause with mechanism plus five whys plus discarded hypotheses, empirical proof, palliative vs root fix. |
| `prototype-spike` | Turns a requirement into one self-contained clickable HTML file that doubles as a design spike. Rebuilds existing screens at high fidelity from real source with `file:line` citations; the control panel *is* the set of open questions. |
| `requirements-elicitation` | Analyzes PRDs and feature specs for gaps, generates clarifying questions for PMs and engineers, assesses technical risk. |

## doc-this

Reverse-engineers a legacy codebase into ATDD-ready, traceable specs. Run `/doc-this` in any
legacy project; the orchestrator handles the first-run handshake and dispatches the pipeline.

```
Scout → Code Analyst → Detective → Architect → Writer → Reviewer → doc-this-promote → docs/
```

Optional agents run at any point: Tracer (logs/traces), Visor (UI from screenshots),
Data Master (database), Design System (tokens). `/doc-this-viewer` serves a prebuilt Svelte
SPA over localhost to browse the output. `/doc-this-help` explains every agent by analogy.

It is the one plugin that bundles many skills, because its 14 skills share nine enforcement
hooks and a common `hooks/lib/` — machinery that has no per-skill home. Install it only while
reverse-engineering something: it costs roughly 3.4k tokens of skill descriptions per session
plus five Node hook spawns per `Skill` call and two per `Edit`/`Write`.

### The design choices that matter

**Describe-only.** Every agent documents what exists and never proposes, judges, or invents.
No technical-debt registers, no fabricated ADR alternatives, no NFRs inferred from a timeout
pattern, no bug labels. Enforced semantically by the agents and mechanically by a
`PreToolUse` hook that fires on the staging tree only.

**Binary confidence.** Every claim is 🟢 CONFIRMED with a citation or 🔴 GAP recorded as an
open question. There is no 🟡 — a pattern-based guess is not a fact.

**Total source coverage.** A 🔴 must be *earned by reading*. It records what the repository
cannot answer, never what the pipeline did not read. Scout emits a deterministic file
manifest; the Code Analyst appends to an append-only coverage ledger with a resume cursor;
the Reviewer hard-rejects ledger/manifest mismatches and any sampling language. Token
pressure is absorbed by checkpoint-and-resume, never by skipping.

**Evidence provenance.** Every 🟢 scenario carries an `Evidence:` line — `static` from the
Writer, upgraded to `static + runtime (<artifact>)` when the Tracer matches it against real
telemetry.

Output is staged in a hidden `.doc-this-sdd/` tree so an ordinary coding session never
mistakes unpromoted specs for real docs. `doc-this-promote` is the only skill that writes to
`docs/`.

For index generation it dispatches `okf-maintain:okf-maintain`, which owns the OKF index
grammar — so install that plugin too if you intend to promote. Without it, promote falls back to
hand-writing the indexes and says so.

## Development

```bash
git clone https://github.com/wagneripjr/skills
cd skills
node tests/run-all.mjs
```

Editing a skill needs nothing but a text editor. One thing is worth having installed:

- **Node ≥ 18** — every script and harness in this repo is zero-dependency `.mjs`, and the
  `doc-this` hooks are `node` invocations. Without it the hooks fail open, becoming silent no-ops
  rather than errors.

`jq` is not needed to develop here. The `doc-this` agents do call it while analyzing a *target*
project, so install it before running a discovery pass.

`node tests/run-all.mjs` runs every suite in the repo — the acceptance matrices under `tests/`, the
nine doc-this gate harnesses, and the harnesses co-located with individual skills. Individual
suites still run standalone:

```bash
node tests/test-fr-bundle-3.mjs          # tree/closure matrix
node tests/test-fr-proto-1.mjs           # prototype-spike acceptance matrix
node tests/test-okf-maintain.mjs         # okf-maintain acceptance matrix (okf.mjs index + check)
node tests/test-okf-coverage.mjs         # okf.mjs coverage — needs a real git work tree
node tests/test-okf-index-regen.mjs      # the index-regeneration hook — needs a real git work tree
node tests/test-no-shell-invocation.mjs  # no .mjs in the tree reaches a shell
node tests/test-tessl-score-parse.mjs    # how a tessl review score is read (no account needed)
node tests/test-eval-scenarios.mjs       # eval scenario shape + the `tessl eval lint` fail-open guard
node plugins/doc-this/hooks/run-all.mjs  # the doc-this gate harnesses
node tests/test-publication-safety.mjs   # repo-wide scan for credential-shaped material
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the version-bump rules, skill authoring conventions, and
what a PR should say.

### Skill quality review (optional)

Skills here are scored with **Tessl Review** (`tessl review run quality`, npm package `tessl`),
which grades a skill's description and body on triggering, specificity, actionability,
conciseness and progressive disclosure. It is **optional** — no pull request is blocked on a
score, and you never need an account to contribute.

> **It uploads the whole skill directory to a hosted third-party service.** The review is
> bundle-aware: `SKILL.md` *and* `references/`, `scripts/` and `assets/` are sent to tessl for
> grading. Never run it on a skill containing anything confidential — client names, internal
> systems, private URLs. This is the only command in this repository that sends your content off
> your machine.

The review runs server-side against a workspace, so it needs a login and a workspace name. There
is no default workspace: the harness takes one from `--workspace` or `$TESSL_WORKSPACE`, and skips
(77) rather than guessing.

```bash
tessl login                                        # once
tessl workspace list                               # names your workspaces
export TESSL_WORKSPACE=<your-workspace>

# Score a plugin's skills on disk:
tessl review run quality ./plugins/postmortem --workspace "$TESSL_WORKSPACE"

# Or with a floor, via the harness (exit 0 pass · 1 below floor · 77 skipped):
node tests/test-tessl-quality-gate.mjs ./plugins/postmortem 90
```

The harness runs a free `tessl review list` preflight first, so a logged-out or misnamed-workspace
run skips before it submits (and pays for) anything. A quality review costs 10 credits.
`tessl org usage --json` reports what you have left. Publishing to the registry triggers a review
automatically and **free**, which is where the registry score comes from.

**A re-review after an edit needs `--force`.** The cache is not content-addressed: three skills
were re-reviewed here immediately after their `SKILL.md` bodies were rewritten and all three came
back reused, free, and scored identically to the old bundle. A result carrying
`metadata.reusedFromReviewRunId` measured nothing.

**One run is not a measurement.** Identical bytes on one rubric scored 87, 91 and 91, with
individual dimensions moving ±1. Treat a gap under about 5 points as noise, and confirm a low
dimension with a second run before changing anything.

**Scores live on each plugin's registry page**, not in this repository. A publish-time review is
free and puts the score there, but it produces no row in `tessl review list`, so a local record
could only be kept current by paying for a review per skill after every edit. There is no score
file here, and no prose in this repo restates a number.

Aim for 3/3 on every criterion. Two known scores are **deliberate** and should not be chased:
`conciseness` sometimes sits at 2 where restated discipline rules are load-bearing for
actionability, and `trigger_term_quality` is not meaningful for the doc-this pipeline workers —
they are dispatched by exact name, never by user phrasing, and adding trigger keywords to lift the
score would let them run outside their pipeline.

### Skill evals (optional)

`plugins/<name>/evals/<scenario>/` holds eval scenarios, inside the plugin root they grade: a
`task.md` (the only thing the agent sees), a `criteria.json` weighted rubric, and optionally
`resources/` and a `scenario.json` fixture declaration. `tessl eval run` solves each scenario
twice — once without the skill and once with it — and scores the difference, which is what the
skill is actually worth.

Scenarios are excluded from the published package by each plugin's `.tesslignore`, because a
review reads the whole bundle and would otherwise be marking its own answer key.

Writing and checking a scenario is **free and needs no account**:

```bash
tessl eval lint ./plugins/postmortem     # shape check, local
node tests/test-eval-scenarios.mjs       # runs in the default suite, no account required
```

Run that second one. `tessl eval lint` recognises a scenario only by the presence of `task.md` and
**silently skips** any directory without one, so a renamed or mistyped brief removes a scenario
from every future run while the linter still reports green. `tests/test-eval-scenarios.mjs` exists
to catch exactly that, and reproduces the fail-open as a canary so the guard is never quietly lost.

A scenario's `setup.sh` is auto-run if present. This repository does not author shell scripts, so
declare `scenario.json`'s `setup: ["node ..."]` instead.

*Running* an eval costs credits and is a maintainer step; contributing a scenario is welcome.
Because a plugin root is passed directly, the plugin is supplied as context automatically and no
`--context` flag is needed:

```bash
tessl eval run ./plugins/postmortem --wait
```

`CLAUDE.md` is the maintainer's architecture reference — plugin conventions, the full hook
table, and the reasoning behind the pipeline's design.

## License

MIT — see [LICENSE](LICENSE). The prebuilt `doc-this-viewer` bundle embeds Svelte and marked, both
MIT; their notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
