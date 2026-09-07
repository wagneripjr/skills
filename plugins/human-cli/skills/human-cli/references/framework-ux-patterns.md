# Framework UX Patterns for Human-Friendly CLIs

Human-side libraries for color, prompts, tables, progress bars, and shell completions in each major CLI framework. All examples implement the UX patterns defined in the companion references — this file shows how to wire them into real framework APIs.

---

## Node.js — Commander.js

### Project scaffold

```json
{
  "name": "mycli",
  "version": "1.0.0",
  "bin": { "mycli": "./bin/mycli.js" },
  "type": "module",
  "engines": { "node": ">=20" },
  "dependencies": {
    "commander": "^13.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.0",
    "@inquirer/prompts": "^7.0.0"
  }
}
```

### Color and TTY detection

```js
import chalk from 'chalk';
import { isatty } from 'node:tty';

function createTheme(opts) {
  const noColor = !isatty(1) || process.env.NO_COLOR !== undefined || opts.noColor;
  if (noColor) {
    // Return no-op functions when color is disabled
    return {
      success: (s) => `✓ ${s}`,
      error: (s) => `✗ ${s}`,
      warn: (s) => `⚠ ${s}`,
      info: (s) => `ℹ ${s}`,
      dim: (s) => s,
      bold: (s) => s,
    };
  }
  return {
    success: (s) => chalk.green(`✓ ${s}`),
    error: (s) => chalk.red(`✗ ${s}`),
    warn: (s) => chalk.yellow(`⚠ ${s}`),
    info: (s) => chalk.cyan(`ℹ ${s}`),
    dim: chalk.dim,
    bold: chalk.bold,
  };
}
```

### Table rendering

```js
import Table from 'cli-table3';

function renderTable(data, columns) {
  const table = new Table({
    head: columns.map(c => c.header),
    style: { head: ['cyan'], border: [] },
    chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
  });

  for (const row of data) {
    table.push(columns.map(c => row[c.key] ?? ''));
  }

  console.log(table.toString());
}
```

### Spinner

```js
import ora from 'ora';

async function withSpinner(label, fn) {
  const spinner = ora({ text: label, stream: process.stderr }).start();
  try {
    const result = await fn((msg) => { spinner.text = msg; });
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail(err.message);
    throw err;
  }
}

// Usage
await withSpinner('Deploying to production...', async (update) => {
  update('Building image...');
  await buildImage();
  update('Pushing to registry...');
  await pushImage();
  update('Updating manifest...');
  await updateManifest();
});
```

### Interactive prompts with bypass

```js
import { confirm, select } from '@inquirer/prompts';
import { isatty } from 'node:tty';

async function confirmDestructive(message, opts) {
  if (opts.yes || opts.force) return true;
  if (!isatty(0)) {
    console.error(`Error: ${message} Requires --yes or --force in non-interactive mode.`);
    process.exit(2);
  }
  return confirm({ message });
}
```

---

## Node.js — oclif

### Project scaffold

```json
{
  "dependencies": {
    "@oclif/core": "^4.0.0",
    "chalk": "^5.3.0",
    "cli-ux": "^6.0.0"
  },
  "oclif": {
    "bin": "mycli",
    "commands": "./dist/commands",
    "plugins": ["@oclif/plugin-help", "@oclif/plugin-autocomplete"]
  }
}
```

### Built-in UX features

oclif provides several human-UX features out of the box:
- `@oclif/plugin-help` — structured `--help` with examples
- `@oclif/plugin-autocomplete` — shell completions
- `@oclif/plugin-not-found` — `did-you-mean` suggestions
- `ux.action.start('Deploying...')` — built-in spinner
- `ux.table(data, columns)` — built-in table rendering

```typescript
import { Command, ux } from '@oclif/core';

export default class Deploy extends Command {
  static description = 'Deploy to an environment';

  static examples = [
    '<%= config.bin %> deploy staging',
    '<%= config.bin %> deploy production --replicas 5',
  ];

  async run() {
    ux.action.start('Deploying');
    await this.deploy();
    ux.action.stop('done');
  }
}
```

---

## Python — Click

### Project scaffold

```toml
[project]
dependencies = [
    "click>=8.1",
    "rich>=13.0",
    "rich-click>=1.8",
]

[project.scripts]
mycli = "mycli.cli:main"
```

### Color and rich output

```python
import click
from rich.console import Console
from rich.table import Table
from rich.progress import Progress

console = Console(stderr=True)  # Diagnostics on stderr
output = Console()               # Data on stdout

def render_table(data, columns):
    table = Table(show_edge=False, pad_edge=False)
    for col in columns:
        table.add_column(col['header'], style=col.get('style', ''))
    for row in data:
        table.add_row(*[str(row.get(col['key'], '')) for col in columns])
    output.print(table)
```

### Spinner and progress

