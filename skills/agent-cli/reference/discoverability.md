# Making CLIs Discoverable for AI Agents

A CLI that cannot be discovered cannot be used. Humans learn CLIs through blog posts, coworker tips, and muscle memory. AI agents learn CLIs through help text, schema introspection, and context files shipped alongside the binary. Every discovery mechanism you omit forces the agent into trial-and-error — burning tokens, wasting time, and producing unreliable results.

This reference covers every layer of the discoverability stack: help text that teaches, schema introspection that enables programmatic consumption, shell completions that accelerate workflows, man pages that document exhaustively, and context files that orient agents before they run a single command.

---

## Help Text Design

Help text is the primary interface between your CLI and any user — human or agent. It is read more often than source code, documentation sites, or README files. Design it as carefully as you design the commands themselves.

### Top-Level Help (No Arguments)

When a user runs `mycli` with no arguments, show a concise overview that answers three questions: what is this tool, what can it do, and how do I start?

```
mycli — Deploy and manage applications across environments.

Usage:
  mycli <command> [flags]

Commands:
  deploy      Deploy an application to an environment
  status      Show deployment status and health
  logs        Stream or fetch application logs
  config      Manage environment configuration
  rollback    Roll back to a previous deployment

Global Flags:
  --env string        Target environment [staging|production]
  --output string     Output format [text|json|yaml] (default: "text")
  --verbose           Enable verbose output
  --timeout duration  Operation timeout (default: "5m")

Examples:
  mycli deploy --env staging --version v2.1.0
  mycli status --env production --output json
  mycli logs --env staging --follow --since 1h

Run 'mycli <command> --help' for detailed usage of any command.
```

The structure is deliberate: description, usage pattern, commands (sorted by frequency of use, not alphabetically), global flags, examples, and a pointer to deeper help. An agent seeing this output can enumerate every command, understand the global flags, and construct a valid first invocation from the examples alone.

### Command-Level Help

When a user runs `mycli deploy --help`, show everything needed to construct a correct invocation. Hold nothing back — this is where agents spend the most time.

```
Deploy an application to the specified environment.

Reads the application manifest from ./app.yaml by default.
Creates a new deployment revision and waits for health checks to pass.

Usage:
  mycli deploy [flags]

Flags:
  --env string          Target environment [staging|production] (required)
  --version string      Version tag to deploy (default: "latest")
  --replicas int        Number of replicas (default: 3)
  --dry-run             Validate and preview without deploying
  --manifest string     Path to manifest file (default: "./app.yaml")
  --wait duration       Time to wait for healthy status (default: "10m")
  --no-health-check     Skip post-deploy health verification

Examples:
  # Deploy latest to staging
  mycli deploy --env staging

  # Deploy specific version to production with dry-run first
  mycli deploy --env production --version v2.1.0 --dry-run
  mycli deploy --env production --version v2.1.0

  # Deploy with custom replica count and manifest
  mycli deploy --env staging --replicas 5 --manifest ./deploy/app.yaml

Exit Codes:
  0   Deployment succeeded and health checks passed
  1   Deployment failed (check logs with 'mycli logs')
  2   Invalid arguments or missing required flags
  3   Timeout waiting for healthy status

See Also:
  mycli status    — Check deployment health after deploy
  mycli rollback  — Revert to previous deployment
  mycli logs      — View deployment logs
```

### Help Text Rules

These rules apply to every help screen in the CLI:

1. **Lead with examples.** Examples are the most-read section of any help text. Humans copy-paste them. Agents parse them to learn flag combinations and argument patterns. Place them prominently, not buried after walls of flag descriptions.

2. **Show flag types and defaults.** A flag without a type is ambiguous. A flag without a default requires the user to guess what happens when they omit it. Always include both:
   ```
   --timeout duration  (default: "5m")
   --replicas int      (default: 3)
   --env string        [staging|production]
   ```

