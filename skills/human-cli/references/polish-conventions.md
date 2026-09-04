# Polish & Conventions

Platform conventions, configuration management, signal handling, versioning, and the personality touches that make a CLI feel professional. These are the details that separate a script from a tool.

---

## XDG Base Directory Specification

Store config, data, and state in XDG-compliant paths. Never scatter dotfiles in `$HOME`.

| XDG Variable | Default | Purpose | Example |
|-------------|---------|---------|---------|
| `$XDG_CONFIG_HOME` | `~/.config` | User configuration | `~/.config/mycli/config.toml` |
| `$XDG_DATA_HOME` | `~/.local/share` | Persistent data | `~/.local/share/mycli/templates/` |
| `$XDG_STATE_HOME` | `~/.local/state` | Logs, history, state | `~/.local/state/mycli/history.log` |
| `$XDG_CACHE_HOME` | `~/.cache` | Regenerable cache | `~/.cache/mycli/api-cache/` |

### Implementation

```python
import os
from pathlib import Path

def config_dir():
    return Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'mycli'

def data_dir():
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share')) / 'mycli'

def state_dir():
    return Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local' / 'state')) / 'mycli'

def cache_dir():
    return Path(os.environ.get('XDG_CACHE_HOME', Path.home() / '.cache')) / 'mycli'
```

### Migration from legacy paths

If the CLI previously used `~/.mycli/`, migrate gracefully:

```python
legacy_config = Path.home() / '.mycli' / 'config.toml'
xdg_config = config_dir() / 'config.toml'

if legacy_config.exists() and not xdg_config.exists():
    print(f"Migrating config from {legacy_config} to {xdg_config}", file=sys.stderr)
    xdg_config.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(legacy_config, xdg_config)
```

### macOS considerations

macOS does not set XDG variables by default. The defaults (`~/.config`, etc.) still work. Some macOS CLIs use `~/Library/Application Support/mycli/` — acceptable for App Store apps, but XDG is preferred for developer tools to match Linux behavior.

---

## Config Precedence

Configuration values resolve in this order (highest wins):

```
1. Command-line flags          --region us-east-1
2. Environment variables       MYCLI_REGION=us-east-1
3. Project-local config        ./mycli.toml (in current directory or parent)
4. User config                 ~/.config/mycli/config.toml
5. System config               /etc/mycli/config.toml
6. Built-in defaults           (compiled into the binary)
```

### Rules

- **Document the precedence** in `--help` and in the config file template.
- **Show resolved values** with `mycli config show` or `mycli config list`:
  ```
  region = us-east-1  (from: environment variable MYCLI_REGION)
  format = table      (from: user config ~/.config/mycli/config.toml)
  timeout = 30s       (from: default)
  ```
- **Environment variable naming:** `MYCLI_<FLAG_NAME>` in SCREAMING_SNAKE_CASE. `--output-format` → `MYCLI_OUTPUT_FORMAT`.
- **Project-local config** searches up the directory tree (like `.gitignore`). Name it `mycli.toml` or `.myclirc`.

### Config file format

Prefer TOML for human-readability. YAML is acceptable. JSON is not — it doesn't support comments.

```toml
# ~/.config/mycli/config.toml

[defaults]
region = "us-east-1"
format = "table"
color = true

[deploy]
replicas = 3
timeout = "5m"
```

---

## Signal Handling

Handle Unix signals gracefully to avoid leaving resources in an inconsistent state.

| Signal | Meaning | Exit Code | Action |
|--------|---------|-----------|--------|
| SIGINT (Ctrl+C) | User interrupt | 130 | Cleanup resources, show summary, exit |
| SIGTERM | Graceful termination | 143 | Same as SIGINT |
| SIGPIPE | Broken pipe | 141 (silent) | Exit immediately without error — `head`, `grep` close pipes early |
| SIGHUP | Terminal hangover | 129 | Save state if possible, exit |

### Implementation

**Python:**
```python
import signal, sys

def handle_sigint(signum, frame):
    print("\nInterrupted. Cleaning up...", file=sys.stderr)
    cleanup()
    sys.exit(130)

signal.signal(signal.SIGINT, handle_sigint)
signal.signal(signal.SIGPIPE, signal.SIG_DFL)  # Don't raise BrokenPipeError
```

**Node.js:**
```js
process.on('SIGINT', () => {
  console.error('\nInterrupted. Cleaning up...');
  cleanup();
  process.exit(130);
});

// Handle SIGPIPE silently
process.on('SIGPIPE', () => process.exit(141));
```

