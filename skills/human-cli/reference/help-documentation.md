# Help & Documentation

How to structure `--help` output, write usage examples, generate shell completions, create man pages, and maintain a CHANGELOG. Help text is the CLI's most-used documentation — it must teach the user in seconds.

---

## `--help` Structure

### The anatomy of great help text

```
USAGE
  mycli deploy [flags] <environment>

DESCRIPTION
  Deploy the current project to a target environment. Runs build,
  pushes container images, and updates the deployment manifest.

EXAMPLES
  # Deploy to staging with defaults
  $ mycli deploy staging

  # Deploy to production with 5 replicas
  $ mycli deploy production --replicas 5

  # Dry-run to preview changes
  $ mycli deploy production --dry-run

FLAGS
  -e, --env <string>        Target environment (default: "staging")
  -r, --replicas <int>      Number of replicas (default: 3)
      --image <string>      Container image (default: auto-detected)
      --dry-run             Preview changes without applying
      --timeout <duration>  Deploy timeout (default: "5m")
  -y, --yes                 Skip confirmation prompt
      --no-color            Disable color output

GLOBAL FLAGS
      --json                Output as JSON
  -v, --verbose             Verbose output
  -q, --quiet               Suppress non-essential output
      --config <path>       Config file path

SEE ALSO
  mycli deploy status    — Check deployment status
  mycli deploy rollback  — Roll back to previous version
  mycli deploy logs      — Stream deployment logs
```

### Section order (by read frequency)

1. **USAGE** — the invocation pattern (users scan this first)
2. **DESCRIPTION** — one paragraph maximum
3. **EXAMPLES** — the most-read section; 2-4 real-world examples
4. **FLAGS** — sorted: required first, then alphabetical; show type and default
5. **GLOBAL FLAGS** — flags available on all commands
6. **SEE ALSO** — related commands with one-line descriptions

### Rules for help text

- **Examples are the most valuable section.** Write them as real-world scenarios with comments. Users copy-paste examples more than they read flag descriptions.
- **Show defaults for every flag.** `(default: "staging")` eliminates the "what happens if I don't pass this?" question.
- **Group related flags.** Put `--env`, `--region`, `--replicas` together under a "Deployment" heading for CLIs with many flags.
- **One-line description.** The first line of `--help` must tell the user what the command does in under 80 characters.
- **Consistent formatting.** Every command's help follows the same section order and indentation.

---

## Examples Section Best Practices

### Write real scenarios, not syntax demos

```
# Bad — syntax demo teaches nothing
$ mycli deploy --env <env> --replicas <n>

# Good — real scenario with context
# Deploy to staging for the first time
$ mycli deploy staging --replicas 2

# Good — shows a workflow
# Preview production deploy, then execute
$ mycli deploy production --dry-run
$ mycli deploy production --yes
```

### Include the most common use case first

The first example should be the simplest, most common invocation. Subsequent examples add complexity.

### Show flag combinations users actually need

Don't show every flag. Show the 2-4 combinations that cover 90% of usage.

### Use `$` prompt prefix

The `$` prefix signals "type this in your terminal." It also helps syntax highlighters.

---

## Root Help and Subcommand Discovery

### Root `--help` lists all commands grouped by category

```
$ mycli --help

mycli — Infrastructure management for teams

USAGE
  mycli <command> [flags]

COMMANDS
  Deployment
    deploy        Deploy to an environment
    rollback      Roll back to previous version
    status        Check deployment status

  Resources
    pod list      List pods
    pod create    Create a new pod
    pod delete    Delete a pod

  Configuration
    config set    Set a config value
    config get    Get a config value
    config init   Initialize config file

GLOBAL FLAGS
    --json        Output as JSON
    --no-color    Disable colors
    -v, --verbose Verbose output
    --version     Print version

Run 'mycli <command> --help' for details on a specific command.
```

### Discovery prompt at the bottom

