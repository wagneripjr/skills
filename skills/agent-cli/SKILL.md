---
name: agent-cli
description: "Use when building, designing, reviewing, or evaluating command-line tools for AI agent consumption -- structures commands with machine-readable JSON output on stdout, human diagnostics on stderr, adds --json/--fields/--dry-run/--quiet flags, implements semantic exit codes, enforces TTY-aware dual-mode output, hardens input against path traversal and injection, creates CONTEXT.md and AGENTS.md agent knowledge files, adds --help-json schema introspection, and scores CLI agent-friendliness on a 0-21 rubric across 7 axes. Triggers on: 'agent-friendly CLI', 'CLI for agents', 'build a CLI', 'design CLI commands', 'machine-readable output', '--help-json', 'CLI scoring', 'agent DX', 'context window discipline', 'evaluate CLI', 'CLI agent readiness', 'score this CLI'. NOT for TUI/full-screen apps. NOT for GUI apps. NOT for REST/GraphQL API design."
license: MIT
---

# Agent-Friendly CLI Design & Evaluation

Build command-line tools that AI agents consume reliably and humans use comfortably. These goals are orthogonal — a CLI can serve both audiences from the same command surface by detecting context (TTY vs pipe) and adapting output.

**Build mode** (default) — walk through Phases 1-6 to construct an agent-first CLI from scratch or retrofit an existing one. **Evaluate mode** — activated when the user says "score", "evaluate", "audit", or "rate" — jump to Phase 7 to score a CLI on the 7-axis rubric.

This skill targets **command-based CLIs** (like `git`, `docker`, `gh`, `kubectl`) — tools with subcommands, flags, and structured output. Not for full-screen TUI applications, dashboards, or GUI tools.

## Quick Decision Guide

| Need | Approach | Reference |
|------|----------|-----------|
| Design command grammar and hierarchy | Noun-verb or verb-noun pattern, 2-3 levels max | [command-design.md](references/command-design.md) |
| Add `--json` flag with consistent envelope | `{ "status", "data", "error", "meta" }` on every command | [output-design.md](references/output-design.md) |
| Stream results without buffering | NDJSON — one JSON object per `\n`-separated line | [output-design.md](references/output-design.md) |
| Reduce agent token consumption | `--fields`, `--quiet`, `--limit`, `--summary` flags | [output-design.md](references/output-design.md) |
| Accept raw JSON payloads | `--data '{"key":"val"}'` or stdin pipe alongside flags | [input-security.md](references/input-security.md) |
| Defend against agent hallucination inputs | Reject path traversals, control chars, embedded query params | [input-security.md](references/input-security.md) |
| Add `--help-json` schema introspection | Machine-readable command/flag/type/enum metadata | [discoverability.md](references/discoverability.md) |
| Generate shell completions | Framework-native: Cobra, Click, clap, oclif | [discoverability.md](references/discoverability.md) |
| Add `--dry-run` to mutating commands | Return planned changes as structured JSON | [composability-safety.md](references/composability-safety.md) |
| Make operations idempotent | `--if-not-exists` for create, safe retry semantics | [composability-safety.md](references/composability-safety.md) |
| Ship CONTEXT.md / AGENTS.md / llms.txt | Agent knowledge packaging templates | [agent-knowledge.md](references/agent-knowledge.md) |
| Wrap CLI as MCP tools | JSON-RPC typed tool definitions from CLI commands | [agent-knowledge.md](references/agent-knowledge.md) |
| Score CLI agent-friendliness (0-21) | 7-axis rubric with per-level criteria | [scoring-rubric.md](references/scoring-rubric.md) |
| Framework boilerplate (Node/Python/Go/Rust) | JSON envelope, TTY detection, error handling per framework | [framework-patterns.md](references/framework-patterns.md) |

## Hard Gates

Violation of any gate halts progress. No workaround. No exceptions.

