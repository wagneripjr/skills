# Framework-Specific Patterns for Agent-Friendly CLIs

Every framework has its own idioms for flags, output, and error handling. This reference shows the concrete boilerplate for implementing agent-friendly features in each major CLI framework. All examples follow the envelope, exit code, and safety patterns defined in the companion references — this file shows how to wire them into real framework APIs.

---

## Node.js — Commander.js

### Project Scaffold

```json
{
  "name": "mycli",
  "version": "1.0.0",
  "bin": { "mycli": "./bin/mycli.js" },
  "type": "module",
  "engines": { "node": ">=20" },
  "dependencies": {
    "commander": "^13.0.0"
  }
}
```

```js
#!/usr/bin/env node
// bin/mycli.js
import { program } from 'commander';
import { deployCmd } from '../src/commands/deploy.js';

program
  .name('mycli')
  .version('1.0.0', '-v, --version')
  .description('Infrastructure management CLI')
  .option('--json', 'Output as JSON envelope')
  .option('--quiet', 'Suppress non-essential output')
  .option('--fields <fields>', 'Comma-separated fields to include in output');

program.addCommand(deployCmd);
program.parse();
```

### JSON Output Flag and Consistent Envelope

```js
// src/output.js

export function envelope(data, meta = {}) {
  return { status: 'ok', data, warnings: [], meta };
}

export function errorEnvelope(code, message, fix = null, transient = false) {
  return { status: 'error', error: { code, message, fix, transient } };
}

export function emit(program, data, humanFormatter) {
  const opts = program.optsWithGlobals();
  if (opts.json) {
    const result = envelope(data);
    if (opts.fields) {
      result.data = filterFields(result.data, opts.fields.split(','));
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (!opts.quiet) {
    humanFormatter(data);
  }
}

function filterFields(data, fields) {
  if (Array.isArray(data)) {
    return data.map(item => pick(item, fields));
  }
  return pick(data, fields);
}

function pick(obj, fields) {
  const result = {};
  for (const f of fields) {
    if (f in obj) result[f] = obj[f];
  }
  return result;
}
```

### TTY Detection for Dual-Mode Output

```js
// src/tty.js
import { isatty } from 'node:tty';

export function isTTY() {
  return isatty(1); // fd 1 = stdout
}

export function autoFormat(program) {
  // If stdout is not a TTY (piped to another process), default to JSON
  if (!isTTY() && !program.opts().json) {
    program.setOptionValue('json', true);
  }
}
```

### Structured Error Handling with Exit Codes

```js
// src/errors.js

export const EXIT = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  AUTH_ERROR: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  RATE_LIMITED: 6,
  TIMEOUT: 7,
  INTERNAL: 8,
};

export class CLIError extends Error {
  constructor(code, message, fix = null, transient = false, exitCode = EXIT.GENERAL_ERROR) {
    super(message);
    this.code = code;
    this.fix = fix;
    this.transient = transient;
    this.exitCode = exitCode;
  }
}

export function handleError(program, err) {
  if (err instanceof CLIError) {
    if (program.optsWithGlobals().json) {
      const env = errorEnvelope(err.code, err.message, err.fix, err.transient);
      process.stderr.write(JSON.stringify(env, null, 2) + '\n');
    } else {
      process.stderr.write(`Error [${err.code}]: ${err.message}\n`);
      if (err.fix) process.stderr.write(`Fix: ${err.fix}\n`);
    }
    process.exit(err.exitCode);
  }
  // Unexpected error
  process.stderr.write(JSON.stringify(errorEnvelope(
    'INTERNAL_ERROR', err.message, null, false
  ), null, 2) + '\n');
  process.exit(EXIT.INTERNAL);
}
```

### Dry-Run Flag on Mutating Commands

```js
// src/commands/deploy.js
import { Command } from 'commander';
import { emit, envelope } from '../output.js';
import { handleError, CLIError, EXIT } from '../errors.js';

export const deployCmd = new Command('deploy')
  .description('Deploy a service to an environment')
  .argument('<service>', 'Service name')
  .option('--env <environment>', 'Target environment', 'staging')
  .option('--image <image>', 'Container image tag')
  .option('--dry-run', 'Preview changes without executing')
  .action(async (service, options, command) => {
    try {
      const program = command.parent;
      if (options.dryRun) {
        const changes = await previewDeploy(service, options);
        const result = {
          ...envelope(null),
          dry_run: true,
          changes,
          meta: { total_changes: changes.length },
        };
        if (program.optsWithGlobals().json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          changes.forEach(c =>
            console.log(`  ${c.action} ${c.resource}: ${c.from ?? '(new)'} -> ${c.to}`)
          );
        }
        return;
      }
      const result = await executeDeploy(service, options);
      emit(program, result, (data) => {
        console.log(`Deployed ${data.service} to ${data.environment}`);
      });
    } catch (err) {
      handleError(command.parent, err);
    }
  });
```

