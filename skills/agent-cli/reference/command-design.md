# Command Design Reference

How to structure CLI commands, flags, and arguments so that both humans and AI agents can discover, parse, and compose them reliably.

---

## Command Grammar

Every CLI must pick one grammar pattern and use it everywhere. Mixing patterns forces users to memorize which commands follow which convention, and agents cannot predict the shape of a command they have not seen before.

### Noun-Verb (kubectl style)

The resource comes first, the action second:

```
mycli pod list
mycli pod delete my-pod
mycli service describe web-frontend
mycli namespace create staging
```

Advantages: tab-completion narrows to a resource first, then shows only the actions that apply to that resource. Discovery is natural — "what can I do with pods?" becomes `mycli pod --help`.

### Verb-Noun (docker style)

The action comes first, the resource second:

```
mycli list pods
mycli delete pod my-pod
mycli describe service web-frontend
mycli create namespace staging
```

Advantages: common verbs cluster together, so `mycli list --help` reveals every resource type the CLI knows about.

### Choosing

Pick one and enforce it across every command. The noun-verb pattern scales better when resources outnumber actions (many resource types, few verbs). The verb-noun pattern reads more naturally when the CLI has few resources but many distinct operations.

### Standard Verbs

Standardize the verb vocabulary across all resources. Agents rely on predictable verbs to construct commands without consulting help text for every resource.

| Verb | Semantics | Typical Output |
|------|-----------|----------------|
| `list` | Return all instances, optionally filtered | Table or JSON array |
| `get` / `show` | Return one instance by identifier | Detail view or JSON object |
| `create` | Provision a new instance | Created resource summary |
| `update` | Modify an existing instance in place | Updated resource summary |
| `delete` | Remove an instance | Confirmation message |
| `describe` | Return enriched detail (status, events, metadata) | Extended detail view |

Pick either `get` or `show`, not both. If the CLI has both `get` (brief) and `describe` (extended), document the distinction in the root help text.

---

## Subcommand Hierarchy

### Depth Limits

Keep the hierarchy to two or three levels maximum:

```
mycli <resource> <action>              # 2 levels — ideal
mycli <group> <resource> <action>      # 3 levels — acceptable for large CLIs
mycli <group> <sub> <resource> <action> # 4 levels — too deep, rethink grouping
```

Every additional level adds cognitive load and typing. Agents must store the full path to invoke a command; deeper trees increase the chance of path errors.

### Grouping Principle

Group by domain or resource, not by technical concern:

```
# CORRECT — grouped by domain
mycli compute instance list
mycli compute instance create
mycli storage bucket list
mycli storage bucket create

# WRONG — grouped by technical layer
mycli api compute-list-instances
mycli api storage-list-buckets
mycli grpc compute-create-instance
```

Domain grouping lets agents reason about "what resources exist in compute?" without knowing the transport layer.

### Help at Every Level

Every level of the hierarchy must respond to `--help`:

- **Root** (`mycli --help`): overview, list of top-level groups/commands, global flags, 2-3 examples of the most common workflows.
- **Group** (`mycli compute --help`): purpose of the group, list of resources within it.
- **Resource** (`mycli compute instance --help`): list of actions, resource-specific flags.
- **Action** (`mycli compute instance create --help`): full flag documentation, examples, exit codes.

### Root Command with No Arguments

Running `mycli` with no arguments should print the same content as `mycli --help` and exit with code 0. Never print an error or a bare usage string. The root output is the front door for discovery — it should show the top 5-7 commands, a quick example, and a pointer to `mycli --help` for the full listing.

---

## Flag Conventions

### Flag Types

**Boolean** flags toggle behavior on or off. They take no value:

```
--dry-run        # Preview changes without applying
--yes            # Skip confirmation prompts
--verbose        # Increase output detail
--no-color       # Disable ANSI color codes
--force          # Bypass safety checks
```

**String** flags accept a single string value:

```
--env staging
--name web-app
--region us-east-1
```

**Enum** flags accept one value from a fixed set. Document the allowed values in `--help`:

```
--output json|yaml|table
--log-level debug|info|warn|error
--strategy rolling|blue-green|canary
```

If the user supplies a value outside the set, print the allowed values in the error message — do not just say "invalid value."

**List** flags accept multiple values. Support both the comma-separated and repeated-flag forms:

```
--tags tag1,tag2,tag3
--tag tag1 --tag tag2 --tag tag3
```

When both forms are supported, document which is canonical and mention the alternative. Agents prefer the repeated-flag form because it avoids shell quoting issues with commas inside values.

**Duration** flags accept human-readable durations:

```
--timeout 5m
--since 1h
--interval 30s
--ttl 7d
```

Support at minimum `s` (seconds), `m` (minutes), `h` (hours), `d` (days). Document the format in `--help`.

**File** flags accept a filesystem path:

```
--config ./config.yaml
--password-file ~/.secret
--cert /etc/ssl/cert.pem
```