| Gate | Rule | Why |
|------|------|-----|
| **G1** | stdout is exclusively for machine-parseable data — human messages, progress, prompts go to stderr | Agents pipe stdout to parsers. Mixed output breaks `jq`, NDJSON consumers, and every structured pipeline. |
| **G2** | Every command supports `--json` returning a consistent envelope with `status`, `data`/`error`, and `meta` fields | Without a predictable envelope, agents cannot distinguish success from failure or extract pagination metadata. |
| **G3** | Exit 0 on success, non-zero on failure — exit codes must be semantic (2=usage, 3=not-found, 4=permission, 75=transient) | Agents use `$?` as the primary success signal. Exit 0 on error silently corrupts downstream pipelines. Code 75 tells agents to retry. |
| **G4** | `--help` must exist on every command and subcommand with flags, types, defaults, and examples | Missing help makes the CLI invisible to agents that bootstrap by parsing help text. |
| **G5** | No interactive prompts when stdin is not a TTY — detect TTY and fail with actionable error when input is missing | Agents cannot answer prompts. A CLI that hangs waiting for input kills the agent's workflow. Every prompt needs a `--yes`/`--force`/`--flag` bypass. |
| **G6** | Error output must include: what failed, why, and a suggested fix command — structured as JSON when `--json` is active | "Error: failed" gives agents nothing to act on. "Error: file 'x.csv' not found. Fix: `mycli init`" enables autonomous recovery. |
| **G7** | `--dry-run` must exist on every mutating command, returning planned changes as structured output | Agents need to preview side effects before committing. Without dry-run, the only option is execute-and-hope. |
| **G8** | Never emit ANSI color/formatting codes when stdout is piped — detect non-TTY and respect `NO_COLOR` | ANSI escape sequences inside JSON strings break every downstream consumer. LLMs tokenize `\x1b[32m` as text, wasting context window. |

## Phase 1: Command Design

Design the command surface: grammar, subcommand hierarchy, flag conventions, and naming standards. Pick noun-verb (`mycli pod list`) or verb-noun (`mycli list pods`) and apply consistently. Limit hierarchy to 2-3 levels. Prefer flags over positional arguments — flags are self-documenting and order-independent.

Define global flags available on every command: `--json`, `--quiet`, `--verbose`, `--no-color`, `--help`, `--version`. Load `references/command-design.md` for grammar patterns, flag type conventions, and the backward compatibility contract.

## Phase 2: Output Architecture

Implement the JSON envelope, NDJSON streaming, field selection, and TTY-aware dual-mode output. Every command outputs human-readable tables when stdout is a TTY and clean JSON when piped or `--json` is passed. Every output — success or failure — guides the next action with suggested commands.

Add `--fields` for context window discipline (agents select only needed columns, reducing token cost by 90%+). Add `--limit` and cursor-based pagination for large result sets. Load `references/output-design.md` for envelope schema, NDJSON rules, and token efficiency benchmarks.

## Phase 3: Input Handling

Support raw JSON input (`--data '{"key":"val"}'`) alongside individual flags. Accept stdin pipes for batch operations. Harden all inputs against agent-specific failure modes: path traversal (`../../.ssh/id_rsa`), control character injection (`\x00`, `\x1b`), shell metacharacters (`;`, `$()`, backticks), double encoding, and embedded query params in resource IDs.

The agent is not a trusted operator — validate at the CLI boundary, fail closed. Load `references/input-security.md` for attack patterns, mitigation code, and the security posture.

## Phase 4: Discoverability & Schema

Implement `--help` with examples (the most-read section), flag types, defaults, allowed values, exit codes, and see-also. Add `--help-json` for machine-readable schema introspection — agents use this to discover commands without pre-stuffed documentation.

Generate shell completions (bash, zsh, fish) via framework tooling. Create `CONTEXT.md` and `AGENTS.md` knowledge files for agent consumption. Load `references/discoverability.md` for help text structure, `--help-json` schema, and knowledge file templates.

## Phase 5: Safety & Composability

Add `--dry-run` on every mutating command — output planned changes as structured JSON. Make operations idempotent (`--if-not-exists` for create, safe retry for update/delete). Design commands for pipe composition: create outputs the resource ID, list supports `--fields` and `--quiet`, action commands accept IDs as flags.

Implement config precedence: flags > env vars > project config > user config > defaults. Handle SIGINT (exit 130), SIGTERM (exit 143), SIGPIPE (exit 141 silently). Load `references/composability-safety.md` for pipe patterns, signal handling, and backward compatibility rules.

## Phase 6: Agent Knowledge Packaging