### Stdin Pipe Support

```js
// src/stdin.js
import { isTTY } from './tty.js';

export async function readStdin() {
  if (isTTY()) return null; // No piped input

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw; // Return as plain string if not JSON
  }
}
```

Usage in a command:

```js
import { readStdin } from '../stdin.js';

// Inside action handler:
const input = await readStdin();
if (input) {
  // Piped input: e.g., mycli deploy --json | mycli status --json
  const serviceIds = Array.isArray(input.data)
    ? input.data.map(d => d.id)
    : [input.data.id];
}
```

---

## Node.js — oclif

### Project Scaffold

oclif projects use the oclif generator. The key agent-friendly feature is the built-in `--json` flag.

```bash
npx oclif generate mycli
cd mycli
```

### JSON Output via Built-in --json Flag

oclif has native JSON support. Commands that extend `Command` and implement `jsonEnabled()` get `--json` for free.

```ts
// src/commands/deploy.ts
import { Command, Flags } from '@oclif/core';

export default class Deploy extends Command {
  static description = 'Deploy a service';
  static flags = {
    env: Flags.string({ description: 'Target environment', default: 'staging' }),
    service: Flags.string({ description: 'Service name', required: true }),
    'dry-run': Flags.boolean({ description: 'Preview changes without executing' }),
  };

  // Enables --json flag automatically
  static enableJsonFlag = true;

  async run() {
    const { flags } = await this.parse(Deploy);

    if (flags['dry-run']) {
      const changes = await this.previewDeploy(flags.service, flags.env);
      // When --json is passed, oclif wraps the return value automatically
      return { dry_run: true, changes, meta: { total_changes: changes.length } };
    }

    const result = await this.executeDeploy(flags.service, flags.env);

    // Human output — only shown when --json is NOT passed
    this.log(`Deployed ${result.service} to ${result.environment}`);

    // Return value becomes the JSON envelope when --json IS passed
    return result;
  }
}
```

### Custom Base Command with Agent-Friendly Defaults

```ts
// src/base-command.ts
import { Command, Flags } from '@oclif/core';

export abstract class AgentCommand extends Command {
  static baseFlags = {
    quiet: Flags.boolean({ description: 'Suppress non-essential output', default: false }),
    fields: Flags.string({ description: 'Comma-separated fields to include' }),
  };

  static enableJsonFlag = true;

  protected emit(data: Record<string, unknown>): Record<string, unknown> {
    const { flags } = this as any;
    if (flags.fields) {
      const fieldList = flags.fields.split(',');
      const filtered: Record<string, unknown> = {};
      for (const f of fieldList) {
        if (f in data) filtered[f] = data[f];
      }
      return filtered;
    }
    return data;
  }

  protected handleCLIError(err: unknown): never {
    if (err instanceof CLIError) {
      // oclif respects process.exitCode and formats JSON errors automatically
      this.error(err.message, { code: err.code, exit: err.exitCode });
    }
    this.error('Internal error', { code: 'INTERNAL_ERROR', exit: 8 });
  }
}
```

### TTY-Aware Output

```ts
// In any command extending AgentCommand:
async run() {
  const { flags } = await this.parse(MyCommand);

  // oclif exposes jsonEnabled() which checks --json flag AND TTY
  if (this.jsonEnabled()) {
    return result; // oclif wraps in JSON
  }

  // Human path
  if (!flags.quiet) {
    this.log(formatTable(result));
  }
}
```

---

## Python — Click

### Project Scaffold

```toml
# pyproject.toml
[project]
name = "mycli"
version = "1.0.0"
requires-python = ">=3.12"
dependencies = ["click>=8.1"]

[project.scripts]
mycli = "mycli.cli:main"
```

### JSON Output Decorator