**Go:**
```go
ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer cancel()

// Use ctx in long-running operations
select {
case <-ctx.Done():
    cleanup()
    os.Exit(130)
}
```

### Rules

- **Always show a message on SIGINT.** Don't exit silently — the user needs to know cleanup happened.
- **Don't catch SIGKILL or SIGSTOP.** They can't be caught anyway.
- **Don't swallow SIGPIPE.** Let it exit silently with 141. Programs like `head -1` close the pipe early — that's normal.
- **Second Ctrl+C = immediate exit.** If cleanup is slow, let the user force-quit:
  ```
  first_interrupt = False
  def handle_sigint(signum, frame):
      nonlocal first_interrupt
      if first_interrupt:
          sys.exit(1)  # Force exit on second Ctrl+C
      first_interrupt = True
      print("\nInterrupted. Press Ctrl+C again to force quit.", file=sys.stderr)
      cleanup()
      sys.exit(130)
  ```

---

## Exit Codes

| Code | Meaning | When to use |
|------|---------|-------------|
| 0 | Success | Command completed successfully |
| 1 | General error | Unspecified failure |
| 2 | Usage error | Invalid arguments, bad flags, missing required input |
| 126 | Cannot execute | Permission denied on a file the CLI tried to run |
| 127 | Command not found | External dependency missing |
| 130 | SIGINT | User pressed Ctrl+C |
| 141 | SIGPIPE | Pipe closed early (normal) |
| 143 | SIGTERM | Process terminated |

**Rules:**
- **Non-zero on any failure.** Never exit 0 when something went wrong.
- **Exit code 2 for usage errors.** Invalid flags, missing args — consistent with POSIX conventions.
- **Document exit codes in `--help`** if the CLI has more than the standard set.

---

## Backward Compatibility and Semver

### What is the CLI's public API?

The following are part of the CLI's semver contract:

| Component | Change type | Example |
|-----------|-------------|---------|
| Flag names | Breaking if removed/renamed | `--output` → `--format` is breaking |
| Subcommand names | Breaking if removed/renamed | `mycli pods` → `mycli pod` is breaking |
| Exit codes | Breaking if changed | Exit 0 → exit 1 for the same scenario |
| Default values | Minor if changed | Default replicas 1 → 3 is a feature |
| Output format | Breaking if changed | Removing a column from table output |
| Environment variables | Breaking if removed/renamed | `MYCLI_TOKEN` → `MYCLI_API_TOKEN` |

### Deprecation timeline

1. **v1.5:** Add `--format`, keep `--output` as alias. Print stderr warning when `--output` is used.
2. **v2.0:** Remove `--output`. Document in CHANGELOG under "Removed."

---

## ASCII Art and Personality

### First-run banner

Show a brief welcome on first invocation:

```
$ mycli
  ╔═══════════════════════════════════╗
  ║  Welcome to mycli v1.0.0          ║
  ║  Run 'mycli help' to get started  ║
  ╚═══════════════════════════════════╝
```

### Rules

- **First run only.** Set a flag in `$XDG_STATE_HOME/mycli/first-run` after displaying.
- **Suppressible.** `--no-banner` flag or `MYCLI_NO_BANNER=1` env var.
- **Keep it short.** 3-5 lines maximum. No Figlet/large ASCII art on every invocation.
- **Include version and a single actionable next step** (`run 'mycli help'`).

### Personality in messages

CLIs can have personality without being unprofessional:
- `✓ Deployed to production. Your users will be pleased.`
- `⚠ Config not found. Creating default at ~/.config/mycli/config.toml`

Avoid:
- Jokes in error messages (users in a crisis don't want humor)
- Excessive emoji
- Overly casual language (`yo`, `sup`, `lol`)
- Condescending tone (`Surely you meant...`)

---

## Self-Update Mechanism

For CLIs distributed as standalone binaries, consider a self-update command:

```
$ mycli self-update
Current version: 1.2.0
Latest version:  1.3.0
Downloading... ████████████████████ 100%
✓ Updated to 1.3.0

Changelog: https://github.com/org/mycli/releases/tag/v1.3.0
```

### Rules

- **Never auto-update.** Always require explicit invocation.
- **Show changelog URL** so the user knows what changed.
- **Verify binary integrity** (checksum or signature) before replacing.
- **Keep the previous version** for rollback: `mycli self-update --rollback`.