Always end root help with: `Run 'mycli <command> --help' for details on a specific command.`

---

## Shell Completions

### Why completions matter

Tab completion turns "what was that flag called?" into a keystroke. CLIs without completions force users to switch to `--help` for every flag.

### Generation by framework

**Commander.js (Node.js):**
```js
// Use omelette or tabtab for Commander.js
// Or switch to oclif which has built-in completions
```

**Click (Python):**
```bash
# Generate completion for bash
_MYCLI_COMPLETE=bash_source mycli > ~/.mycli-complete.bash
echo '. ~/.mycli-complete.bash' >> ~/.bashrc

# Zsh
_MYCLI_COMPLETE=zsh_source mycli > ~/.mycli-complete.zsh
echo '. ~/.mycli-complete.zsh' >> ~/.zshrc
```

**Cobra (Go):**
```go
rootCmd.AddCommand(&cobra.Command{
    Use:   "completion [bash|zsh|fish|powershell]",
    Short: "Generate shell completion scripts",
    RunE: func(cmd *cobra.Command, args []string) error {
        switch args[0] {
        case "bash":
            return rootCmd.GenBashCompletion(os.Stdout)
        case "zsh":
            return rootCmd.GenZshCompletion(os.Stdout)
        case "fish":
            return rootCmd.GenFishCompletion(os.Stdout, true)
        }
        return nil
    },
})
```

**clap (Rust):**
```rust
use clap_complete::{generate, Shell};

// In build.rs or a completion subcommand
generate(Shell::Bash, &mut app, "mycli", &mut io::stdout());
generate(Shell::Zsh, &mut app, "mycli", &mut io::stdout());
generate(Shell::Fish, &mut app, "mycli", &mut io::stdout());
```

### Installation instructions

Include a `mycli completion` subcommand that outputs instructions:

```
$ mycli completion bash
# Add this to ~/.bashrc:
eval "$(mycli completion bash --generate)"

$ mycli completion zsh
# Add this to ~/.zshrc:
eval "$(mycli completion zsh --generate)"
```

---

## Man Pages

For system-level CLIs installed via package managers, generate man pages:

| Framework | Tool |
|-----------|------|
| Cobra (Go) | `cobra-doc` generates man pages from command tree |
| clap (Rust) | `clap_mangen` crate generates man pages |
| Python | `click-man` or manual `roff` formatting |
| Node.js | `marked-man` converts Markdown to man format |

### When to provide man pages

- CLI installed system-wide via `brew`, `apt`, `pacman`
- CLI used by sysadmins who expect `man mycli`
- CLI with complex flag interactions that benefit from long-form docs

### When not to bother

- CLI installed via `npx`, `pip install --user`, `cargo install`
- CLI primarily used by developers (they prefer `--help` and web docs)

---

## Guided Help Topics

Add a `mycli help <topic>` command for common workflows:

```
$ mycli help topics
Available help topics:
  getting-started   First-time setup and configuration
  authentication    How to authenticate with different providers
  deploy-workflow   Step-by-step deployment guide
  troubleshooting   Common errors and fixes

$ mycli help getting-started
# Getting Started with mycli
...
```

This provides a middle ground between terse `--help` and full web documentation.

---

## CHANGELOG Conventions

Maintain a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/):

```markdown
# Changelog

## [1.3.0] - 2025-03-15
### Added
- `mycli deploy --dry-run` preview mode
- Shell completions for fish

### Changed
- Default replicas from 1 to 3

### Deprecated
- `--output` flag, use `--format` instead (will be removed in 2.0)

### Fixed
- Progress bar not rendering on Windows Terminal
```

### Rules

- **Link each version to a git diff.** Users can see exactly what changed.
- **Group by Added/Changed/Deprecated/Removed/Fixed/Security.** Consistent structure.
- **Write for users, not developers.** "Added deploy preview mode" not "Refactored deploy handler to support dry-run flag on DI container initialization."