Support `-` to mean stdin where it makes sense (`--input -`). This lets agents pipe data between commands without temporary files.

### Flag Rules

**1. Long flags always, short aliases selectively.** Every flag must have a `--long-form`. Add short aliases (`-e`, `-n`, `-o`) only for flags that users and agents will type frequently. Short aliases are convenient but hard to remember when the CLI has dozens of flags.

**2. Mark required flags explicitly.** In `--help` output, annotate required flags:

```
--name string    Name of the resource (required)
--env string     Target environment (default: "development")
```

Never silently use a default for a flag that should be required. If `--name` has no sensible default, make it required and fail with a clear error if omitted.

**3. Show default values.** Every flag with a default must display it:

```
--limit int       Maximum items to return (default: 20)
--output string   Output format: json, yaml, table (default: table)
--timeout duration   Request timeout (default: 30s)
```

**4. Prefer flags over positional arguments.** Flags are self-documenting (the name tells you what the value means), order-independent (rearranging does not break the command), and future-proof (adding a new flag does not shift positional meaning).

**5. Positional argument budget.** One positional argument is acceptable when it represents the primary resource identifier. Two positional arguments are suspicious — consider making the second a flag. Three positional arguments are wrong — convert to flags.

**6. Never accept secrets via flags.** Flag values are visible in `ps aux`, shell history, and process listings. Secrets must come from environment variables, files (`--password-file`), or stdin:

```
# WRONG — secret visible in process table and shell history
mycli login --password hunter2

# CORRECT — read from file
mycli login --password-file ~/.mycli/credentials

# CORRECT — read from environment
MYCLI_PASSWORD=hunter2 mycli login

# CORRECT — read from stdin
echo "hunter2" | mycli login --password-stdin
```

**7. Global flags.** These flags must be available on every command and subcommand:

| Flag | Purpose |
|------|---------|
| `--json` | Force JSON output (overrides `--output`) |
| `--quiet` / `-q` | Suppress non-essential output |
| `--verbose` / `-v` | Increase output detail |
| `--no-color` | Disable ANSI color codes |
| `--help` / `-h` | Show help for the current command |
| `--version` | Show version (root command only) |

`--json` is the most important global flag for agent consumption. When present, the command must output valid JSON to stdout and nothing else. Diagnostic messages, progress bars, and warnings go to stderr.

---

## Positional Arguments

### When Acceptable

A single positional argument is appropriate when it represents the primary thing the command operates on:

```
mycli get my-resource
mycli run script.py
mycli describe my-pod
mycli delete my-deployment
```

The positional argument is the resource identifier. It reads naturally and is unambiguous.

### When Not Acceptable

Multiple positional arguments create ambiguity — both for humans and for agents:

```
# WRONG — which is environment, which is version?
mycli deploy production v2.1.0

# CORRECT — flags make meaning explicit
mycli deploy --env production --version v2.1.0
```

```
# WRONG — order-dependent positional arguments
mycli copy source-bucket dest-bucket

# CORRECT — named flags
mycli copy --source source-bucket --destination dest-bucket
```

The test: if swapping two positional arguments would change the command's meaning, they should be flags instead.

---

## The `--version` Flag

### Requirements

The `--version` flag must exist on the root command. It exits immediately with code 0 after printing version information.

### Output Format

Plain text output — simple and parseable:

```
$ mycli --version
mycli version 2.3.1
```

Or the compact form:

```
$ mycli --version
mycli/2.3.1
```

### Structured Output

When combined with `--json`, include build metadata that helps with debugging and reproducibility:

```json
{
  "version": "2.3.1",
  "commit": "abc123def",
  "build_date": "2026-03-07T14:30:00Z",
  "go_version": "go1.23.1",
  "platform": "darwin/arm64"
}
```

The `commit` and `build_date` fields help diagnose issues in bug reports. Agents use the structured version output to check compatibility before invoking commands.

---

## The `--help` Flag

### Requirements

Every command and subcommand must respond to `--help`. The output structure follows a consistent order.

### Structure

```
Description (one sentence explaining what this command does)

Usage:
  mycli resource action [flags]

Flags:
  --name string        Name of the resource (required)
  --env string         Target environment (default: "development")
  --replicas int       Number of replicas (default: 1)
  --output string      Output format: json, yaml, table (default: table)
  --dry-run            Preview changes without applying
  -h, --help           Show help for this command

Global Flags:
  --json               Force JSON output
  -q, --quiet          Suppress non-essential output
  -v, --verbose        Increase output detail
  --no-color           Disable ANSI color codes

Examples:
  # Create a resource in staging
  mycli resource create --name web-app --env staging

  # Create with dry-run to preview
  mycli resource create --name web-app --env staging --dry-run

  # Create and output as JSON
  mycli resource create --name web-app --env staging --json

Exit Codes:
  0   Success
  1   General error
  2   Invalid arguments or flags
  3   Resource not found
  64  Authentication failure

See Also:
  mycli resource list     List all resources
  mycli resource delete   Delete a resource
  mycli resource describe Show detailed resource information
```