```python
# src/mycli/output.py
import json
import sys
import functools
import click

def envelope(data, meta=None):
    return {"status": "ok", "data": data, "warnings": [], "meta": meta or {}}

def error_envelope(code, message, fix=None, transient=False):
    return {"status": "error", "error": {"code": code, "message": message, "fix": fix, "transient": transient}}

def emit_json(data, file=sys.stdout):
    json.dump(data, file, indent=2, default=str)
    file.write("\n")

def filter_fields(data, fields):
    if isinstance(data, list):
        return [{k: v for k, v in item.items() if k in fields} for item in data]
    return {k: v for k, v in data.items() if k in fields}

def agent_output(f):
    """Decorator that handles --json, --fields, and --quiet flags."""
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        ctx = click.get_current_context()
        use_json = ctx.find_root().params.get("json_output", False)
        fields = ctx.find_root().params.get("fields")
        quiet = ctx.find_root().params.get("quiet", False)

        try:
            result = ctx.invoke(f, *args, **kwargs)
            if result is None:
                return
            if use_json:
                env = envelope(result)
                if fields:
                    env["data"] = filter_fields(env["data"], fields.split(","))
                emit_json(env)
            elif not quiet:
                # Fall through to let command handle human output
                pass
        except CLIError as e:
            if use_json:
                emit_json(error_envelope(e.code, str(e), e.fix, e.transient), file=sys.stderr)
            else:
                click.echo(f"Error [{e.code}]: {e}", err=True)
                if e.fix:
                    click.echo(f"Fix: {e.fix}", err=True)
            sys.exit(e.exit_code)
    return wrapper
```

### TTY Detection

```python
# src/mycli/tty.py
import sys

def is_tty():
    return sys.stdout.isatty()

def auto_json(ctx, param, value):
    """Callback for --json flag: auto-enable when stdout is not a TTY."""
    if not sys.stdout.isatty() and not value:
        return True
    return value
```

### Structured Error Handling

```python
# src/mycli/errors.py

class ExitCode:
    SUCCESS = 0
    GENERAL_ERROR = 1
    USAGE_ERROR = 2
    AUTH_ERROR = 3
    NOT_FOUND = 4
    CONFLICT = 5
    RATE_LIMITED = 6
    TIMEOUT = 7
    INTERNAL = 8

class CLIError(Exception):
    def __init__(self, code, message, fix=None, transient=False, exit_code=ExitCode.GENERAL_ERROR):
        super().__init__(message)
        self.code = code
        self.fix = fix
        self.transient = transient
        self.exit_code = exit_code
```

### Dry-Run, Fields, Quiet, and Stdin Support

```python
# src/mycli/cli.py
import sys
import json
import click
from mycli.output import envelope, emit_json, agent_output, filter_fields
from mycli.errors import CLIError, ExitCode
from mycli.tty import auto_json

@click.group()
@click.option("--json", "json_output", is_flag=True, callback=auto_json,
              expose_value=True, is_eager=True, help="Output as JSON envelope")
@click.option("--quiet", is_flag=True, help="Suppress non-essential output")
@click.option("--fields", type=str, help="Comma-separated fields to include")
@click.version_option("1.0.0", prog_name="mycli")
@click.pass_context
def main(ctx, json_output, quiet, fields):
    ctx.ensure_object(dict)
    ctx.obj["json"] = json_output
    ctx.obj["quiet"] = quiet
    ctx.obj["fields"] = fields


@main.command()
@click.argument("service")
@click.option("--env", default="staging", help="Target environment")
@click.option("--image", required=True, help="Container image tag")
@click.option("--dry-run", is_flag=True, help="Preview changes without executing")
@click.pass_context
def deploy(ctx, service, env, image, dry_run):
    """Deploy a service to an environment."""
    use_json = ctx.obj["json"]

    if dry_run:
        changes = [
            {"action": "update", "resource": f"deployment/{service}",
             "field": "image", "from": "v1.0", "to": image},
        ]
        result = {"status": "ok", "dry_run": True, "changes": changes,
                  "meta": {"total_changes": len(changes)}}
        if use_json:
            emit_json(result)
        else:
            for c in changes:
                click.echo(f"  {c['action']} {c['resource']}: {c.get('from', '(new)')} -> {c['to']}")
        return

    # Read piped input if stdin is not a TTY
    piped_input = None
    if not sys.stdin.isatty():
        raw = click.get_text_stream("stdin").read().strip()
        if raw:
            try:
                piped_input = json.loads(raw)
            except json.JSONDecodeError:
                piped_input = raw

    result = execute_deploy(service, env, image, piped_input)

    if use_json:
        env_out = envelope(result)
        if ctx.obj["fields"]:
            env_out["data"] = filter_fields(env_out["data"], ctx.obj["fields"].split(","))
        emit_json(env_out)
    elif not ctx.obj["quiet"]:
        click.echo(f"Deployed {result['service']} to {result['environment']}")
```

