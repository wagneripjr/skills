# Packaging CLI Knowledge for AI Agent Consumption

Agents bootstrap by reading context files before executing commands. Without packaged knowledge, agents fall back to parsing `--help` output (lossy, inconsistent across tools), hallucinate flags that do not exist, miss guardrails that prevent destructive operations, and produce brittle scripts that break on version upgrades. Good knowledge packaging turns a CLI from a tool that agents stumble through into one they operate autonomously and safely.

The gap between a CLI that humans can use and one that agents can use reliably comes down to three things: structured command metadata, explicit guardrails, and error recovery instructions. Humans read tutorials, scan man pages, and learn from mistakes over time. Agents get one shot at reading context, then execute. Every ambiguity in that context becomes a potential failure.

## CONTEXT.md

The primary knowledge file for a CLI. Lives at the project root or ships with the CLI distribution package. This is the single source of truth that agents read before invoking any command.

### Template

```markdown
# mycli

One-paragraph description of what the CLI does and its primary use cases.
State the domain clearly — deployment, data processing, infrastructure,
monitoring — so agents can determine relevance without reading further.

## Quick Start

3-5 most common commands with brief explanation. Lead with this, not
installation — agents need to know what the CLI does before how to install it.

mycli init                          # Initialize a new project
mycli deploy --env staging          # Deploy to staging
mycli status --json                 # Check deployment status (structured)
mycli logs --follow                 # Stream logs
mycli rollback --to previous        # Revert last deployment

## Installation

Exact install commands for each package manager and platform:

# macOS
brew install mycli

# Linux
curl -fsSL https://get.mycli.dev | sh

# npm (cross-platform)
npm install -g @myorg/mycli

## Authentication

How to authenticate. List every method with precedence order:

1. Environment variable: `MYCLI_API_KEY` (highest priority)
2. Config file: `~/.config/mycli/credentials` (created by `mycli auth login`)
3. OAuth flow: `mycli auth login` (interactive, opens browser)

Agents should use method 1 (environment variable) exclusively.
Method 3 requires interactive input and must never be invoked by agents.

## Command Reference

Table of all commands with one-line descriptions and the most common
flag combination for each:

| Command | Common Usage | Description |
|---------|-------------|-------------|
| `mycli init` | `mycli init --template default` | Initialize project |
| `mycli deploy` | `mycli deploy --env staging --json` | Deploy application |
| `mycli status` | `mycli status --id ID --json --fields status,health` | Check resource status |
| `mycli logs` | `mycli logs --id ID --limit 100 --json` | Retrieve logs |
| `mycli rollback` | `mycli rollback --to previous --dry-run` | Revert deployment |
| `mycli list` | `mycli list --json --fields id,name,status` | List all resources |
| `mycli delete` | `mycli delete --id ID --dry-run --json` | Remove a resource |
| `mycli config` | `mycli config get KEY` | Manage configuration |
| `mycli auth` | `mycli auth status --json` | Authentication management |

## Common Workflows

### Workflow 1: First Deployment

mycli init --template default
mycli deploy --env staging --dry-run --json    # Preview
mycli deploy --env staging --json              # Execute
mycli status --json --fields status,url        # Verify

### Workflow 2: Rolling Update

mycli deploy --env production --strategy rolling --dry-run --json
mycli deploy --env production --strategy rolling --json
mycli status --json --fields status,version,health

### Workflow 3: Incident Recovery

mycli rollback --to previous --dry-run --json
mycli rollback --to previous --json
mycli logs --limit 200 --json --since "10m ago"

## Error Codes

| Code | Exit | Meaning | Fix |
|------|------|---------|-----|
| AUTH_EXPIRED | 4 | Token expired | `mycli auth login --refresh` |
| AUTH_MISSING | 4 | No credentials found | Set `MYCLI_API_KEY` env var |
| RESOURCE_NOT_FOUND | 3 | Resource does not exist | `mycli list --json` to find valid IDs |
| RATE_LIMITED | 75 | Too many requests | Retry after backoff (transient) |
| CONFLICT | 5 | Concurrent modification | Retry with `--force` or wait |
| VALIDATION_ERROR | 2 | Invalid input | Check flag values against `--help` |
| NETWORK_ERROR | 75 | Connection failed | Retry (transient) |
| PERMISSION_DENIED | 6 | Insufficient privileges | Check role with `mycli auth status --json` |

## Agent-Specific Notes

- Always use `--json` for structured output — never parse table/human output
- Always use `--dry-run` before any mutating command (deploy, delete, rollback)
- Use `--fields` to limit output size and stay within context budgets
- Never invoke interactive commands — pass all values as flags
- Use `--yes` to bypass confirmation prompts
- Retry on exit code 75 (transient failure) up to 3 times with exponential backoff
- Check exit code before parsing stdout — non-zero means stdout may be empty or partial
- Prefer `--id` flags over positional arguments for unambiguous identification

## Limitations

- Cannot manage resources across multiple accounts in a single command
- `mycli logs --follow` streams indefinitely — always use `--limit` in agent contexts
- No built-in diff between environments — compare `mycli status` outputs manually
- Config changes require redeployment — `mycli config set` does not hot-reload
```

