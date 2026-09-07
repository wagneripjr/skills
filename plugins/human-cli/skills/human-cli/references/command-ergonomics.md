# Command Ergonomics

How to design command names, grammar patterns, subcommand hierarchies, flags, and aliases that humans remember and type confidently. A well-designed command surface lets users construct valid invocations from memory, reducing reliance on `--help`.

---

## Naming Conventions

### kebab-case for multi-word commands

Commands and subcommands use kebab-case: `create-snapshot`, `list-users`, `sync-files`. Never camelCase (`createSnapshot`), snake_case (`create_snapshot`), or concatenation (`createsnapshot`).

**Why:** Shell completion works best with kebab-case. Users expect it from `git`, `docker`, `gh`. Consistency with the ecosystem reduces learning cost.

### Short, memorable root names

The root command name should be:
- 2-6 characters when possible (`rg`, `fd`, `gh`, `uv`, `bat`)
- Pronounceable or at least type-able without looking
- Unique in the user's PATH (check with `command -v <name>`)

Avoid generic names like `tool`, `cli`, `app`, `run`. They collide and teach nothing.

### Verb vocabulary

Standardize on a small set of verbs across all resources:

| Verb | Meaning | Example |
|------|---------|---------|
| `list` | Enumerate resources | `mycli pods list` |
| `get` / `show` | Retrieve single resource detail | `mycli pod get <id>` |
| `create` | Create new resource | `mycli pod create` |
| `update` | Modify existing resource | `mycli pod update <id>` |
| `delete` / `remove` | Destroy resource | `mycli pod delete <id>` |
| `apply` | Declarative create-or-update | `mycli pod apply -f spec.yaml` |
| `status` | Current state summary | `mycli pod status <id>` |

Pick one synonym and use it everywhere. Don't mix `delete` and `remove` across different resources.

---

## Grammar Patterns

### Noun-verb: `mycli <resource> <action>`

```
mycli pod list
mycli pod create --name web
mycli service deploy --env prod
```

**When to use:** CLIs managing multiple resource types (infrastructure, databases, cloud services). Users think "I want to do X to Y" — `mycli Y X` maps naturally. Examples: `kubectl`, `docker`, `aws`.

### Verb-noun: `mycli <action> <resource>`

```
mycli list pods
mycli create pod --name web
mycli deploy service --env prod
```

**When to use:** CLIs with a small number of actions applied across many resources. Users think "I want to list..." — `mycli list` gives immediate completion hints. Examples: `gh`, `heroku`.

### Action-only (flat): `mycli <action>`

```
mycli init
mycli build
mycli test
mycli deploy
```

**When to use:** Single-purpose CLIs with a linear workflow. Each command represents a pipeline stage. Examples: `cargo`, `npm`, `uv`.

**Rule:** Pick one grammar pattern and apply it consistently. Mixing noun-verb and verb-noun in the same CLI creates confusion.

---

## Subcommand Hierarchy

### Depth limit: 2-3 levels

```
# Good (2 levels)
mycli pod list
mycli pod create

# Acceptable (3 levels)
mycli cluster node drain

# Too deep (4+ levels)
mycli cluster node pool resize    # Users lose track
```

**Why:** Every level of nesting is a memory slot the user must fill. Beyond 3 levels, users resort to `--help` on every invocation. Flatten by combining nouns: `mycli nodepool resize` instead of `mycli cluster node pool resize`.

### Group by user intent, not by implementation

```
# Good: grouped by what users want to do
mycli deploy          # deploy to environment
mycli deploy rollback # undo last deploy
mycli deploy status   # check deploy state

# Bad: grouped by internal architecture
mycli kubernetes apply
mycli terraform plan
mycli ansible run
```

---

## Flag Design

### Long flags are self-documenting

```
--output-format json    # Clear intent
--env production        # Readable in scripts
--max-retries 3         # Self-explaining
```

### Short aliases save keystrokes

Assign single-letter aliases only to the most-used flags:

| Long | Short | Convention |
|------|-------|-----------|
| `--verbose` | `-v` | Nearly universal |
| `--quiet` | `-q` | Nearly universal |
| `--force` | `-f` | Common for bypasses |
| `--output` | `-o` | Common for format |
| `--recursive` | `-r` / `-R` | Common for tree ops |
| `--all` | `-a` | Common for list ops |

**Rule:** Never assign short aliases to destructive flags. `--delete-all` should not have `-d` — accidental invocation via `-d` when the user meant something else is too risky.

### Boolean flags: affirmative by default

```
--color          # on by default, use --no-color to disable
--interactive    # on by default if TTY, use --no-interactive
--progress       # on by default, use --no-progress to disable
```

Use `--no-<flag>` to negate. Don't require `--color=true` — the presence of the flag implies true.

### Enum flags: list allowed values in help

```
--format <table|json|csv|yaml>    # Enumerated choices
--log-level <debug|info|warn|error>
```

Show allowed values in `--help` and in error messages when an invalid value is passed: `Error: invalid --format 'xml'. Allowed: table, json, csv, yaml`.

---

## Argument Budget

### The 5-flag rule

If a command requires more than 5 flags to be useful, consider:

1. **Config file:** `mycli deploy --config deploy.yaml`
2. **Subcommands:** Split into focused sub-operations
3. **Interactive prompts:** Guide the user through required inputs
4. **Sensible defaults:** Reduce the number of required flags

```
# Too many flags — user has to read docs for every invocation
mycli deploy --env prod --region us-east-1 --replicas 3 --image app:v2 --port 8080 --health-path /healthz --timeout 300 --rollback-on-failure

# Better — config file for the common case, flags for overrides
mycli deploy --config deploy.yaml --env prod
```

### Positional arguments: at most 1-2

Positional arguments are convenient for the most common input but become ambiguous with more than 2:

```
# Good: one positional
mycli get pod-name

# Acceptable: two positional with clear order
mycli copy source destination

# Bad: three positional — which is which?
mycli move source destination backup
# Use flags instead: mycli move source dest --backup-to dir
```

---

## Aliases and Abbreviations

### Built-in command aliases

Provide short aliases for the most common operations:

```
mycli ls    → mycli list
mycli rm    → mycli remove
mycli mv    → mycli move
mycli cp    → mycli copy
mycli info  → mycli show
```

Document aliases in `--help` so users discover them.

### User-defined aliases

Support user aliases via config file:

```toml
# ~/.config/mycli/aliases.toml
[aliases]
deploy-prod = "deploy --env production --region us-east-1"
quick-test  = "test --watch --filter unit"
```

This lets power users encode their workflows without the CLI needing to anticipate every pattern.

---

## Backward Compatibility

### Flags are the API contract

Renaming `--output` to `--format` is a breaking change. Users have scripts, shell aliases, and muscle memory depending on flag names.

**Safe changes:**
- Add new flags with defaults
- Add new subcommands
- Add new aliases for existing commands

**Breaking changes (require major version bump):**
- Rename or remove flags
- Change flag semantics (e.g., `--force` now means something different)
- Remove subcommands
- Change default behavior

### Deprecation workflow

1. Add the new flag/command alongside the old one
2. When the old one is used, emit a stderr warning: `Warning: --output is deprecated, use --format instead. Will be removed in v3.0.`
3. Keep both working for at least one major version
4. Remove in the next major version with a migration guide