---

## Python — Typer

### Project Scaffold

```toml
# pyproject.toml
[project]
name = "mycli"
version = "1.0.0"
requires-python = ">=3.12"
dependencies = ["typer>=0.15", "rich>=13.0"]

[project.scripts]
mycli = "mycli.cli:app"
```

### JSON Output with Rich Integration

```python
# src/mycli/cli.py
import json
import sys
from typing import Optional
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(name="mycli", no_args_is_help=True)
console = Console()
err_console = Console(stderr=True)

# Global state via typer callback
state = {"json": False, "quiet": False}

@app.callback()
def main_callback(
    json_output: bool = typer.Option(False, "--json", help="Output as JSON envelope"),
    quiet: bool = typer.Option(False, "--quiet", help="Suppress non-essential output"),
    version: bool = typer.Option(False, "--version", help="Show version"),
):
    if version:
        if json_output:
            print(json.dumps({"version": "1.0.0"}))
        else:
            print("mycli 1.0.0")
        raise typer.Exit()
    # Auto-detect: if stdout is piped, default to JSON
    if not sys.stdout.isatty() and not json_output:
        json_output = True
    state["json"] = json_output
    state["quiet"] = quiet


@app.command()
def deploy(
    service: str = typer.Argument(help="Service name"),
    env: str = typer.Option("staging", "--env", help="Target environment"),
    image: str = typer.Option(..., "--image", help="Container image tag"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Preview changes"),
):
    """Deploy a service to an environment."""
    try:
        result = execute_deploy(service, env, image, dry_run)
    except CLIError as e:
        if state["json"]:
            err_console.print_json(json.dumps(
                {"status": "error", "error": {"code": e.code, "message": str(e), "fix": e.fix}}
            ))
        else:
            err_console.print(f"[red]Error [{e.code}]:[/red] {e}")
        raise typer.Exit(code=e.exit_code)

    if state["json"]:
        console.print_json(json.dumps({"status": "ok", "data": result}))
    elif not state["quiet"]:
        table = Table(title="Deployment")
        table.add_column("Field")
        table.add_column("Value")
        for k, v in result.items():
            table.add_row(k, str(v))
        console.print(table)
```

### Error Handling via typer.Exit

```python
# Typer uses typer.Exit(code=N) for exit codes.
# Combine with the CLIError class from the Click section above.

except CLIError as e:
    # JSON path: structured error to stderr
    # Human path: rich-formatted error to stderr
    raise typer.Exit(code=e.exit_code)
except Exception as e:
    err_console.print(f"[red]Internal error:[/red] {e}")
    raise typer.Exit(code=8)
```

---

## Go — Cobra

### Project Scaffold

```
mycli/
  go.mod
  main.go
  cmd/
    root.go
    deploy.go
  internal/
    output/
      output.go
    errors/
      errors.go
```

```go
// go.mod
module github.com/myorg/mycli

go 1.23

require (
    github.com/spf13/cobra v1.8.1
    golang.org/x/term v0.28.0
)
```

```go
// main.go
package main

import (
    "os"
    "github.com/myorg/mycli/cmd"
)

func main() {
    if err := cmd.Execute(); err != nil {
        os.Exit(1)
    }
}
```

### JSON Output with encoding/json

```go
// internal/output/output.go
package output

import (
    "encoding/json"
    "fmt"
    "os"

    "golang.org/x/term"
)

type Envelope struct {
    Status   string      `json:"status"`
    Data     interface{} `json:"data,omitempty"`
    Warnings []string    `json:"warnings,omitempty"`
    Meta     interface{} `json:"meta,omitempty"`
    DryRun   *bool       `json:"dry_run,omitempty"`
    Changes  interface{} `json:"changes,omitempty"`
    Error    *ErrorBody  `json:"error,omitempty"`
}

type ErrorBody struct {
    Code      string  `json:"code"`
    Message   string  `json:"message"`
    Fix       *string `json:"fix,omitempty"`
    Transient bool    `json:"transient"`
}

func IsTTY() bool {
    return term.IsTerminal(int(os.Stdout.Fd()))
}

func EmitJSON(env Envelope) {
    enc := json.NewEncoder(os.Stdout)
    enc.SetIndent("", "  ")
    _ = enc.Encode(env)
}

func EmitError(env Envelope) {
    enc := json.NewEncoder(os.Stderr)
    enc.SetIndent("", "  ")
    _ = enc.Encode(env)
}

func FilterFields(data map[string]interface{}, fields []string) map[string]interface{} {
    if len(fields) == 0 {
        return data
    }
    result := make(map[string]interface{})
    for _, f := range fields {
        if v, ok := data[f]; ok {
            result[f] = v
        }
    }
    return result
}

func Success(data interface{}) Envelope {
    return Envelope{Status: "ok", Data: data}
}

func Fail(code, message string, fix *string, transient bool) Envelope {
    return Envelope{
        Status: "error",
        Error:  &ErrorBody{Code: code, Message: message, Fix: fix, Transient: transient},
    }
}
```