### CONTEXT.md Rules

1. **Keep under 3000 words.** Agents have context budgets. Every word competes with the agent's system prompt, user instructions, and other tool documentation. Bloated context files get truncated or summarized, losing critical guardrails.

2. **Lead with Quick Start, not installation.** Agents deciding whether to use a CLI need to see what it does first. Installation is a one-time concern; command patterns are referenced on every invocation.

3. **Every command in the reference table must show the most common flag combination.** A bare command name is insufficient — agents need the idiomatic invocation, not just the subcommand name. `mycli status` is ambiguous; `mycli status --id ID --json --fields status,health` is actionable.

4. **Error codes must include fix actions.** An error code without a fix action forces the agent to guess at recovery, search documentation, or ask the user. The fix column turns error handling from a judgment call into a lookup.

5. **Agent-Specific Notes section is mandatory.** This is what differentiates CONTEXT.md from a README. READMEs are written for humans who can exercise judgment. Agent notes encode the judgment explicitly: always `--json`, always `--dry-run` first, never interactive, retry only on specific codes.

6. **Use concrete values in examples, not placeholders when possible.** `--env staging` is better than `--env <environment>` because agents can see the valid values. When values are dynamic, show the pattern: `--id "$ID"` with a comment explaining where `$ID` comes from.

7. **Document every flag that suppresses interactivity.** Agents cannot respond to prompts. If a command has `--yes`, `--no-input`, `--batch`, or `--non-interactive` flags, list them explicitly in the Agent-Specific Notes.

## AGENTS.md

A cross-agent instruction file that works with Claude Code, GitHub Copilot, Cursor, Windsurf, Cline, and other AI coding agents. It sits at the project root and points to CONTEXT.md while adding agent-specific behavioral rules. Think of CONTEXT.md as the knowledge and AGENTS.md as the policy.

### Template

```markdown
# Agent Instructions for mycli

This file provides instructions for AI coding agents working with mycli.

## Context

See [CONTEXT.md](./CONTEXT.md) for full CLI documentation.

## Rules

1. Always use `--json` flag for output parsing
2. Always use `--dry-run` before any mutating command
3. Use `--fields id,name,status` to minimize output size
4. Never run interactive commands — use `--yes` to bypass confirmations
5. Check exit code before parsing stdout
6. On exit code 75, retry up to 3 times with exponential backoff
7. Never store credentials in files — use environment variables only
8. Log every mutating command before execution for audit trail

## Preferred Patterns

# Creating resources — capture the ID from JSON output
mycli create --name "resource" --json | jq -r '.data.id'

# Checking status — limit fields to reduce context consumption
mycli status --id "$ID" --json --fields status,health

# Safe deletion — always preview before executing
mycli delete --id "$ID" --dry-run --json    # Preview first
mycli delete --id "$ID" --yes               # Then execute

# Batch operations — iterate with error handling
for id in $(mycli list --json --fields id | jq -r '.data[].id'); do
  mycli update --id "$id" --version latest --json || echo "FAILED: $id"
done

## Anti-Patterns (Do Not)

- Do not parse human-readable table output — always use `--json`
- Do not use positional arguments when named flags are available
- Do not retry on exit codes other than 75 (non-transient errors get worse with retries)
- Do not pipe stderr into processing pipelines — stderr contains diagnostics, not data
- Do not run `mycli auth login` — it requires interactive browser flow
- Do not assume command success without checking exit code
- Do not use `mycli logs --follow` without `--limit` — it blocks indefinitely
```

### AGENTS.md vs CONTEXT.md

CONTEXT.md documents what the CLI can do. AGENTS.md prescribes how agents should use it. The separation matters because CONTEXT.md is also useful for humans (it replaces or supplements the README), while AGENTS.md contains rules that only apply to automated consumers. Keeping them separate avoids cluttering human documentation with agent-specific directives and lets teams update policies without touching reference material.

## llms.txt Convention

An emerging standard for LLM-readable project documentation. A simple text file at the project root that provides a concise index of what the project is and where to find deeper documentation. Designed for LLMs that scan project roots to understand what they are working with.

### Format

```
# mycli

> CLI for managing deployments and infrastructure

## Docs

- [CONTEXT.md](./CONTEXT.md): Full CLI documentation and agent instructions
- [AGENTS.md](./AGENTS.md): Agent behavioral rules and preferred patterns
- [API Reference](https://docs.example.com/api): REST API documentation
- [Changelog](./CHANGELOG.md): Version history and breaking changes

## Commands

mycli deploy --env <staging|production> [--dry-run] [--json]
mycli status --id <id> [--json] [--fields <fields>]
mycli logs --id <id> [--follow] [--limit <n>]
mycli rollback --to <version|previous> [--dry-run] [--json]
mycli list [--json] [--fields <fields>] [--filter <expr>]
```