3. **Show allowed values.** When a flag accepts an enumerated set, list every valid value in square brackets. Agents use this to validate their inputs before invocation:
   ```
   --output string  [text|json|yaml]
   --env string     [staging|production]
   ```

4. **Mark required flags.** Append `(required)` to any flag that must be provided. This prevents agents from running commands that will always fail:
   ```
   --env string  Target environment [staging|production] (required)
   ```

5. **Include exit codes.** Exit codes are the most reliable signal an agent has for determining whether a command succeeded. Document every code the command can return, what it means, and what to do about it.

6. **Include SEE ALSO.** Cross-reference related commands. Agents use these to chain workflows — deploy, then check status, then view logs. Without SEE ALSO, the agent must scan the entire command list to find the logical next step.

7. **No walls of text.** Dense paragraphs are hard for humans to scan and expensive for agents to process. Use short descriptions, tables, and structured layouts. Every word in help text costs tokens.

### Error-Triggered Help

Bad usage is a teaching opportunity. When a command fails due to user error, show targeted guidance — not the full help dump.

**Missing required flag:**
```
Error: missing required flag --env

Usage:
  mycli deploy --env <environment> [flags]

Available environments: staging, production

Run 'mycli deploy --help' for full usage.
```

**Unknown flag:**
```
Error: unknown flag --environnment

Did you mean --env?

Run 'mycli deploy --help' for full usage.
```

**Unknown command with typo correction:**
```
Error: unknown command "deplooy"

Did you mean "deploy"?

Run 'mycli --help' for a list of commands.
```

**Invalid flag value:**
```
Error: invalid value "prod" for --env

Allowed values: staging, production

Run 'mycli deploy --help' for full usage.
```

Every error message follows the same structure: what went wrong, what was expected (or what was closest), and where to get more help. Agents parse these patterns to self-correct without human intervention.

---

## Schema Introspection (`--help-json`)

Help text is designed for reading. Schema introspection is designed for parsing. Agents that need to construct commands programmatically, validate inputs, or understand output shapes benefit enormously from machine-readable schema information.

### Pattern 1: `--help-json` on Every Command

Add a `--help-json` flag to every command that emits the same information as `--help` but in a structured JSON format:

```json
{
  "command": "deploy",
  "description": "Deploy application to environment",
  "usage": "mycli deploy [flags]",
  "flags": {
    "env": {
      "type": "string",
      "required": true,
      "enum": ["staging", "production"],
      "description": "Target environment"
    },
    "version": {
      "type": "string",
      "required": false,
      "default": "latest",
      "description": "Version tag to deploy"
    },
    "replicas": {
      "type": "integer",
      "required": false,
      "default": 3,
      "description": "Number of replicas"
    },
    "dry-run": {
      "type": "boolean",
      "required": false,
      "default": false,
      "description": "Validate and preview without deploying"
    }
  },
  "examples": [
    "mycli deploy --env staging",
    "mycli deploy --env production --version v2.1.0 --dry-run"
  ],
  "exit_codes": {
    "0": "Success",
    "1": "Deployment failed",
    "2": "Invalid arguments",
    "3": "Timeout"
  },
  "see_also": ["mycli status", "mycli rollback", "mycli logs"]
}
```

The top-level command should also respond to `--help-json` and return the full command tree:

```json
{
  "command": "mycli",
  "description": "Deploy and manage applications across environments",
  "commands": ["deploy", "status", "logs", "config", "rollback"],
  "global_flags": {
    "env": {"type": "string", "enum": ["staging", "production"]},
    "output": {"type": "string", "enum": ["text", "json", "yaml"], "default": "text"},
    "verbose": {"type": "boolean", "default": false},
    "timeout": {"type": "string", "default": "5m"}
  }
}
```

This pattern is the most practical for agent adoption. The agent runs `mycli deploy --help-json`, parses the flags, validates its inputs against the schema, and constructs the command. No guessing, no retries.