### PersistentPreRun for Global Flags

```go
// cmd/root.go
package cmd

import (
    "os"
    "github.com/myorg/mycli/internal/output"
    "github.com/spf13/cobra"
)

var (
    jsonOutput bool
    quiet      bool
    fields     string
)

var rootCmd = &cobra.Command{
    Use:     "mycli",
    Short:   "Infrastructure management CLI",
    Version: "1.0.0",
    PersistentPreRun: func(cmd *cobra.Command, args []string) {
        // Auto-enable JSON when stdout is not a TTY
        if !output.IsTTY() && !jsonOutput {
            jsonOutput = true
        }
    },
}

func init() {
    rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output as JSON envelope")
    rootCmd.PersistentFlags().BoolVar(&quiet, "quiet", false, "Suppress non-essential output")
    rootCmd.PersistentFlags().StringVar(&fields, "fields", "", "Comma-separated fields to include")
}

func Execute() error {
    return rootCmd.Execute()
}
```

### Structured Error Type with Code, Message, Fix, Transient

```go
// internal/errors/errors.go
package errors

import "fmt"

const (
    ExitSuccess     = 0
    ExitGeneral     = 1
    ExitUsage       = 2
    ExitAuth        = 3
    ExitNotFound    = 4
    ExitConflict    = 5
    ExitRateLimited = 6
    ExitTimeout     = 7
    ExitInternal    = 8
)

type CLIError struct {
    Code      string
    Message   string
    Fix       *string
    Transient bool
    ExitCode  int
}

func (e *CLIError) Error() string {
    return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func New(code, message string, exitCode int) *CLIError {
    return &CLIError{Code: code, Message: message, ExitCode: exitCode}
}

func (e *CLIError) WithFix(fix string) *CLIError {
    e.Fix = &fix
    return e
}

func (e *CLIError) WithTransient() *CLIError {
    e.Transient = true
    return e
}
```

### Complete Example Command

```go
// cmd/deploy.go
package cmd

import (
    "fmt"
    "os"
    "strings"

    clierr "github.com/myorg/mycli/internal/errors"
    "github.com/myorg/mycli/internal/output"
    "github.com/spf13/cobra"
)

var (
    deployEnv   string
    deployImage string
    dryRun      bool
)

var deployCmd = &cobra.Command{
    Use:   "deploy <service>",
    Short: "Deploy a service to an environment",
    Args:  cobra.ExactArgs(1),
    RunE: func(cmd *cobra.Command, args []string) error {
        service := args[0]

        if dryRun {
            changes := []map[string]interface{}{
                {
                    "action":   "update",
                    "resource": fmt.Sprintf("deployment/%s", service),
                    "field":    "image",
                    "from":     "v1.0",
                    "to":       deployImage,
                },
            }
            dryRunFlag := true
            if jsonOutput {
                output.EmitJSON(output.Envelope{
                    Status:  "ok",
                    DryRun:  &dryRunFlag,
                    Changes: changes,
                })
            } else {
                for _, c := range changes {
                    fmt.Printf("  %s %s: %s -> %s\n",
                        c["action"], c["resource"], c["from"], c["to"])
                }
            }
            return nil
        }

        result, err := executeDeploy(service, deployEnv, deployImage)
        if err != nil {
            var cliErr *clierr.CLIError
            if errors.As(err, &cliErr) {
                if jsonOutput {
                    output.EmitError(output.Fail(cliErr.Code, cliErr.Message, cliErr.Fix, cliErr.Transient))
                } else {
                    fmt.Fprintf(os.Stderr, "Error [%s]: %s\n", cliErr.Code, cliErr.Message)
                    if cliErr.Fix != nil {
                        fmt.Fprintf(os.Stderr, "Fix: %s\n", *cliErr.Fix)
                    }
                }
                os.Exit(cliErr.ExitCode)
            }
            return err
        }

        if jsonOutput {
            env := output.Success(result)
            if fields != "" {
                if m, ok := result.(map[string]interface{}); ok {
                    env.Data = output.FilterFields(m, strings.Split(fields, ","))
                }
            }
            output.EmitJSON(env)
        } else if !quiet {
            fmt.Printf("Deployed %s to %s\n", service, deployEnv)
        }
        return nil
    },
}

func init() {
    deployCmd.Flags().StringVar(&deployEnv, "env", "staging", "Target environment")
    deployCmd.Flags().StringVar(&deployImage, "image", "", "Container image tag")
    _ = deployCmd.MarkFlagRequired("image")
    deployCmd.Flags().BoolVar(&dryRun, "dry-run", false, "Preview changes without executing")
    rootCmd.AddCommand(deployCmd)
}
```

