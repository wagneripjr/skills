# wagner-skills

A Claude Code plugin marketplace with two plugins: a set of general-purpose engineering
skills, and a reverse-engineering pipeline that turns a legacy codebase into traceable,
ATDD-ready specifications.

| Plugin | Skills | Default state |
|---|---|---|
| [`wagner-skills`](#wagner-skills-1) | 8 + 1 hook | enabled |
| [`doc-this`](#doc-this) | 14 + 9 enforcement hooks | **disabled** |

## Install

```bash
claude plugin marketplace add wagneripjr/skills
claude plugin install wagner-skills@wagner-skills-marketplace
claude plugin install doc-this@wagner-skills-marketplace
claude plugin disable doc-this@wagner-skills-marketplace   # until you need a discovery run
```

Restart Claude Code to apply.

### Why `doc-this` ships disabled

It is only useful while reverse-engineering a legacy codebase, and riding inside the main
plugin it charged every session ~3.4k tokens of skill descriptions plus five Node hook
spawns per `Skill` call and two per `Edit`/`Write`. Splitting it into its own plugin makes
that cost opt-in. Neither `skillOverrides` nor `disable-model-invocation` can express this —
the former does not unload descriptions, the latter also blocks the orchestrator's own
dispatch.

Enable it for a run, disable it after:

```bash
claude plugin enable  doc-this@wagner-skills-marketplace
claude plugin disable doc-this@wagner-skills-marketplace
```

## wagner-skills

| Skill | What it does |
|---|---|
| `agent-cli` | Design and score CLIs meant for **AI agents** — JSON on stdout, diagnostics on stderr, `--help-json` introspection, semantic exit codes. Scores 0–21 across 7 axes. |
| `human-cli` | The sibling for **human** CLIs — naming grammar, prompts with flag bypasses, colors, progress, error messages with resolution URLs, XDG paths, shell completions. Same 0–21 rubric. |
| `airflow-dags` | Apache Airflow 3 DAG authoring — TaskFlow API, asset-driven scheduling, XCom, deferrable operators, dynamic task mapping, multi-layer test suites. 12 reference docs. |
| `platform-sre-kubernetes` | SRE-focused Kubernetes production deployments and manifest review. |
| `okf-maintain` | Adopts the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 in a repo and keeps the bundle healthy — frontmatter repair, generated `index.md` chained from the project root, `log.md` and in-document changelogs removed because git already holds history, and `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` pointed at the index so `docs/` is never grepped for a document's identity. Ships the plugin's one hook: in a repository that has adopted OKF (an `okf.yaml` is the opt-in), editing a document regenerates the indexes above it, so the catalog cannot drift from the corpus between manual runs. |
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

For index generation it dispatches `wagner-skills:okf-maintain`, which owns the OKF index
grammar — so install both plugins if you intend to promote. Without it, promote falls back to
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
node doc-this/hooks/run-all.mjs          # the doc-this gate harnesses
node tests/test-publication-safety.mjs  # repo-wide scan for credential-shaped material
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers the version-bump rules, skill authoring conventions, and
what a PR should say.

### Skill quality review (optional)

Skills here are scored with the `tessl` CLI's `skill review` (npm package `tessl`), which grades a skill's
description and body on triggering, specificity, actionability, conciseness and progressive
disclosure. It is **optional** — no pull request is blocked on a score, and you never need an
account to contribute.

> **It uploads the skill to a hosted third-party service.** `tessl skill review` sends
> `SKILL.md` (and, in remote mode, the pushed bundle) to tessl for grading. Never run it on a
> skill containing anything confidential — client names, internal systems, private URLs. This is
> the only command in this repository that sends your content off your machine.

```bash
npx tessl login                                   # once

# Score a skill on disk:
npx tessl skill review ./skills/postmortem --json

# Or with a floor, via the harness (exit 0 pass · 1 below floor · 77 skipped):
node tests/test-tessl-quality-gate.mjs ./skills/postmortem 90
```

Local review does not bundle `reference/` subdirectories, so the judges see broken links and dock
`progressive_disclosure` and `actionability`. To score what a reader actually gets, push first and
review the published copy — the harness derives the repo from your `origin`, so a fork reviews
itself:

```bash
node tests/test-tessl-quality-gate.mjs ./skills/postmortem 90 remote
# ...or name the repo explicitly if origin isn't a GitHub URL:
TESSL_REPO=github:<owner>/<repo> node tests/test-tessl-quality-gate.mjs ./skills/postmortem 90 remote
```

Aim for 3/3 on every criterion. Two known scores are **deliberate** and should not be chased:
`conciseness` sometimes sits at 2 where restated discipline rules are load-bearing for
actionability, and `trigger_term_quality` is not meaningful for the doc-this pipeline workers —
they are dispatched by exact name, never by user phrasing, and adding trigger keywords to lift the
score would let them run outside their pipeline.

`CLAUDE.md` is the maintainer's architecture reference — plugin conventions, the full hook
table, and the reasoning behind the pipeline's design.

## License

MIT — see [LICENSE](LICENSE). The prebuilt `doc-this-viewer` bundle embeds Svelte and marked, both
MIT; their notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