### Pattern 2: Schema Command

Provide a dedicated `schema` subcommand that exposes input and output schemas separately:

```bash
# List all commands
mycli schema --list

# Show input schema for deploy
mycli schema deploy

# Show output schema for deploy
mycli schema deploy --output-schema
```

The input schema describes what flags and arguments the command accepts. The output schema describes the JSON envelope shape that `--output json` produces. Agents use the output schema to write parsers before running the command.

This pattern works well for CLIs with complex output structures where the agent needs to know the shape of the response to extract specific fields.

### Pattern 3: OpenAPI-Style Full Description

For CLIs that wrap APIs or have many commands, provide a single document that describes the entire CLI surface:

```bash
mycli describe --json > mycli-api.json
```

The output resembles an OpenAPI specification — every command, every flag, every output schema, every error code, in one file. Agents can ingest this once and cache it, avoiding repeated `--help-json` calls.

This pattern is most useful for agent frameworks that pre-load tool descriptions. The agent reads the full spec at startup and plans command sequences without runtime discovery.

### Choosing a Pattern

Use `--help-json` as the baseline — it requires the least implementation effort and covers the majority of agent use cases. Add `schema` or `describe` when the CLI has complex output structures or when you know agents will pre-load tool definitions. These patterns are additive, not exclusive.

---

## Shell Completions

Shell completions accelerate interactive use and provide another discovery mechanism. They teach the shell (and any agent watching shell sessions) what commands, flags, and values are valid at each cursor position.

### Framework-Specific Generation

Most CLI frameworks generate completion scripts automatically:

| Framework | Language | Command |
|-----------|----------|---------|
| Cobra | Go | `mycli completion bash\|zsh\|fish\|powershell` |
| Click | Python | `_MYCLI_COMPLETE=bash_source mycli` |
| clap | Rust | Built-in via `clap_complete` crate |
| oclif | Node.js | `mycli autocomplete bash\|zsh` |
| Typer | Python | `mycli --install-completion` |
| System.CommandLine | C# | Built-in `[suggest]` directive |

### Self-Installing Pattern

Provide a single command that detects the user's shell and installs completions to the correct location:

```bash
mycli completions install
```

This detects whether the user runs bash, zsh, or fish, writes the completion script to the appropriate directory (`~/.bash_completion.d/`, `~/.zfunc/`, `~/.config/fish/completions/`), and prints a message about reloading the shell.

### Dynamic Completions

Static completions cover commands and flag names. Dynamic completions cover flag values that depend on runtime state — environment names, resource IDs, region lists, configuration keys.

```bash
# When the user types: mycli deploy --env <TAB>
# The completion script calls: mycli __complete deploy --env ""
# Which returns: staging\nproduction
```

Dynamic completions are critical for agents that use shell integration. The agent can invoke the completion endpoint to discover valid values without consulting documentation.

---

## Man Pages

Man pages are the deep reference layer. They document every detail — flag interactions, environment variables, configuration files, edge cases — that help text omits for brevity.

### Generation

Most CLI frameworks can generate man pages from the same source that produces help text:

```bash
# Cobra (Go) — generates man pages from command definitions
cobra-cli man --output ./man/

# Click (Python) — via click-man plugin
pip install click-man
click-man --target ./man/ mycli

# clap (Rust) — via clap_mangen crate
# Generates at build time via build.rs
```

For frameworks without built-in man page generation, write man pages in markdown and convert with `pandoc`:

```bash
pandoc docs/mycli-deploy.md -s -t man -o man/man1/mycli-deploy.1
```

### Standard Sections

Every man page should include these sections in this order:

| Section | Content |
|---------|---------|
| NAME | Command name and one-line description |
| SYNOPSIS | Usage patterns with optional/required markers |
| DESCRIPTION | Full prose description of behavior |
| OPTIONS | Every flag with type, default, allowed values, and semantics |
| EXIT STATUS | All exit codes with meanings |
| ENVIRONMENT | Environment variables the command reads |
| FILES | Configuration files, manifests, state files |
| EXAMPLES | Comprehensive examples covering common and edge cases |
| SEE ALSO | Related commands and external documentation |