The `llms.txt` file is intentionally minimal. Its purpose is orientation, not reference. An agent reads `llms.txt` to decide which files to read next. Keep it under 500 words.

## Claude Code Skill Files

For CLIs that want first-class Claude Code integration, ship a `SKILL.md` file. Skills are more powerful than CONTEXT.md because they activate conditionally — Claude loads them only when the trigger conditions match, preserving context window for other tasks.

A SKILL.md for a CLI should include:

- **YAML frontmatter** with `name` and `description` fields. The description must be third-person and list concrete trigger conditions ("Activates when the user asks to deploy, check status, view logs, or rollback using mycli").
- **Trigger conditions** listing every scenario where the skill should activate. Be exhaustive — if a trigger is missing, the skill will not load when needed.
- **Guardrails** encoded as numbered rules: always `--dry-run` before mutating, always `--json` for output, always `--fields` to limit size, never interactive prompts.
- **Common workflow recipes** showing multi-step operations end-to-end, with error handling at each step.
- **Delegation points** indicating when to hand off to other skills (e.g., "After deployment, invoke your exploratory-QA skill to verify the deployment").

Skills differ from CONTEXT.md in that they are prescriptive instructions for a specific agent (Claude), not generic documentation. They encode judgment, policy, and workflow sequencing.

## MCP Tool Wrapping

For CLIs with more than 10 commands or where agents are the primary consumers, wrapping CLI commands as MCP (Model Context Protocol) tools provides structured invocation with typed parameters, eliminating flag parsing errors entirely.

```json
{
  "name": "mycli_deploy",
  "description": "Deploy application to target environment",
  "inputSchema": {
    "type": "object",
    "properties": {
      "env": {
        "type": "string",
        "enum": ["staging", "production"],
        "description": "Target environment"
      },
      "version": {
        "type": "string",
        "default": "latest",
        "description": "Version to deploy"
      },
      "dry_run": {
        "type": "boolean",
        "default": false,
        "description": "Preview without executing"
      }
    },
    "required": ["env"]
  }
}
```

**When to add MCP wrapping:**

- The CLI has more than 10 commands and agents frequently use the majority of them.
- Agents are primary consumers, not occasional users.
- Flag combinations are error-prone (mutually exclusive flags, conditional requirements).
- You want typed parameters with enums, defaults, and validation at the schema level.
- You need to support multiple agent platforms with a single integration point.

**When MCP is overkill:** Simple CLIs with 3-5 commands, CLIs used occasionally, CLIs where `--json` output is sufficient for agent consumption. In these cases, CONTEXT.md plus AGENTS.md is sufficient.

## Versioning Knowledge Files

Knowledge files must stay in sync with the CLI they document. Stale documentation is worse than no documentation — agents will confidently use deprecated flags, miss new commands, and produce errors that look like agent bugs but are actually knowledge drift.

- **Version CONTEXT.md alongside CLI releases.** When the CLI bumps a version, review and update CONTEXT.md in the same commit or release. Treat knowledge files as release artifacts.
- **Update the error codes table when new codes are added.** New error codes without fix actions leave agents without recovery strategies for new failure modes.
- **Update the command reference when commands change.** Added commands, removed commands, renamed flags, changed defaults — all must be reflected immediately.
- **Tag knowledge files with the CLI version they document.** Add a version line near the top of CONTEXT.md: `Compatible with mycli v2.3.0`. Agents (and humans) can then detect when documentation may be stale.
- **Diff knowledge files during CI.** If CLI source changes but CONTEXT.md does not, flag it as a potential documentation gap in the pull request.

## Knowledge File Checklist

Use this checklist when packaging a CLI for agent consumption. Every item must be satisfied before the CLI is considered agent-ready.

```
[ ] CONTEXT.md exists with all sections filled
[ ] AGENTS.md exists with rules and preferred patterns
[ ] llms.txt exists at project root
[ ] Quick Start shows the 3-5 most common commands
[ ] Quick Start appears before Installation in CONTEXT.md
[ ] Command reference table shows common flag combination per command
[ ] Error codes table includes fix actions for every code
[ ] Agent-Specific Notes section lists all guardrails
[ ] All interactive-suppression flags documented (--yes, --no-input, etc.)
[ ] JSON output flag documented and mandated for agents
[ ] Dry-run flag documented and mandated before mutating commands
[ ] Retry policy specified (which exit codes, how many times, backoff strategy)
[ ] Limitations section lists what the CLI cannot do
[ ] Knowledge files versioned with CLI releases
[ ] Total CONTEXT.md word count under 3000
[ ] SKILL.md created if Claude Code is a target agent platform
[ ] MCP tool definitions created if CLI has >10 commands and agents are primary consumers
```

Each item in this checklist addresses a specific failure mode observed in agent-CLI interactions. Missing guardrails lead to destructive operations. Missing error codes lead to unhandled failures. Missing interactivity flags lead to hung processes. The checklist is the minimum viable contract between a CLI and its agent consumers.
