# Designing CLI Output for AI Agent Consumption

CLI output is an API. When an AI agent consumes your CLI, every byte printed to stdout becomes tokens in its context window. Wasteful output burns budget and degrades reasoning. Ambiguous output causes retries and hallucinated next steps. This reference defines the patterns that make a CLI agent-friendly without sacrificing the human experience.

---

## The JSON Envelope Standard

Every command that produces structured output must wrap it in a consistent envelope. Agents parse envelopes mechanically — inconsistency forces special-case handling per command, which is fragile and error-prone.

### Success Envelope

```json
{
  "status": "ok",
  "data": {
    "id": "abc-123",
    "name": "my-resource",
    "created_at": "2026-03-07T10:30:00Z"
  },
  "warnings": [],
  "meta": {
    "request_id": "req-456",
    "duration_ms": 142
  }
}
```

### Error Envelope

```json
{
  "status": "error",
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Deployment 'web-app' not found",
    "fix": "Run: mycli deployments list --env staging",
    "transient": false
  }
}
```

### List with Pagination

```json
{
  "status": "ok",
  "data": [
    { "id": "dep-1", "name": "web-app", "status": "running" },
    { "id": "dep-2", "name": "worker", "status": "stopped" }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "per_page": 20,
    "next_cursor": "eyJpZCI6IDIwfQ=="
  }
}
```

### Envelope Design Rules

1. **`status` is always present.** Either `"ok"` or `"error"`. Never omit it, never use HTTP status codes, never use booleans. A string enum is unambiguous and grep-friendly.

2. **`data` holds the payload.** It is an object for single-resource responses, an array for collections. It is absent when `status` is `"error"`.

3. **`error` appears only on failure.** It is absent when `status` is `"ok"`. Never include both `data` and `error` in the same response.

4. **Use `snake_case` for all field names.** Not camelCase, not kebab-case. `snake_case` is the dominant convention in JSON APIs consumed by agents and scripts. Pick one and enforce it across every command.

5. **Timestamps are ISO 8601 with timezone.** Always `2026-03-07T10:30:00Z`, never `1709812200` or `"3 minutes ago"`. Agents cannot do relative time math reliably. Humans get relative timestamps in TTY mode only.

6. **IDs are strings.** Even if they are numeric internally, serialize as strings. This prevents integer overflow in JavaScript-based parsers and avoids type coercion surprises when agents pass IDs between commands.

7. **`warnings` is an array, even when empty.** This lets agents check `response.warnings.length` without null-checking. Warnings carry information that does not block the operation but that the caller should know (deprecations, partial results, rate limit proximity).

8. **`meta` carries operational metadata.** Request IDs for support tickets, durations for performance monitoring, pagination cursors for iteration. Never put business data in `meta`.

9. **`error.fix` suggests a remediation command.** This is the single most agent-friendly field. An agent that reads `"fix": "Run: mycli deployments list --env staging"` can execute that command immediately without reasoning about the fix. Not every error has a fix — omit the field when no concrete action exists.

10. **`error.transient` signals retry eligibility.** `true` means "try again" (rate limits, temporary network issues). `false` means "change your input" (not found, validation failure). Agents use this to decide between retry loops and error escalation.

---

## NDJSON for Streaming

Standard JSON requires the entire response to be buffered before parsing. For long-running operations, this means the agent sits idle until completion. Newline-delimited JSON (NDJSON) solves this: one JSON object per line, `\n` separated, parseable incrementally.

### When to Use NDJSON

- **Log tailing** — events arrive continuously with no defined end.
- **Batch operations** — processing 500 records, each producing a result.
- **Long builds** — compilation steps, test runs, deployment stages.
- **Large datasets** — streaming query results that would exceed memory as a single array.

### NDJSON Format

```
{"type":"progress","step":"building","detail":"Compiling src/main.ts","percent":25}
{"type":"progress","step":"building","detail":"Compiling src/utils.ts","percent":50}
{"type":"progress","step":"testing","detail":"Running 42 tests","percent":75}
{"type":"log","level":"warn","message":"Deprecated API usage in src/legacy.ts:14"}
{"type":"result","status":"ok","data":{"build_id":"bld-789","tests_passed":42,"tests_failed":0},"duration_ms":8340}
```

