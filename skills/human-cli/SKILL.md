---
name: human-cli
description: "Use when designing, building, reviewing, or evaluating command-line tools for human users -- structures commands with memorable naming and consistent grammar, adds interactive prompts with flag bypasses, implements color-coded output with spinners and progress bars, designs informative error messages with resolution URLs, enforces XDG config paths, adds shell completions and man pages, optimizes startup to under 500ms, implements TTY-aware dual-mode output, and scores CLI human-friendliness on a 0-21 rubric across 7 axes. Triggers on: 'CLI UX', 'human-friendly CLI', 'CLI design', 'CLI colors', 'CLI prompts', 'progress bar', 'CLI help text', 'error messages', 'CLI usability', 'design a CLI', 'evaluate CLI UX'. NOT for agent/machine CLI consumption (use agent-cli). NOT for TUI/full-screen apps. NOT for GUI apps."
license: MIT
---

# Human-Friendly CLI Design & Evaluation

**Build mode** (default) — walk through Phases 1-6 to construct a human-first CLI from scratch or retrofit an existing one. **Evaluate mode** — activated when the user says "score", "evaluate", "audit", or "rate" — jump to Phase 7 to score a CLI on the 7-axis human-UX rubric. Targets command-based CLIs (like `git`, `gh`, `rg`, `docker`).

## Quick Decision Guide

| Need | Approach | Reference |
|------|----------|-----------|
| Design command names, grammar, aliases | kebab-case, consistent verb-noun or noun-verb, short aliases | [command-ergonomics.md](references/command-ergonomics.md) |
| Add color, tables, icons to output | TTY-aware rendering, NO_COLOR, semantic palette | [visual-output.md](references/visual-output.md) |
| Add interactive prompts with automation bypass | Confirm/select/input prompts, `--yes`/`--force` flags | [interactive-input.md](references/interactive-input.md) |
| Structure `--help`, add completions, man pages | Help layout, examples section, shell completions, man generation | [help-documentation.md](references/help-documentation.md) |
| Add spinners, progress bars, reduce startup time | Lazy loading, spinner on >1s ops, progress bars for file/network | [performance-feedback.md](references/performance-feedback.md) |
| XDG paths, config precedence, signal handling | Platform conventions, env > file > defaults, graceful SIGINT | [polish-conventions.md](references/polish-conventions.md) |
| Score CLI human-friendliness (0-21) | 7-axis rubric with per-level criteria | [human-scoring-rubric.md](references/human-scoring-rubric.md) |
| Framework-specific UX libraries | Color, prompts, tables, progress per framework | [framework-ux-patterns.md](references/framework-ux-patterns.md) |

## Hard Gates

Violation of any gate halts progress. No workaround. No exceptions.