Ship knowledge files alongside the CLI:
- **CONTEXT.md** — purpose, authentication, commands, workflows, error codes, agent-specific notes, limitations (under 3000 words)
- **AGENTS.md** — cross-agent instructions pointing to CONTEXT.md with rules and preferred patterns
- **llms.txt** — minimal orientation for LLM project scanning

For advanced integration, wrap CLI commands as MCP tools with typed input schemas, or ship Claude Code skill files with guardrails. Load `references/agent-knowledge.md` for templates and packaging strategies.

## Phase 7: Evaluate (optional)

Score the CLI on 7 axes (0-3 each, 0-21 total):

| Axis | What it measures |
|------|-----------------|
| Machine-Readable Output | Can agents parse output without heuristics? |
| Raw Payload Input | Can agents send full payloads without flag translation? |
| Schema Introspection | Can agents discover commands/flags at runtime? |
| Context Window Discipline | Does the CLI help agents control response size? |
| Input Hardening | Does the CLI defend against hallucination inputs? |
| Safety Rails | Can agents validate before acting? |
| Agent Knowledge Packaging | Does the CLI ship agent-consumable knowledge? |

**0-5 = Human-only**, **6-10 = Agent-tolerant**, **11-15 = Agent-ready**, **16-21 = Agent-first**. Load `references/scoring-rubric.md` for full per-level criteria, evaluation procedure, and example scores for `gh`, `aws`, `kubectl`, and `docker`.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Mixing data and diagnostics on stdout | Data to stdout, everything else to stderr — no exceptions |
| ANSI codes in piped output | Check `isatty(stdout)` and `NO_COLOR` before emitting any escape codes |
| Interactive prompts with no bypass | Every prompt must have `--yes`/`--force`/`--flag` equivalent |
| Printing nothing on success | Confirm what happened + suggest next commands — silence is ambiguous |
| Output that doesn't guide next action | Add "Next steps" section with exact follow-up commands |
| Breaking existing flag/output contracts | Add, don't modify — deprecate with stderr warnings before removing |
| Accepting secrets via flags | Use env vars, `--password-file`, or stdin — flags leak to `ps` and shell history |
| Verbose default output wasting tokens | Support `--fields`, `--quiet`, `--limit` to let agents control output size |

## Reference Files

| File | When to load |
|------|-------------|
| [command-design.md](references/command-design.md) | Command grammar, subcommand hierarchy, flag conventions, naming, backward compatibility |
| [output-design.md](references/output-design.md) | JSON envelope, NDJSON streaming, field selection, TTY detection, token efficiency |
| [input-security.md](references/input-security.md) | Raw JSON input, stdin pipes, path traversal, injection, control chars, output sandboxing |
| [discoverability.md](references/discoverability.md) | --help structure, --help-json schema, shell completions, CONTEXT.md format |
| [composability-safety.md](references/composability-safety.md) | --dry-run, idempotency, pipe composition, config precedence, signal handling |
| [agent-knowledge.md](references/agent-knowledge.md) | CONTEXT.md/AGENTS.md/llms.txt templates, MCP wrapping, skill files |
| [scoring-rubric.md](references/scoring-rubric.md) | 7-axis rubric (0-21), per-level criteria, evaluation procedure, example scores |
| [framework-patterns.md](references/framework-patterns.md) | Boilerplate: Commander.js, oclif, Click, Typer, Cobra, clap — JSON, TTY, errors |

## Rules

1. **Agent is not a trusted operator** — validate all input at the CLI boundary, fail closed on uncertain validation, sandbox output paths
2. **Output guides the next action** — every command's output (success, failure, partial) tells the consumer what to do next
3. **Structured output is a versioned contract** — adding optional fields is safe, removing or renaming fields is breaking
4. **TTY detection governs mode** — human-readable when interactive, machine-readable when piped, `--json` overrides both
5. **Token cost is a design constraint** — every unnecessary byte in stdout costs the agent context window and API spend
6. **Framework boilerplate first** — load `references/framework-patterns.md` for the target language before writing code
7. **Evaluate after building** — run Phase 7 scoring to identify gaps, prioritize lowest-scoring axes

## Downstream Handoff

After building an agent-friendly CLI:
- **an acceptance-spec / ATDD skill** — write acceptance specifications with a CLI protocol driver (command execution, exit code assertions, JSON output parsing)
- **an exploratory-QA skill** — exploratory testing of the CLI as a user/agent would actually consume it