### NDJSON Rules

1. **Include a `type` field in every line.** Common types: `progress`, `log`, `result`, `error`. Agents filter by type to find the final outcome.
2. **The last line is the result.** Agents can skip all `progress` and `log` lines and parse only the final `result` line. This is the streaming equivalent of the envelope.
3. **Each line is independently valid JSON.** No trailing commas, no multi-line objects. One object, one line, one `\n`.
4. **Use `--stream` or `--follow` flags to opt in.** Default behavior should be buffered JSON. Streaming is opt-in because it changes the parsing strategy required by the consumer.

---

## Field Selection (`--fields`)

Field selection is the single highest-impact optimization for agent token consumption. A typical resource has 30-50 fields. An agent performing a lookup usually needs 2-3 of them.

### Interface

```bash
# Default: sensible subset
mycli deployments get web-app --json
# {"status":"ok","data":{"id":"dep-1","name":"web-app","status":"running","replicas":3}}

# Explicit fields
mycli deployments get web-app --json --fields id,name,status
# {"status":"ok","data":{"id":"dep-1","name":"web-app","status":"running"}}

# All fields
mycli deployments get web-app --json --fields all
# {"status":"ok","data":{"id":"dep-1","name":"web-app","status":"running","replicas":3,"image":"nginx:1.25","created_at":"2026-03-07T10:30:00Z","updated_at":"2026-03-07T14:22:00Z","env":{"NODE_ENV":"production"},...}}
```

### Implementation Rules

1. **`--fields` is comma-separated, no spaces.** `--fields id,name,status` not `--fields "id, name, status"`. Spaces in shell arguments cause splitting headaches.
2. **`--fields` only affects the `data` payload.** The envelope (`status`, `meta`, `warnings`) is always present in full. Agents rely on envelope consistency.
3. **Default to a sensible subset.** When `--fields` is omitted, return the fields most commonly needed: identifiers, names, statuses, timestamps. Omit large nested objects, base64 blobs, and verbose configuration blocks.
4. **Support `--fields all` explicitly.** Do not make agents guess the full field list. `all` is a reserved keyword that disables filtering.
5. **Invalid field names produce warnings, not errors.** `--fields id,naem` returns `data` with `id` only and `warnings: ["Unknown field: naem. Available: id, name, status, ..."]`. Agents may have stale field lists; crashing on a typo is hostile.

### Real-World Token Impact

A benchmark comparing output modes for a deployment listing of 50 resources:

| Mode | Output Size | Tokens (approx.) | % of Full |
|------|------------|-------------------|-----------|
| Full JSON (`--fields all`) | 1.8 MB | ~626,000 | 100% |
| Selected fields (`--fields id,name,status`) | 38 KB | ~13,000 | 2% |
| Quiet mode (`--quiet`) | 4.8 KB | ~1,600 | 0.3% |

The difference between `--fields all` and `--fields id,name,status` is **48x fewer tokens**. For an agent with a 200K context window, this is the difference between fitting the response and truncating it.

---

## Output Versioning

Structured output is an API contract. Agents build parsers against specific field names and types. Breaking that contract breaks the agent.

### Safe Changes (Non-Breaking)

- Add a new optional field to `data`.
- Add a new value to a string enum (if the consumer ignores unknown values).
- Add a new `type` value to NDJSON streams.
- Add fields to `meta`.

### Breaking Changes

- Remove or rename a field in `data`.
- Change a field's type (string to number, object to array).
- Change the envelope structure.
- Change the meaning of an existing enum value.
- Reorder fields that consumers parse positionally (TSV/CSV output).

### Versioning Strategies

**CLI version implies schema.** The simplest approach: document which CLI version introduced which fields. Agents pin to a CLI version and know what to expect. Works well for tools distributed as binaries.

```bash
mycli --version
# mycli 2.4.0
```

**Explicit `--format-version`.** For CLIs where multiple output schema versions must coexist:

```bash
mycli deployments list --json --format-version 2
```

**Schema introspection command.** Let agents discover the output schema at runtime:

```bash
mycli schema deployments.get --json
# {"fields":[{"name":"id","type":"string"},{"name":"name","type":"string"},{"name":"status","type":"string","enum":["running","stopped","error"]},...]}
```

This is the most agent-friendly approach: the agent can validate its parser against the live schema before executing commands.

---

## Token-Efficient Output

Every token in an agent's context window has a cost — financial and cognitive. These strategies minimize waste.

| Strategy | Flag | Effect |
|----------|------|--------|
| Field selection | `--fields f1,f2` | Return only named fields in `data` |
| Quiet mode | `--quiet` / `-q` | Print only IDs or single-line confirmations |
| No headers | `--no-headers` | Omit column headers in table output |
| Row limit | `--limit N` | Return at most N items from a list |
| Summary | `--summary` | Aggregated counts instead of individual records |

### Quiet Mode (`-q`)

Quiet mode prints the minimum useful output — typically just the resource ID:

```bash
mycli deployments create --name web-app --image nginx -q
# dep-abc-123
```

This is ideal for scripting and agent pipelines where the output is immediately consumed as input to another command:

```bash
mycli deployments scale $(mycli deployments create --name web-app -q) --replicas 3
```

### Summary Mode (`--summary`)

When an agent needs aggregate information, not individual records:

```bash
mycli deployments list --summary --json
# {"status":"ok","data":{"total":42,"by_status":{"running":38,"stopped":3,"error":1}}}
```

---

## Human-Readable Output (TTY Mode)

When stdout is a terminal, output should be optimized for human scanning — not JSON parsing.

### Table Output

```
NAME       STATUS    REPLICAS   AGE
web-app    running   3          2d ago
worker     stopped   1          5h ago
api-gw     running   2          14d ago
```

Table rules:
- **No borders.** Pipes and dashes waste vertical space. Align with spaces.
- **Aligned columns.** Right-align numbers, left-align strings.
- **Relative timestamps.** `2d ago` not `2026-03-05T10:30:00Z`. Humans scan relative times faster.
- **Truncate long values.** Clip to column width with `...`. Provide `--no-truncate` to disable.
- **Color for status.** Green for healthy, red for errors, yellow for warnings. Never encode meaning in color alone — always pair with text (`running`, `error`).

### Single Resource Output

```
Name:        web-app
Status:      running
Replicas:    3
Image:       nginx:1.25
Created:     2 days ago (2026-03-05T10:30:00Z)
```

Key-value pairs, colon-aligned, one field per line. Include both relative and absolute timestamps so the human gets both at a glance.

### Success Confirmation

```
Deployment 'web-app' created successfully.

  ID:       dep-abc-123
  Status:   running
  URL:      https://web-app.example.com

Next steps:
  View logs:     mycli logs dep-abc-123 --follow
  Scale up:      mycli deployments scale dep-abc-123 --replicas 5
  Open browser:  mycli open dep-abc-123
```

The "Next steps" section is critical. It appears in both TTY and JSON modes (as `meta.next_steps` in JSON).

---

## TTY Detection and Dual-Mode Output

A well-designed CLI produces different output depending on whether stdout is a terminal (TTY) or a pipe/file.

### When stdout IS a TTY (Interactive)

- Render tables with colors, alignment, and truncation.
- Show progress bars and spinners (on stderr).
- Prompt for confirmation on destructive actions.
- Use relative timestamps.

### When stdout is NOT a TTY (Piped/Redirected)

- Print plain text or JSON — no tables, no colors.
- Strip all ANSI escape codes.
- Suppress spinners and progress bars.
- Never prompt — fail or use `--yes` defaults.
- Use absolute timestamps.

### Priority Chain for Output Mode

The CLI must resolve output mode using this priority chain, evaluated top to bottom:

```
1. --json flag              → JSON envelope, no color, no interactive
2. --no-color flag          → Text output, no ANSI codes
3. NO_COLOR env var set     → Text output, no ANSI codes (see https://no-color.org)
4. FORCE_COLOR env var set  → Override: enable color even in pipes
5. TERM=dumb                → No ANSI codes, no cursor movement
6. CI=true                  → No interactive prompts, no spinners
7. !isatty(stdout)          → Plain text, no ANSI, no interactive
8. Default                  → Full interactive mode with colors
```

Implementation sketch (Node.js):

```javascript
function resolveOutputMode(flags, env, stream) {
  if (flags.json) return { format: 'json', color: false, interactive: false };
  if (flags.noColor || env.NO_COLOR !== undefined) return { format: 'text', color: false, interactive: isatty(stream) };
  if (env.FORCE_COLOR) return { format: 'text', color: true, interactive: isatty(stream) };
  if (env.TERM === 'dumb') return { format: 'text', color: false, interactive: false };
  if (env.CI === 'true') return { format: 'text', color: isatty(stream), interactive: false };
  if (!isatty(stream)) return { format: 'text', color: false, interactive: false };
  return { format: 'text', color: true, interactive: true };
}
```

---

## The "Next Steps" Pattern

Every command output — success, failure, or partial — should guide the consumer toward the next action. This is the pattern that makes agents autonomous: they read the output, find the suggested command, and execute it without needing to reason about what to do next.

### On Success

```json
{
  "status": "ok",
  "data": { "id": "dep-abc-123", "name": "web-app", "status": "deploying" },
  "meta": {
    "next_steps": [
      { "description": "Watch deployment progress", "command": "mycli deployments watch dep-abc-123" },
      { "description": "View logs", "command": "mycli logs dep-abc-123 --follow" }
    ]
  }
}
```

### On Failure

```json
{
  "status": "error",
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Cannot create deployment: CPU quota exceeded (used 8/8 cores)",
    "fix": "Run: mycli quotas request --resource cpu --amount 16",
    "transient": false
  }
}
```

The `fix` field is a single, directly executable command. If multiple remediation paths exist, use the most common one as `fix` and list alternatives in `error.alternatives`:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "CPU quota exceeded",
    "fix": "Run: mycli quotas request --resource cpu --amount 16",
    "alternatives": [
      "Scale down existing deployments: mycli deployments scale web-app --replicas 1",
      "Delete unused deployments: mycli deployments delete old-service"
    ],
    "transient": false
  }
}
```

### On Partial Results

```json
{
  "status": "ok",
  "data": [...],
  "warnings": ["Results truncated. Showing 20 of 42 items."],
  "meta": {
    "total": 42,
    "per_page": 20,
    "next_cursor": "eyJpZCI6IDIwfQ==",
    "next_steps": [
      { "description": "Fetch next page", "command": "mycli deployments list --cursor eyJpZCI6IDIwfQ==" },
      { "description": "Fetch all at once", "command": "mycli deployments list --limit 0" }
    ]
  }
}
```

Agents loop on `next_cursor` until it is `null`. The `next_steps` command makes this explicit — the agent does not need to construct the pagination command itself.

---

## stderr for Everything Else

stdout is the data channel. stderr is the diagnostics channel. Never mix them.

### What Goes to stderr

- **Progress bars and spinners.** Visual feedback for humans, noise for parsers.
- **Warning messages.** Deprecation notices, non-fatal issues.
- **Debug traces.** Enabled by `--verbose` or `--debug`, always to stderr.
- **Prompts.** "Are you sure?" confirmation text.
- **Timing information.** "Completed in 3.2s" summaries.

### What Goes to stdout

- **The data.** JSON envelopes, table output, IDs in quiet mode. Nothing else.

### stderr and TTY Detection

ANSI escape codes are acceptable on stderr, but only when stderr is itself a TTY. An agent may redirect stdout to a file while keeping stderr visible in a terminal:

```bash
mycli deployments list --json > results.json  # stderr still shows spinner in terminal
```

Check `isatty(stderr)` independently from `isatty(stdout)`.

### Implementation Example

```python
import sys

def progress(message: str) -> None:
    """Write progress to stderr, with color only if stderr is a TTY."""
    if sys.stderr.isatty():
        sys.stderr.write(f"\033[36m{message}\033[0m\n")
    else:
        sys.stderr.write(f"{message}\n")