### Shell Completion Generation

```go
// cmd/completion.go
package cmd

import (
    "os"
    "github.com/spf13/cobra"
)

var completionCmd = &cobra.Command{
    Use:   "completion [bash|zsh|fish|powershell]",
    Short: "Generate shell completion scripts",
    Args:  cobra.ExactValidArgs(1),
    ValidArgs: []string{"bash", "zsh", "fish", "powershell"},
    RunE: func(cmd *cobra.Command, args []string) error {
        switch args[0] {
        case "bash":
            return rootCmd.GenBashCompletion(os.Stdout)
        case "zsh":
            return rootCmd.GenZshCompletion(os.Stdout)
        case "fish":
            return rootCmd.GenFishCompletion(os.Stdout, true)
        case "powershell":
            return rootCmd.GenPowerShellCompletionWithDesc(os.Stdout)
        }
        return nil
    },
}

func init() {
    rootCmd.AddCommand(completionCmd)
}
```

---

## Rust — clap

### Project Scaffold

```toml
# Cargo.toml
[package]
name = "mycli"
version = "1.0.0"
edition = "2021"

[dependencies]
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Derive-Based CLI Definition with Global Flags

```rust
// src/main.rs
use clap::{Parser, Subcommand};
use std::io::IsTerminal;
use std::process;

mod errors;
mod output;

use errors::{CLIError, ExitCode};
use output::{Envelope, emit_json, emit_error};

#[derive(Parser)]
#[command(name = "mycli", version = "1.0.0", about = "Infrastructure management CLI")]
struct Cli {
    /// Output as JSON envelope
    #[arg(long, global = true)]
    json: bool,

    /// Suppress non-essential output
    #[arg(long, global = true)]
    quiet: bool,

    /// Comma-separated fields to include in output
    #[arg(long, global = true)]
    fields: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Deploy a service to an environment
    Deploy {
        /// Service name
        service: String,

        /// Target environment
        #[arg(long, default_value = "staging")]
        env: String,

        /// Container image tag
        #[arg(long)]
        image: String,

        /// Preview changes without executing
        #[arg(long)]
        dry_run: bool,
    },
}

fn main() {
    // Handle SIGPIPE gracefully (prevents "broken pipe" panics)
    #[cfg(unix)]
    {
        unsafe {
            libc::signal(libc::SIGPIPE, libc::SIG_DFL);
        }
    }

    let mut cli = Cli::parse();

    // Auto-enable JSON when stdout is not a TTY
    if !std::io::stdout().is_terminal() && !cli.json {
        cli.json = true;
    }

    let exit_code = match cli.command {
        Commands::Deploy { service, env, image, dry_run } => {
            handle_deploy(&cli, &service, &env, &image, dry_run)
        }
    };

    process::exit(exit_code);
}

fn handle_deploy(cli: &Cli, service: &str, env: &str, image: &str, dry_run: bool) -> i32 {
    if dry_run {
        let changes = vec![
            serde_json::json!({
                "action": "update",
                "resource": format!("deployment/{}", service),
                "field": "image",
                "from": "v1.0",
                "to": image,
            }),
        ];
        if cli.json {
            let env = Envelope::dry_run(changes);
            emit_json(&env);
        } else {
            eprintln!("  update deployment/{}: v1.0 -> {}", service, image);
        }
        return ExitCode::Success as i32;
    }

    match execute_deploy(service, env, image) {
        Ok(result) => {
            if cli.json {
                let mut env = Envelope::success(result);
                if let Some(ref fields) = cli.fields {
                    env.filter_fields(fields);
                }
                emit_json(&env);
            } else if !cli.quiet {
                println!("Deployed {} to {}", service, env);
            }
            ExitCode::Success as i32
        }
        Err(e) => {
            if cli.json {
                emit_error(&e);
            } else {
                eprintln!("Error [{}]: {}", e.code, e.message);
                if let Some(ref fix) = e.fix {
                    eprintln!("Fix: {}", fix);
                }
            }
            e.exit_code as i32
        }
    }
}
```

### Structured Error Type Implementing Display

```rust
// src/errors.rs
use std::fmt;