```python
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeRemainingColumn

# Spinner for unknown-length operations
with console.status("Deploying...") as status:
    build_image()
    status.update("Pushing image...")
    push_image()

# Progress bar for known-length operations
with Progress(
    SpinnerColumn(),
    TextColumn("[progress.description]{task.description}"),
    BarColumn(),
    "[progress.percentage]{task.percentage:>3.0f}%",
    TimeRemainingColumn(),
    console=console,  # stderr
) as progress:
    task = progress.add_task("Downloading", total=file_size)
    for chunk in download_chunks():
        progress.update(task, advance=len(chunk))
```

### Error formatting

```python
import click, sys

def format_error(what, why, fix=None, url=None):
    click.echo(click.style(f"✗ {what}", fg='red', bold=True), err=True)
    click.echo(f"  {why}", err=True)
    if fix:
        click.echo(f"  Fix: {click.style(fix, fg='cyan')}", err=True)
    if url:
        click.echo(f"  Docs: {url}", err=True)

# Usage
format_error(
    "Config file not found",
    "Expected at ~/.config/mycli/config.toml",
    fix="mycli init",
    url="https://docs.mycli.dev/config"
)
```

### rich-click integration

```python
import rich_click as click  # Drop-in replacement for click

# Automatically renders --help with rich formatting:
# colored headers, grouped options, syntax-highlighted examples
```

---

## Python — Typer

### Project scaffold

```toml
[project]
dependencies = [
    "typer[all]>=0.12",  # Includes rich and shellingham
]
```

### Built-in UX features

Typer includes human-friendly features by default:
- Auto-generated `--help` with rich formatting
- Shell completion generation (`--install-completion`)
- Type-based validation from Python type hints
- Error formatting via rich

```python
import typer
from rich.progress import track

app = typer.App()

@app.command()
def deploy(
    env: str = typer.Argument(help="Target environment"),
    replicas: int = typer.Option(3, help="Number of replicas"),
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip confirmation"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview changes"),
):
    """Deploy the current project to a target environment."""
    if not dry_run and env == "production" and not yes:
        typer.confirm(f"Deploy to {env}?", abort=True)

    for step in track(["Build", "Push", "Update", "Verify"], description="Deploying..."):
        process_step(step)
```

---

## Go — Cobra

### Project scaffold

```go
// go.mod dependencies
require (
    github.com/spf13/cobra v1.8.0
    github.com/fatih/color v1.17.0
    github.com/schollz/progressbar/v3 v3.14.0
    github.com/AlecAivazis/survey/v2 v2.3.7
    github.com/olekukonko/tablewriter v0.0.5
)
```

### Color with TTY detection

```go
package output

import (
    "os"
    "github.com/fatih/color"
    "golang.org/x/term"
)

func init() {
    if !term.IsTerminal(int(os.Stdout.Fd())) || os.Getenv("NO_COLOR") != "" {
        color.NoColor = true
    }
}

var (
    Success = color.New(color.FgGreen).SprintFunc()
    Error   = color.New(color.FgRed, color.Bold).SprintFunc()
    Warn    = color.New(color.FgYellow).SprintFunc()
    Info    = color.New(color.FgCyan).SprintFunc()
    Dim     = color.New(color.Faint).SprintFunc()
)
```

### Table rendering

```go
import "github.com/olekukonko/tablewriter"

func renderTable(data [][]string, headers []string) {
    table := tablewriter.NewWriter(os.Stdout)
    table.SetHeader(headers)
    table.SetBorder(false)
    table.SetHeaderAlignment(tablewriter.ALIGN_LEFT)
    table.SetAlignment(tablewriter.ALIGN_LEFT)
    table.SetCenterSeparator("")
    table.SetColumnSeparator("")
    table.SetRowSeparator("")
    table.AppendBulk(data)
    table.Render()
}
```

### Interactive prompts

```go
import (
    "github.com/AlecAivazis/survey/v2"
    "golang.org/x/term"
)

func confirmDestructive(message string, force bool) (bool, error) {
    if force {
        return true, nil
    }
    if !term.IsTerminal(int(os.Stdin.Fd())) {
        return false, fmt.Errorf("%s. Use --force in non-interactive mode", message)
    }
    var confirm bool
    err := survey.AskOne(&survey.Confirm{Message: message}, &confirm)
    return confirm, err
}
```

### Progress bar

```go
import "github.com/schollz/progressbar/v3"

bar := progressbar.NewOptions64(totalBytes,
    progressbar.OptionSetWriter(os.Stderr),
    progressbar.OptionSetDescription("Downloading"),
    progressbar.OptionShowBytes(true),
    progressbar.OptionShowCount(),
    progressbar.OptionSetTheme(progressbar.Theme{
        Saucer:        "█",
        SaucerPadding: "░",
        BarStart:      "",
        BarEnd:        "",
    }),
)
```

### Shell completions (built-in)