def output(data: dict) -> None:
    """Write data to stdout. Never includes ANSI codes."""
    json.dump(data, sys.stdout)
    sys.stdout.write("\n")
```

---

## Anti-Patterns

These patterns actively harm agent consumption. Avoid them.

### Mixing Data and Diagnostics on stdout

```bash
# WRONG — agent parses "Connecting..." as part of the response
Connecting to cluster...
{"id": "dep-1", "name": "web-app"}

# CORRECT — diagnostics to stderr, data to stdout
# stderr: Connecting to cluster...
# stdout: {"status":"ok","data":{"id":"dep-1","name":"web-app"}}
```

When an agent runs `mycli deployments get web-app --json` and pipes stdout to a JSON parser, the "Connecting..." line causes a parse error. The agent retries, gets the same error, and wastes context on failure handling.

### ANSI Codes in Piped Output

```bash
# WRONG — ANSI codes become literal tokens when consumed by an LLM
\033[32mrunning\033[0m

# What the agent sees: "[32mrunning[0m" — 16 wasted characters per colored word
```

ANSI escape sequences are not stripped by most JSON parsers or LLM tokenizers. They appear as literal text in the agent's context, wasting tokens and confusing field extraction. A response with 200 colored fields wastes thousands of tokens on escape codes that convey zero information to the agent.

### Printing Nothing on Success

```bash
# WRONG — agent cannot distinguish success from hang/crash
mycli deployments delete web-app
# (no output)

# CORRECT — explicit confirmation
mycli deployments delete web-app --json
# {"status":"ok","data":{"id":"dep-1","deleted":true}}

mycli deployments delete web-app -q
# dep-1
```

Silent success is ambiguous. The agent cannot tell if the command succeeded, failed silently, or is still running. Always print at least an ID or a status confirmation.

### Verbose Default Output

Some tools produce enormous default output. A real example: running a test suite with default verbosity can emit hundreds of kilobytes of output per run.

```
# vitest default output: 419 KB for a medium test suite
# What the agent needs: "42 passed, 0 failed, 0 skipped"
```

Default verbosity should target the common case. For CLIs consumed by agents, the common case is "did it work, and if not, what failed?" A summary with failure details on demand (`--verbose` for full output) serves both humans and agents.

### Inconsistent Envelope Shapes

```bash
# WRONG — different commands return different shapes
mycli deployments list   → {"items": [...]}
mycli deployments get    → {"deployment": {...}}
mycli deployments create → {"result": "success", "id": "dep-1"}

# CORRECT — every command uses the same envelope
mycli deployments list   → {"status":"ok","data":[...],"meta":{...}}
mycli deployments get    → {"status":"ok","data":{...}}
mycli deployments create → {"status":"ok","data":{"id":"dep-1",...}}
```

Inconsistent envelopes force agents to maintain per-command parsing logic. A single envelope shape means a single parser that works everywhere.

### Mixed Casing Conventions

```bash
# WRONG — some commands use camelCase, others use snake_case
{"createdAt": "2026-03-07", "deployment_name": "web-app"}

# CORRECT — pick one, enforce everywhere
{"created_at": "2026-03-07", "deployment_name": "web-app"}
```

Mixed casing is a maintenance hazard for agents. They must try both `created_at` and `createdAt` for every field, or maintain a mapping table. Pick `snake_case` and enforce it with a linter in CI.

---

## Summary

The hierarchy of agent-friendly output design:

1. **Consistent envelope** — same shape, every command, every time.
2. **Field selection** — let agents request only what they need.
3. **Next steps** — guide the agent to its next action.
4. **Fix commands** — tell agents exactly how to recover from errors.
5. **stderr separation** — never contaminate the data stream.
6. **TTY detection** — adapt output to the consumer automatically.
7. **Quiet mode** — give agents an escape hatch for minimal output.
8. **NDJSON for streams** — do not buffer what can be streamed.

Every decision should answer one question: "Can an agent parse this output, extract what it needs, and determine its next action — without guessing?"
