# Host runtime — Claude Code and Codex

Read this before running any Doc-This entry point or worker. The same skill bodies, checkpoints,
describe-only pact, and scripts apply in both hosts; this reference defines their invocation.

## Installed paths and tools

Resolve bundled paths from the actual installed `SKILL.md` location, never the project cwd.
`<plugin-root>` is two directories above its containing skill directory; replace that placeholder
with the resolved absolute path before running a command. Quote paths. `references/`, `scripts/`,
and `assets/` are relative to the skill that names them. The analyzed project's paths remain
relative to its project root. Run bundled `.mjs` files with `node` from that project root.
Write authored artifacts through the native edit/patch tools so edit hooks receive their paths
and content; use terminal execution for the bundled scripts and analysis commands.

| Capability | Claude Code | Codex |
|---|---|---|
| Public invocation | Existing `/doc-this`, `/doc-this-promote`, `/doc-this-help`, `/doc-this-viewer` | `$doc-this:doc-this`, `$doc-this:doc-this-promote`, `$doc-this:doc-this-help`, `$doc-this:doc-this-viewer` |
| Read, search, edit, execute | Read/Grep/Glob/Edit/Write/Bash | Available native file/search tools, `apply_patch`, and terminal execution |
| LSP discovery | `ToolSearch("select:LSP")` | Discover an available LSP tool through the host's tool catalog; use its actual schema |
| Questions | Existing interactive flow | The parent uses the available question tool or asks in the conversation and waits |
| Installed version | `<plugin-root>/.claude-plugin/plugin.json` | `<plugin-root>/.codex-plugin/plugin.json` |

Missing LSP follows the existing UA/direct-reading fallback. Missing optional `agy` follows the
Reviewer's skip behavior. Neither private configuration nor a personal agent registry is required.
Automatic LSP budgets and timing require a mapped `LSP` event with the supported operation/path
fields. If an available navigation tool uses a different name or schema, apply the same limits
from [lsp-structural-extraction.md](lsp-structural-extraction.md) manually; do not claim its calls
were hook-enforced or invent a tool mapping.
When quoting a runbook prompt in Codex, use the fully qualified public invocations in the table;
short `$` skill names do not resolve for plugin skills. For an optional worker, invoke
`$doc-this:doc-this` and name the requested role. Replace `/clear` advice with starting a fresh
Codex conversation and invoking `$doc-this:doc-this`.

## Pipeline dispatch

**Claude Code:** activate `doc-this:doc-this-<role>` with the Skill tool, inline and sequentially,
exactly as before. Keep the fully namespaced name so the plugin's Skill hooks run.

**Codex:** the parent orchestrator dispatches one worker at a time with native `spawn_agent`.
Use the default agent and inherit the active model; do not require a registered role or model alias.
The first line of the worker's `message` must be its exact identity, for example:

```text
DOC_THIS_WORKER=doc-this-writer
Read <plugin-root>/skills/doc-this-writer/SKILL.md and the shared host-runtime reference.
Project root: <absolute project path>
Assignment: <current phase, module/file scope, persisted cursor, and any user answer>
```

Identities are the complete skill directory names: `doc-this-scout`, `doc-this-code-analyst`,
`doc-this-detective`, `doc-this-architect`, `doc-this-writer`, `doc-this-reviewer`,
`doc-this-tracer`, `doc-this-visor`, `doc-this-data-master`, and `doc-this-design-system`.
Use the same marker on every continuation message. The native hook adapter uses it to apply
the shared phase, checkpoint, coverage, and artifact gates before work starts.

Track the returned worker identifier. With a v1 API, retain `agent_id` and pass it as `target`
to `send_input`; `resume_agent` takes `id` and no message, so its hook uses the previously
registered identity. With a v2 collaboration API, use `target` in `followup_task` or
`send_message` with the returned task name or agent id. Check the available schema before
calling. A task name alone does not replace the marker on messages.
Wait for that worker before dispatching another pipeline role; readers below are the sole
optional parallel work. If native subagents are unavailable, report that Doc-This requires
them on Codex and stop dispatching. Do not replace a gated worker with inline execution.

**Direct Codex worker invocation:** when a worker skill is loaded without the matching
`DOC_THIS_WORKER=` assignment, return to `$doc-this:doc-this` with the requested role for resume/debug.
Do not execute the worker body inline, even if state already exists. A marked worker reads
its shared skill body directly; it does not recursively invoke its skill entry point.

## Questions, checkpoints, and completion

The parent alone writes `.doc-this/state.json`. Workers retain their existing artifact ownership
and return one of these statuses with the files produced and the next actionable step:

- `needs_input`: return the exact question and pending action before performing it.
- `checkpoint`: return completed module/file scope, coverage counts, and any next-file cursor.
- `complete`: return the finished assignment and evidence needed to verify its completion.
- `failed`: return the failed operation, its reason, and any safely completed progress; do not
  mark the assignment complete or invent missing output.

In Codex, every instruction inside a worker to ask, wait for CONTINUE, obtain overwrite consent,
or offer a pause means return `needs_input` to the parent. The parent saves completed progress,
asks the user, waits for an answer, and sends that answer to the same worker with its identity
marker. Existing authorization still applies; do not ask again for an already answered decision.
If the worker is no longer available, spawn a replacement of the same role using persisted
progress and the answer. Never run two copies of the same phase concurrently.
Keep the worker available across `needs_input` and `checkpoint` returns. After verifying
`complete`, release its thread before dispatching the next role: v1 uses `close_agent` with
the worker id; v2 uses its available close/cleanup operation, if exposed. Close an abandoned
worker before replacing it. Check the actual schema and available capacity; do not invent a
cleanup tool or exceed the host's thread limit.

A checkpoint, pending question, or failure is not phase completion. On failure, the parent
retains the current phase and reports or resolves the failure before resuming. Writer's one-file
CONTINUE boundaries, Code Analyst's per-module cursor, and Reviewer's cross-review consent
survive delegation. Verify returned artifacts before the parent saves completion and advances
the phase. Use [checkpoint-guide.md](checkpoint-guide.md) for the existing state fields.

## Optional readers

Use [sonnet-reader-fanout.md](sonnet-reader-fanout.md) only with the existing explicit consent.
Claude retains `model: sonnet`; Codex readers inherit the active model and claim no cost reduction.
Run at most three readers and no more than the host's available capacity. If nested dispatch
is unavailable, read inline. Readers are bounded transcription assignments, not pipeline roles:
do not give them a `DOC_THIS_WORKER=` marker. The assigning analyst/backfill orchestrator alone
verifies and merges their staging output and updates the ledger.