The ENVIRONMENT and FILES sections are particularly valuable for agents. They reveal implicit inputs that do not appear in `--help` output — an agent that knows about `MYCLI_ENV` can set it instead of passing `--env` on every command.

---

## CONTEXT.md — Agent Context File

Ship a `CONTEXT.md` file alongside the CLI binary or in the repository root. This file gives agents everything they need to use the CLI effectively without running `--help` first.

```markdown
# mycli

## Purpose
mycli deploys and manages applications across staging and production
environments. It reads application manifests (app.yaml), creates deployment
revisions, runs health checks, and supports instant rollback.

## Authentication
Set the MYCLI_TOKEN environment variable with an API token.
Generate tokens at https://app.example.com/settings/tokens.
Tokens are scoped per environment — a staging token cannot deploy to production.

Alternative: run `mycli auth login` for interactive OAuth flow (stores
credentials in ~/.mycli/credentials.json).

## Common Workflows

### Deploy to staging
```
mycli deploy --env staging --version v2.1.0 --dry-run
mycli deploy --env staging --version v2.1.0
mycli status --env staging --output json
```

### Check production health
```
mycli status --env production --output json
```

### Roll back a bad deploy
```
mycli rollback --env production --to-revision 42
mycli status --env production
```

### Stream logs during incident
```
mycli logs --env production --follow --since 15m --severity error
```

### Update configuration
```
mycli config set --env staging --key DATABASE_POOL_SIZE --value 20
mycli config list --env staging --output json
```

## Error Codes
| Code | Meaning | Fix |
|------|---------|-----|
| AUTH_EXPIRED | Token has expired | Run `mycli auth login` or regenerate token |
| MANIFEST_INVALID | app.yaml has syntax errors | Validate with `mycli deploy --dry-run` |
| HEALTH_TIMEOUT | Health checks did not pass | Check logs with `mycli logs --env <env>` |
| REVISION_NOT_FOUND | Rollback target does not exist | List revisions with `mycli status --revisions` |
| RATE_LIMITED | Too many API calls | Wait and retry, or use --retry-backoff flag |

## Limitations
- Cannot deploy to multiple environments in a single command
- Log streaming requires a persistent connection (no offline mode)
- Config changes require a redeploy to take effect
- Maximum manifest size: 1 MB
- Rollback only reverts application code, not configuration changes
```

The CONTEXT.md file is not a replacement for `--help`. It is a higher-level orientation document that answers "what should I use this tool for?" and "what are the common multi-step workflows?" Help text answers "how do I use this specific command?"

---

## AGENTS.md — Cross-Agent Instructions

AGENTS.md is the emerging standard for providing instructions to AI coding agents (Claude Code, Cursor, Copilot, Windsurf, Codex, Zed). For CLIs, it bridges the gap between human-oriented docs and agent-oriented consumption patterns.

```markdown
# Agent Instructions for mycli

## Context
Read CONTEXT.md for authentication, workflows, and error codes.

## Agent-Specific Guidance

### Always use structured output
Pass `--output json` on every command. Never parse human-readable table output.

### Always dry-run destructive operations
Before `deploy` or `rollback`, run with `--dry-run` first. Parse the JSON output
to verify the operation matches intent before executing.

### No interactive mode
mycli prompts for confirmation on destructive operations by default.
Always pass `--yes` or `--force` to skip prompts. Agents cannot respond
to interactive prompts.

### Preferred flag combinations
- Status checks: `mycli status --env <env> --output json`
- Log fetching: `mycli logs --env <env> --since <duration> --output json` (not --follow)
- Config reads: `mycli config list --env <env> --output json`

### Common pitfalls
- Do not use `--follow` with logs — it streams indefinitely. Use `--since` + `--tail` instead.
- The `--env` flag is required on nearly every command. Omitting it produces an error, not a default.
- Exit code 3 (timeout) is transient — retry with a longer `--wait` duration.
- Config changes are not live until the next deploy.
```