#[repr(i32)]
#[derive(Clone, Copy)]
pub enum ExitCode {
    Success = 0,
    GeneralError = 1,
    UsageError = 2,
    AuthError = 3,
    NotFound = 4,
    Conflict = 5,
    RateLimited = 6,
    Timeout = 7,
    Internal = 8,
}

pub struct CLIError {
    pub code: String,
    pub message: String,
    pub fix: Option<String>,
    pub transient: bool,
    pub exit_code: ExitCode,
}

impl fmt::Display for CLIError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl CLIError {
    pub fn new(code: &str, message: &str, exit_code: ExitCode) -> Self {
        Self {
            code: code.to_string(),
            message: message.to_string(),
            fix: None,
            transient: false,
            exit_code,
        }
    }

    pub fn with_fix(mut self, fix: &str) -> Self {
        self.fix = Some(fix.to_string());
        self
    }

    pub fn with_transient(mut self) -> Self {
        self.transient = true;
        self
    }
}
```

### JSON Envelope with serde_json

```rust
// src/output.rs
use serde::Serialize;
use serde_json::Value;
use crate::errors::CLIError;

#[derive(Serialize)]
pub struct Envelope {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warnings: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dry_run: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changes: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<String>,
    pub transient: bool,
}

impl Envelope {
    pub fn success(data: Value) -> Self {
        Self {
            status: "ok".to_string(),
            data: Some(data),
            warnings: Some(vec![]),
            meta: None,
            dry_run: None,
            changes: None,
            error: None,
        }
    }

    pub fn dry_run(changes: Vec<Value>) -> Self {
        Self {
            status: "ok".to_string(),
            data: None,
            warnings: None,
            meta: Some(serde_json::json!({"total_changes": changes.len()})),
            dry_run: Some(true),
            changes: Some(changes),
            error: None,
        }
    }

    pub fn filter_fields(&mut self, fields_csv: &str) {
        let fields: Vec<&str> = fields_csv.split(',').collect();
        if let Some(ref mut data) = self.data {
            if let Some(obj) = data.as_object_mut() {
                obj.retain(|k, _| fields.contains(&k.as_str()));
            }
        }
    }
}

pub fn emit_json(env: &Envelope) {
    let out = serde_json::to_string_pretty(env).expect("Failed to serialize");
    println!("{}", out);
}

pub fn emit_error(err: &CLIError) {
    let env = Envelope {
        status: "error".to_string(),
        data: None,
        warnings: None,
        meta: None,
        dry_run: None,
        changes: None,
        error: Some(ErrorBody {
            code: err.code.clone(),
            message: err.message.clone(),
            fix: err.fix.clone(),
            transient: err.transient,
        }),
    };
    let out = serde_json::to_string_pretty(&env).expect("Failed to serialize");
    eprintln!("{}", out);
}
```

---

## Cross-Framework Patterns

These patterns are framework-agnostic. The logic is identical across languages — only the syntax changes.

### The JSON Envelope (Universal Structure)

Every language must implement the same envelope shape. Agents parse this mechanically — diverging from the structure forces per-CLI special-case handling.

```
Success:  { "status": "ok",    "data": <T>,   "warnings": [], "meta": {} }
Error:    { "status": "error", "error": { "code": str, "message": str, "fix": str|null, "transient": bool } }
Dry-run:  { "status": "ok",   "dry_run": true, "changes": [...], "meta": { "total_changes": N } }
```

The `status` field is always first. Agents check `status` before parsing anything else. If `status` is `"error"`, the `error` object is guaranteed to exist. If `status` is `"ok"`, the `data` field is guaranteed to exist (unless `dry_run` is true, in which case `changes` is the payload).

### Exit Code Constants

Define these once in every CLI project. Agents use exit codes to decide retry strategy without parsing output.

| Code | Meaning | Agent Action |
|------|---------|-------------|
| 0 | Success | Proceed |
| 1 | General error | Read error, decide |
| 2 | Usage/validation error | Fix arguments, retry |
| 3 | Authentication error | Refresh credentials, retry |
| 4 | Not found | Check resource name |
| 5 | Conflict | Read current state, resolve |
| 6 | Rate limited | Backoff, retry (transient=true) |
| 7 | Timeout | Retry with longer timeout (transient=true) |
| 8 | Internal error | Report to user |

### TTY Detection Logic

The algorithm is the same everywhere. Only the API call differs.

```
if stdout_is_tty:
    output = human-readable (tables, colors, progress bars)