```go
// Cobra generates completions automatically
rootCmd.AddCommand(&cobra.Command{
    Use:   "completion [bash|zsh|fish|powershell]",
    Short: "Generate shell completion scripts",
})
// cobra.GenBashCompletion, GenZshCompletion, GenFishCompletion built-in
```

---

## Rust — clap

### Project scaffold

```toml
[dependencies]
clap = { version = "4", features = ["derive", "color", "suggestions", "wrap_help"] }
clap_complete = "4"
colored = "2"
indicatif = "0.17"
comfy-table = "7"
dialoguer = "0.11"
miette = { version = "7", features = ["fancy"] }
# Or anyhow = "1" for simpler error handling
```

### Color with clap's built-in support

```rust
use clap::Parser;

#[derive(Parser)]
#[command(name = "mycli", version, about, color = clap::ColorChoice::Auto)]
// color = Auto respects NO_COLOR and non-TTY automatically
struct Cli {
    #[command(subcommand)]
    command: Commands,

    #[arg(long, global = true)]
    no_color: bool,
}
```

### Table rendering

```rust
use comfy_table::{Table, ContentArrangement, presets::NOTHING};

fn render_table(headers: &[&str], rows: &[Vec<String>]) {
    let mut table = Table::new();
    table.load_preset(NOTHING)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_header(headers);

    for row in rows {
        table.add_row(row);
    }

    println!("{table}");
}
```

### Progress bar with indicatif

```rust
use indicatif::{ProgressBar, ProgressStyle, MultiProgress};
use std::time::Duration;

// Spinner for unknown-length ops
let spinner = ProgressBar::new_spinner();
spinner.set_style(ProgressStyle::default_spinner()
    .template("{spinner:.cyan} {msg}")
    .unwrap());
spinner.enable_steady_tick(Duration::from_millis(100));
spinner.set_message("Deploying...");
// ... do work
spinner.finish_with_message("✓ Deployed");

// Progress bar for known-length ops
let bar = ProgressBar::new(total_size);
bar.set_style(ProgressStyle::default_bar()
    .template("{msg} {bar:40.cyan/dim} {percent}% ({bytes}/{total_bytes}) ETA: {eta}")
    .unwrap()
    .progress_chars("█░"));
```

### User-friendly errors with miette

```rust
use miette::{Diagnostic, SourceSpan};
use thiserror::Error;

#[derive(Error, Diagnostic, Debug)]
enum CliError {
    #[error("Config file not found")]
    #[diagnostic(
        code(mycli::config::not_found),
        help("Run 'mycli init' to create a config file"),
        url("https://docs.mycli.dev/config")
    )]
    ConfigNotFound,

    #[error("Invalid environment '{name}'")]
    #[diagnostic(
        code(mycli::deploy::invalid_env),
        help("Valid environments: development, staging, production")
    )]
    InvalidEnv { name: String },
}
```

### Interactive prompts with dialoguer

```rust
use dialoguer::{Confirm, Select, theme::ColorfulTheme};

fn confirm_destructive(message: &str, force: bool) -> bool {
    if force { return true; }
    if !atty::is(atty::Stream::Stdin) {
        eprintln!("Error: {message}. Use --force in non-interactive mode.");
        std::process::exit(2);
    }
    Confirm::with_theme(&ColorfulTheme::default())
        .with_prompt(message)
        .default(false)
        .interact()
        .unwrap_or(false)
}
```

### Shell completions

```rust
use clap_complete::{generate, Shell};

fn print_completions(shell: Shell, cmd: &mut clap::Command) {
    generate(shell, cmd, cmd.get_name().to_string(), &mut std::io::stdout());
}

// Register as subcommand:
// mycli completion bash > ~/.bash_completion.d/mycli
// mycli completion zsh > ~/.zsh/completions/_mycli
```

---

## Library Quick Reference

| Need | Node.js | Python | Go | Rust |
|------|---------|--------|-----|------|
| Color | chalk, kleur | rich, colorama, click.style | fatih/color | colored, owo-colors |
| Tables | cli-table3, columnify | rich.table, tabulate | olekukonko/tablewriter, pterm | comfy-table, tabled |
| Spinner | ora, nanospinner | rich.status, yaspin, halo | briandowns/spinner | indicatif |
| Progress | cli-progress | rich.progress, tqdm | schollz/progressbar, vbauerster/mpb | indicatif |
| Prompts | @inquirer/prompts | click.prompt, rich.prompt | AlecAivazis/survey, charmbracelet/huh | dialoguer, inquire |
| Completions | omelette, tabtab | click (built-in), argcomplete | cobra (built-in) | clap_complete |
| Errors | — | miette-like via rich.panel | — | miette, anyhow |
| Man pages | marked-man | click-man | cobra-doc | clap_mangen |
| TTY detect | node:tty | sys.stdout.isatty() | golang.org/x/term | atty, is-terminal |
