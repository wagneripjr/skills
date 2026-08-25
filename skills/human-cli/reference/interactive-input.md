# Interactive Input & Prompting

When and how to prompt users interactively, how to design bypass flags for automation, and how to handle stdin detection. Interactive prompts make CLIs safer and more approachable — but only when they help, not when they block.

---

## When to Prompt

### Prompt for destructive or irreversible operations

```
$ mycli database drop users-prod
⚠ This will permanently delete the 'users-prod' database (2.3 GB, 1.2M rows).
  This action cannot be undone.

  Type the database name to confirm: █
```

### Prompt when defaults are ambiguous

```
$ mycli deploy
? Which environment? (Use arrow keys)
❯ staging
  production
  development
```

### Do NOT prompt for:

- **Normal operations with sane defaults.** `mycli list` should just list, not ask "which resource?"
- **Operations in a pipeline.** If stdin is not a TTY, fail with an error instead of hanging.
- **Repeatable workflows.** If the user runs the same command 20 times a day, prompts become friction. Provide flag shortcuts.

---

## Prompt Types

### Confirm (yes/no)

The simplest prompt. Use for binary decisions, especially destructive ones.

```
? Delete 3 pods in namespace 'production'? (y/N) █
```

- **Default to "no" for destructive operations.** Capital `N` signals the default.
- **Default to "yes" for safe operations.** `(Y/n)` for non-destructive actions.
- **Accept:** `y`, `yes`, `Y`, `YES`, `n`, `no`, `N`, `NO`. Case-insensitive.
- **Bypass flag:** `--yes` or `--force` or `-y`

### Select (pick one)

Use when the user must choose from a known list. Show the list, highlight the current selection.

```
? Select deployment target:
  development
❯ staging
  production (requires approval)
```

- **Sort by frequency of use**, not alphabetically (unless the list is long).
- **Limit to 7±2 items.** For longer lists, add search/filter.
- **Bypass flag:** `--target staging` (explicit flag matching the prompt's purpose)

### Multi-select (pick many)

```
? Select services to restart: (Press <space> to select, <a> to toggle all)
 ◉ api-gateway
 ◯ web-frontend
 ◉ worker
 ◯ scheduler
```

- **Bypass flag:** `--services api-gateway,worker` (comma-separated)

### Text input with validation

```
? Enter new cluster name: █
  (3-40 chars, lowercase alphanumeric and hyphens only)
```

- Validate as the user types when possible (immediate feedback).
- Show the validation rule below the prompt.
- **Bypass flag:** `--name my-cluster`

### Password/secret input

```
? Enter API token: ████████
```

- **Never echo the input.** Mask with dots or hide entirely.
- **Prefer alternatives to prompts:** `--token-file`, `MYCLI_TOKEN` env var, or OS keychain.
- **Never accept secrets as flag values** — they leak to shell history and `ps`.

---

## Flag Bypass Conventions

Every interactive prompt must have a corresponding flag or environment variable that provides the answer non-interactively.

| Prompt type | Flag bypass | Env var bypass |
|-------------|-------------|----------------|
| Confirm (destructive) | `--force` or `--yes` | `MYCLI_FORCE=1` |
| Select environment | `--env <name>` | `MYCLI_ENV=staging` |
| Text input (name) | `--name <value>` | — |
| Password | `--token-file <path>` | `MYCLI_TOKEN=xxx` |
| Multi-select | `--services a,b,c` | — |

### The `--yes` / `--force` distinction

- `--yes` (`-y`): Skip confirmation prompts, accept defaults for all selections. Equivalent to pressing Enter on every prompt.
- `--force`: Skip confirmation AND override safety checks. More aggressive than `--yes`. Example: `--force` deletes even when dependent resources exist.

Document the distinction. Don't use them interchangeably.

---

## Non-TTY Behavior

When stdin is not a TTY (piped, redirected, or running in CI), the CLI must never block waiting for user input.

### Detection

```python
import sys
if not sys.stdin.isatty():
    # Non-interactive mode
    pass
```

```js
import { isatty } from 'node:tty';
if (!isatty(0)) {  // fd 0 = stdin
    // Non-interactive mode
}
```

### Behavior when non-interactive

1. **Required input missing:** Fail with an actionable error message:
   ```
   Error: --env is required in non-interactive mode.
   Usage: mycli deploy --env production --yes
   ```
2. **Confirmation needed:** Fail unless `--yes` or `--force` is passed:
   ```
   Error: destructive operation requires --force in non-interactive mode.
   Usage: mycli database drop users-prod --force
   ```
3. **Selection needed:** Fail unless the corresponding flag is passed:
   ```
   Error: --target is required when stdin is not a terminal.
   Available targets: development, staging, production
   ```

**Never silently default** in non-interactive mode. Explicit is safer than implicit when there's no human watching.

---

## Dry-Run Preview

`--dry-run` shows what a command would do without executing it. This serves both humans (preview before committing) and scripts (validate before piping to the next command).

### Output format

```
$ mycli deploy --env production --dry-run
Dry run — no changes will be made:

  → Update deployment 'api-gateway'
    Image: app:v1.2.3 → app:v1.3.0
    Replicas: 3 (unchanged)
    Region: us-east-1

  → Create deployment 'new-worker'
    Image: worker:v1.0.0
    Replicas: 2
    Region: us-east-1

2 changes planned. Run without --dry-run to apply.
```

### Rules

- **Render on stdout** (it's data, not diagnostics).
- **Same exit code semantics:** 0 if the dry-run is valid, non-zero if the plan itself would fail (e.g., invalid config).
- **Clearly label:** First line must say "Dry run" so users don't mistake it for execution.
- **Show before/after diffs** for updates, not just the final state.

---

## Prompt Libraries by Framework

| Framework | Library | Features |
|-----------|---------|----------|
| Node.js (Commander.js) | `@inquirer/prompts` | Confirm, select, input, password, checkbox, search |
| Node.js (oclif) | `@inquirer/prompts` or `@oclif/prompts` | Same + oclif integration |
| Python (Click) | `click.prompt()`, `click.confirm()` | Built-in, basic prompts |
| Python (Typer) | `typer.prompt()`, `typer.confirm()` | Built-in via Click internals |
| Python (rich) | `rich.prompt.Prompt`, `Confirm` | Rich formatting in prompts |
| Go (Cobra) | `AlecAivazis/survey/v2` or `charmbracelet/huh` | Confirm, select, input, multi-select |
| Rust (clap) | `dialoguer` | Confirm, select, input, password, multi-select, fuzzy-select |
| Rust (clap) | `inquire` | Alternative to dialoguer with similar API |

### Integration pattern

```python
# Python (Click) — with non-interactive fallback
import click, sys

@click.command()
@click.option('--env', help='Target environment')
@click.option('--yes', '-y', is_flag=True, help='Skip confirmation')
def deploy(env, yes):
    if not env:
        if sys.stdin.isatty():
            env = click.prompt('Target environment', type=click.Choice(['dev', 'staging', 'prod']))
        else:
            click.echo('Error: --env required in non-interactive mode', err=True)
            raise SystemExit(2)

    if env == 'prod' and not yes:
        if sys.stdin.isatty():
            click.confirm(f'Deploy to {env}?', abort=True)
        else:
            click.echo('Error: --yes required for production in non-interactive mode', err=True)
            raise SystemExit(2)

    # ... proceed with deploy
```