| Gate | Rule |
|------|------|
| **G1** | `--help` on every command with description, flags with defaults, and at least one usage example |
| **G2** | Errors include what failed, why it failed, and a concrete fix (command or URL) |
| **G3** | Interactive prompts always have a flag bypass (`--yes`, `--force`, or explicit flag); never fire when stdin is not a TTY |
| **G4** | Color disabled when stdout is not a TTY, when `NO_COLOR` env is set, or when `--no-color` flag is passed; meaning never encoded in color alone |
| **G5** | Long operations (>1 second) show progress feedback (spinner or bar) on stderr |
| **G6** | Startup completes in under 500ms; lazy-load heavy dependencies |
| **G7** | Config follows XDG Base Directory Specification (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`) |
| **G8** | `--version` on root command prints `name semver`, exits 0 |

**G2 error format — every error follows this pattern:**

```
✗ Config file not found at ~/.config/mycli/config.toml
  No config file exists. Created during first-time setup.
  Fix: mycli init
  Docs: https://docs.mycli.dev/getting-started
```

**G1 help format — every command follows this layout:**

```
USAGE
  mycli deploy <environment> [flags]

EXAMPLES
  $ mycli deploy staging
  $ mycli deploy production --replicas 5 --dry-run

FLAGS
  -r, --replicas <int>   Number of replicas (default: 3)
      --dry-run           Preview changes without applying
  -y, --yes              Skip confirmation prompt
```

## Phase 1: Command Ergonomics

Design the command surface for memorability and consistency. Pick a grammar pattern — noun-verb (`mycli container list`) or verb-noun (`mycli list containers`) — and apply it everywhere. Use kebab-case for multi-word commands (`create-snapshot`, not `createSnapshot`). Limit subcommand depth to 2-3 levels.

Design flags for discoverability: long names are self-documenting (`--output-format`), short aliases save keystrokes (`-o`). Keep the "argument budget" low — if a command needs more than 5 flags, consider subcommands or config files. Use `--` to separate flags from positional arguments.

Load `references/command-ergonomics.md` for naming patterns, alias strategy, flag design conventions, and the argument budget rule.

## Phase 2: Visual Output Design

Implement TTY-aware dual-mode output: rich tables with alignment and color when stdout is a TTY, plain text or structured data when piped. Use a semantic color palette — green for success, red for errors, yellow for warnings, cyan for informational. Add icons (unicode or emoji) sparingly to reinforce status at a glance.

Respect `NO_COLOR` (env var), `--no-color` (flag), and `TERM=dumb`. Never encode meaning in color alone — always pair with text labels or icons. Strip ANSI when piped.

Load `references/visual-output.md` for color palette conventions, table libraries, icon usage, TTY detection patterns, and ANSI stripping.

## Phase 3: Interactive Input & Prompting

Add interactive prompts for destructive operations (delete, overwrite, deploy to production). Support prompt types: confirm (yes/no), select (pick from list), multi-select, and text input with validation. Every prompt must have a flag bypass (`--yes`, `--force`, or an explicit flag like `--env production`).

When stdin is not a TTY, never prompt — fail with an actionable error message explaining which flag to pass. Implement `--dry-run` as a preview mechanism that shows what would happen without executing.

Load `references/interactive-input.md` for prompt patterns, bypass flag conventions, TTY detection, and dry-run preview design.

## Phase 4: Help & Discoverability

Structure `--help` with: one-line description, usage pattern, flags with types and defaults, and an **examples section** (the most-read part). Add `--help` to every subcommand, not just the root.

Generate shell completions (bash, zsh, fish) via framework tooling. Consider generating man pages for system-level CLIs. Add a `mycli help <topic>` command for guided tutorials on common workflows.

Load `references/help-documentation.md` for help text layout, examples formatting, completion generation, man page tooling, and README/CHANGELOG conventions.

## Phase 5: Performance & Responsiveness

Startup must complete in under 500ms. Lazy-load plugins, network calls, and heavy dependencies. Measure with `time mycli --version` as the baseline.

Show a spinner for operations taking more than 1 second. Switch to a progress bar when total work is known (file transfer, batch processing). Render progress on stderr so stdout remains clean for piping. For very long operations (>30 seconds), consider OS notifications on completion.

Load `references/performance-feedback.md` for startup optimization, lazy loading patterns, spinner/progress bar libraries, and notification strategies.

## Phase 6: Polish & Delight

Store config in XDG-compliant paths: `$XDG_CONFIG_HOME/mycli/config.toml` (defaults to `~/.config/mycli/`). Implement config precedence: flags > environment variables > project-local config > user config > defaults. Document precedence in `--help`.

Handle signals gracefully: SIGINT triggers cleanup and exits 130, SIGTERM exits 143, SIGPIPE exits silently. Add a brief ASCII art banner on first run or `--banner` (not on every invocation). Maintain backward compatibility — deprecate with warnings before removing flags.

Follow semver for the CLI's public interface: flag names, output format, and exit codes are the API contract. Changing a flag name or removing a subcommand is a breaking change.

Load `references/polish-conventions.md` for XDG paths, config precedence, signal handling, backward compatibility, and personality guidelines.

## Phase 7: Evaluate (optional)

Score the CLI on 7 axes (0-3 each, 0-21 total):

| Axis | What it measures |
|------|-----------------|
| Command Learnability | Can a new user construct valid commands without reading full docs? |
| Visual Clarity | Does the output guide the eye to what matters? |
| Error Recovery | Can a user fix errors from the error message alone? |
| Interactive Comfort | Do prompts help without blocking automation? |
| Discoverability | Can a user find features they didn't know existed? |
| Responsiveness | Does the CLI feel fast and show progress for slow operations? |
| Configuration & Conventions | Does the CLI follow platform conventions and respect preferences? |

**0-5 = Hostile**, **6-10 = Functional**, **11-15 = Comfortable**, **16-21 = Delightful**. Load `references/human-scoring-rubric.md` for full per-level criteria, evaluation procedure, and example scores for `gh`, `rg`, `docker`, and `aws`.

## Dual-Audience Bridge

TTY detection branches the same command into human and machine output. `--json` forces machine mode, `--no-color` keeps human formatting without ANSI. For the machine side, load `wagner-skills:agent-cli`.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Color-only status indicators | Always pair color with text label or icon — colorblind users and pipes lose meaning |
| Prompts with no flag bypass | Every prompt needs `--yes`/`--force` or an explicit flag equivalent |
| Cryptic error messages | Include what failed, why, and a fix command or documentation URL |
| Slow startup loading all plugins | Lazy-load: only initialize what the invoked subcommand needs |
| Dotfiles scattered in `$HOME` | Use XDG paths: `~/.config/mycli/`, `~/.local/share/mycli/`, `~/.local/state/mycli/` |
| Progress bar on stdout | Render spinners and progress on stderr — stdout is for data |
| Breaking flag names between versions | Flags are the API contract — deprecate before removing, follow semver |
| Wall-of-text `--help` output | Lead with examples, then flags with defaults, keep description to one line |

## Rules

1. **The human is the primary user** — every design decision optimizes for human comprehension, recall, and delight first
2. **TTY detection governs mode** — rich output when interactive, plain when piped, `--json` overrides both
3. **Errors are teaching moments** — every error message tells the user what to do next
4. **Progress is mandatory for slow operations** — silence is ambiguous; a spinner proves the tool is alive
5. **Platform conventions over invention** — XDG paths, NO_COLOR, semver, shell completions are not optional
6. **Framework libraries first** — load `references/framework-ux-patterns.md` for the target language before writing UI code
7. **Evaluate after building** — run Phase 7 scoring to identify gaps, prioritize lowest-scoring axes

## Downstream Handoff

After building a human-friendly CLI:
- **`wagner-skills:agent-cli`** — add the machine-consumption layer (JSON envelope, `--fields`, `--help-json`, input hardening, CONTEXT.md)
- **an acceptance-spec / ATDD skill** — write acceptance specifications with a CLI protocol driver (command execution, exit code assertions, output parsing)
- **an exploratory-QA skill** — exploratory testing of the CLI as a human would use it interactively