---

## llms.txt Convention

The `llms.txt` convention is an emerging standard for making projects machine-readable to large language models. Place an `llms.txt` file at the project root (or serve it at `/.well-known/llms.txt` for web-hosted documentation). It provides a concise, structured overview that LLMs can ingest to understand the project's capabilities without crawling entire documentation sites.

```
# mycli

> Deploy and manage applications across staging and production environments.

## Docs
- [Getting Started](https://docs.example.com/getting-started): Installation and first deploy
- [CLI Reference](https://docs.example.com/cli): Complete command reference
- [API](https://docs.example.com/api): Underlying REST API documentation

## Commands
- deploy: Deploy application to environment (required: --env)
- status: Show deployment status and health
- logs: Stream or fetch application logs
- config: Manage environment configuration
- rollback: Roll back to a previous deployment

## Optional
- [CONTEXT.md](./CONTEXT.md): Agent context file with workflows and error codes
- [AGENTS.md](./AGENTS.md): Agent-specific usage instructions
```

For projects with extensive documentation, also provide `llms-full.txt` containing the complete unabridged content. The short `llms.txt` acts as a table of contents; `llms-full.txt` provides the depth.

---

## Discoverability Hierarchy

Discoverability is not a single feature — it is a stack. Each layer serves a different knowledge level, from first-time user to programmatic agent. Design the CLI so that users and agents can progressively deepen their understanding without hitting dead ends.

### Level 0: Zero Knowledge (No Arguments)

The user has never seen the CLI before. They type the command name with no arguments.

**What they get:** One-line description, list of commands, global flags, three examples, pointer to `--help`.

**Design goal:** Within five seconds, the user knows what the tool does and can run a meaningful first command by copying an example.

### Level 1: Command Exploration (`--help`)

The user knows the command they want but not the flags.

**What they get:** Full flag list with types, defaults, allowed values, required markers. Two to three examples showing common flag combinations. Exit codes. SEE ALSO for related commands.

**Design goal:** The user can construct a correct invocation without consulting any other source.

### Level 2: Error Recovery (Targeted Error Messages)

The user ran a command incorrectly.

**What they get:** Specific error message, the correct usage pattern, suggested fix, and pointer to `--help`.

**Design goal:** Self-correction without re-reading the full help text. One error message, one fix action.

### Level 3: Deep Knowledge (Man Pages, Web Docs)

The user needs to understand edge cases, environment variables, configuration file formats, or flag interactions.

**What they get:** Comprehensive man pages covering every section (OPTIONS, ENVIRONMENT, FILES, EXIT STATUS, EXAMPLES, SEE ALSO). Web documentation with search.

**Design goal:** Answer any question about the CLI's behavior without reading source code.

### Level 4: Programmatic Discovery (Agents)

An AI agent needs to construct commands, validate inputs, parse outputs, and chain workflows.

**What they get:** `--help-json` for machine-readable schema. `CONTEXT.md` for orientation and workflows. `AGENTS.md` for agent-specific guidance. `llms.txt` for high-level capability summary. `schema` command for input/output shapes.

**Design goal:** The agent can plan and execute multi-step workflows using the CLI without human guidance, handling errors and retries autonomously.

### The Discovery Flow

Each level feeds into the next. A user who starts at Level 0 (no arguments) is pointed to Level 1 (`--help`). Error messages at Level 2 point back to Level 1. Man pages at Level 3 cross-reference related commands. Agent context files at Level 4 reference all lower levels.

Never create a dead end. Every help screen, error message, and documentation page should point to at least one other discovery mechanism. The user — human or agent — should always know where to go next.