### Key Points

- **Examples are the most-read section.** Put 2-3 examples that cover the most common use cases. Each example should have a comment line above it explaining the scenario.
- **Flag documentation must include type, default, and allowed values.** An agent cannot construct a valid command from `--output (default: table)` alone — it needs to know the type is string and the allowed values are json, yaml, table.
- **Exit codes must be documented and stable.** Agents use exit codes to decide what to do next. A nonzero exit code without documentation forces the agent to parse stderr, which is fragile.

---

## Consistent Naming

### Commands and Flags: kebab-case

```
create-user       # command
--dry-run         # flag
--log-level       # flag
delete-all        # command
```

### Error Codes: SCREAMING_SNAKE_CASE

```
RESOURCE_NOT_FOUND
AUTHENTICATION_FAILED
RATE_LIMIT_EXCEEDED
INVALID_CONFIGURATION
```

Error codes appear in structured error output and are matched by agents for programmatic error handling.

### JSON Field Names: snake_case

```json
{
  "resource_name": "web-app",
  "created_at": "2026-03-07T14:30:00Z",
  "replica_count": 3,
  "is_active": true
}
```

### The Rule

Never mix conventions within the same CLI. If flags are kebab-case, every flag is kebab-case. If JSON fields are snake_case, every JSON field is snake_case. Inconsistency forces agents to maintain exception tables.

---

## Anti-Patterns

### Inconsistent Grammar

Mixing noun-verb and verb-noun within the same CLI:

```
# Some commands are noun-verb
mycli pod list
mycli pod delete

# Others are verb-noun — inconsistent
mycli list namespaces
mycli create service
```

An agent that learns the noun-verb pattern from `pod list` will construct `namespace list`, which fails because the actual command is `list namespaces`.

### Flag Explosion

A single command with 20+ flags signals that the command is doing too many things:

```
# Too many flags — this is three commands pretending to be one
mycli deploy --name web --env prod --replicas 3 --strategy rolling \
  --health-check-path /healthz --health-check-interval 10s \
  --min-ready 2 --max-surge 1 --cpu-limit 500m --memory-limit 256Mi \
  --port 8080 --protocol tcp --tls --cert-file cert.pem \
  --domain web.example.com --cdn --cdn-ttl 3600 ...
```

Break into subcommands or accept a configuration file:

```
mycli deploy --name web --env prod --config deploy.yaml
```

### Hidden Flags

Undocumented flags that only appear in source code or tribal knowledge. If a flag exists, it must appear in `--help`. If it is experimental, prefix it with `--experimental-` and mark it as unstable.

### Changing Positional Argument Meaning

If version 1.0 of the CLI accepts `mycli deploy <environment>` and version 2.0 changes it to `mycli deploy <service-name>`, every script and agent that uses the CLI breaks silently — the command succeeds but does the wrong thing.

### Overloaded Commands

A single command that does completely different things depending on flag combinations:

```
# Without --delete, this lists resources
mycli resources --env staging

# With --delete, this deletes ALL resources — opposite behavior
mycli resources --env staging --delete
```

These should be two separate commands: `mycli resources list` and `mycli resources delete-all`.

---

## Backward Compatibility

Treat the CLI surface as a versioned API contract. Users and agents write scripts against the current behavior. Changing that behavior without warning breaks those scripts.

### Breaking Changes

Any of these require a major version bump:

- Removing a flag or command
- Renaming a flag or command
- Changing exit code meanings
- Removing fields from JSON output
- Changing default values
- Changing the meaning of a positional argument
- Changing a flag from optional to required

### Safe Changes

These can ship in any release:

- Adding new flags with sensible defaults
- Adding new optional fields to JSON output
- Adding new subcommands
- Adding `--json` support where it did not exist
- Adding new enum values to an existing enum flag
- Adding short aliases for existing long flags

### The Rule

Add, don't modify. When a flag or output field must change, follow the deprecation cycle:

1. **Deprecate**: add a stderr warning when the old flag is used. Introduce the new flag alongside it.
2. **Document**: update `--help`, changelogs, and migration guides.
3. **Remove**: after at least one major version with the deprecation warning, remove the old flag.

```
$ mycli deploy --target staging
WARNING: --target is deprecated, use --env instead. --target will be removed in v4.0.

$ mycli deploy --env staging
# no warning
```

Agents can detect deprecation warnings on stderr and update their command templates. The warning must include the replacement flag name so automated migration is possible.

### Version Negotiation

For CLIs that agents invoke frequently, support a machine-readable capability check:

```
$ mycli --version --json
{
  "version": "3.2.0",
  "commit": "abc123def",
  "build_date": "2026-03-07T14:30:00Z",
  "features": ["json-output", "batch-delete", "dry-run"]
}
```

The `features` array lets agents check for capabilities without parsing version strings. This is especially useful during rolling upgrades where different hosts may run different CLI versions.