else:
    output = JSON envelope (machine-parseable)
```

Respect explicit flags: if the user passes `--json`, always use JSON regardless of TTY. If the user passes `--no-json` or `--human`, always use human output. TTY auto-detection is the default when neither flag is present.

### Error Formatting

Every error must carry four fields. The `fix` field is what makes agent-friendly CLIs fundamentally different from traditional CLIs — it gives the agent the exact command to run next instead of forcing it to reason about the error.

```
{
  "code": "RESOURCE_NOT_FOUND",         // Machine-parseable category
  "message": "Deployment 'web-app' not found in 'staging'",  // Human-readable description
  "fix": "Run: mycli deploy list --env staging",             // Actionable next step
  "transient": false                     // Can this succeed on retry?
}
```

### --version Output Format

```bash
# Human (default when TTY):
mycli 1.0.0

# JSON (when --json or piped):
{ "version": "1.0.0", "commit": "abc1234", "build_time": "2026-03-10T08:00:00Z" }
```

Include commit hash and build time in JSON mode. Agents use this to verify they are calling the expected version before running a sequence of commands.

### SIGPIPE Handling

When a CLI pipes to `head`, `grep`, or another process that closes stdin early, the kernel sends SIGPIPE. Default behavior in most languages is to print a noisy error or panic. Agent-friendly CLIs must exit silently.

**Go**: Go ignores SIGPIPE on stdout/stderr by default since Go 1.0. No action needed unless writing to other file descriptors.

**Rust**: Reset SIGPIPE to default behavior (Rust ignores it, causing write errors):

```rust
#[cfg(unix)]
unsafe { libc::signal(libc::SIGPIPE, libc::SIG_DFL); }
```

**Node.js**: Handle the EPIPE error on stdout writes:

```js
process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
});
```

**Python**: Python handles SIGPIPE correctly by default when using `print()`, but `json.dump()` to a closed pipe raises `BrokenPipeError`:

```python
import signal
signal.signal(signal.SIGPIPE, signal.SIG_DFL)
```

---

## Framework Selection Guide

| Need | Recommended | Why |
|------|-------------|-----|
| Rapid CLI prototype | Typer (Python) | Minimal boilerplate, auto-generates help, rich output built in |
| Large CLI with plugins | oclif (Node.js) | Plugin system, built-in --json, topic-based command hierarchy |
| Performance-critical | clap (Rust) | Zero-cost abstractions, compile-time validation, single binary |
| DevOps/infra tooling | Cobra (Go) | Single binary, fast startup, kubectl/docker-style UX conventions |
| General purpose (JS) | Commander.js | Mature, minimal dependencies, large ecosystem |
| General purpose (Python) | Click | Composable decorators, battle-tested, extensive documentation |
| Scripting-first (quick tools) | Commander.js | Fastest time-to-working-CLI in the Node ecosystem |
| Type-safe with auto-docs | Typer or clap | Both derive CLI schema from type annotations / struct definitions |

### Decision Checklist

1. **Distribution model**: If the CLI ships as a standalone binary (no runtime), choose Go (Cobra) or Rust (clap). If users have Node.js or Python, use those ecosystems.
2. **Plugin architecture**: If third parties extend your CLI, oclif is the only framework with a built-in plugin system. Cobra supports plugins via external binaries (kubectl-style).
3. **Startup time matters**: Go and Rust start in <5ms. Node.js starts in ~30-50ms. Python starts in ~50-100ms. For CLIs called hundreds of times in a loop, startup time compounds.
4. **Team familiarity**: The best framework is the one your team already knows. An agent-friendly CLI in Click is better than a half-finished one in clap.
5. **Ecosystem integration**: If your CLI wraps AWS/cloud APIs, Go and Python have the best SDKs. If it wraps npm packages, use Node.js. Match the ecosystem to the domain.
