# Performance & Feedback

How to optimize CLI startup time, implement spinners and progress bars, and keep the user informed about what's happening. A responsive CLI feels trustworthy — silence feels broken.

---

## Startup Performance

### The 500ms rule

Users perceive CLI response under 100ms as instant, under 500ms as fast, and over 1 second as slow. Every invocation pays the startup cost, so it compounds across daily usage.

**Benchmark:** `time mycli --version` should complete in under 500ms. If it takes longer, profile and optimize.

### Common startup bottlenecks

| Bottleneck | Impact | Fix |
|------------|--------|-----|
| Loading all plugins/commands | 200-2000ms | Lazy-load: only initialize the invoked subcommand |
| Network call at startup | 500-5000ms | Never block on network during startup; async update check |
| Large dependency import | 100-500ms per import | Defer imports to the subcommand that needs them |
| Config file parsing | 10-100ms | Cache parsed config; skip if not needed for the command |
| Shell completion setup | 10-50ms | Completion scripts are sourced by the shell, not the CLI |

### Lazy loading patterns

**Node.js — dynamic import:**
```js
// Don't import everything at the top
// import { heavyDep } from 'heavy-dep';

// Instead, import inside the command handler
program.command('deploy')
  .action(async (opts) => {
    const { heavyDep } = await import('heavy-dep');
    // ... use heavyDep
  });
```

**Python — deferred import:**
```python
# Instead of top-level: import boto3
# Import inside the function that needs it:
def deploy(env):
    import boto3  # Only loaded when deploy is called
    client = boto3.client('ecs')
```

**Go — init() avoidance:**
```go
// Don't do heavy work in init()
// func init() { loadAllPlugins() }

// Instead, load in the command's RunE
var deployCmd = &cobra.Command{
    Use: "deploy",
    RunE: func(cmd *cobra.Command, args []string) error {
        plugins := loadPlugins() // Only when deploy is invoked
        return doDeploy(plugins)
    },
}
```

**Rust — feature flags:**
```toml
# Cargo.toml — compile heavy features conditionally
[features]
default = ["core"]
deploy = ["aws-sdk", "docker"]
```

### Update checks

Never block startup for update checks. Run them asynchronously or after the command completes:

```python
import threading

def check_for_updates():
    # Background thread — non-blocking
    pass

# Start check in background, don't wait
threading.Thread(target=check_for_updates, daemon=True).start()

# After main command completes, show update notice if available
if update_available:
    print("Update available: mycli 2.0.0. Run: mycli self-update", file=sys.stderr)
```

---

## Spinners

### When to use a spinner

Use a spinner when:
- The operation takes **more than 1 second**
- The **total work is unknown** (can't show a percentage)
- Examples: API calls, DNS resolution, container pulls without progress data

### Spinner design

```
⠋ Deploying to production...
⠙ Deploying to production...
⠹ Deploying to production...
✓ Deployed to production (3.2s)
```

### Rules

- **Render on stderr.** Stdout must remain clean for data.
- **Show elapsed time** on completion: `✓ Done (3.2s)` — reduces "was that fast or slow?" anxiety.
- **Clear the spinner line** before printing results. Don't leave spinner artifacts.
- **Update the message** as phases change: `Deploying...` → `Pushing image...` → `Updating manifest...`
- **Stop on error** and show the failure message, not a frozen spinner.

### Libraries

| Framework | Library | Notes |
|-----------|---------|-------|
| Node.js | `ora` | De facto standard. TTY-aware, respects NO_COLOR |
| Node.js | `nanospinner` | Lighter alternative to ora |
| Python | `yaspin` | Decorator and context manager support |
| Python | `rich.spinner` | Part of the rich ecosystem |
| Python | `halo` | Similar API to ora |
| Go | `briandowns/spinner` | 90+ spinner styles |
| Go | `charmbracelet/bubbles` | Spinner component in Bubble Tea |
| Rust | `indicatif` | Spinner + progress bar in one crate |
| Rust | `spinners` | Lightweight spinner-only crate |

---

## Progress Bars

### When to use a progress bar

Use a progress bar when:
- The operation takes **more than 2 seconds**
- The **total work is known** (file size, item count, step count)
- Examples: file downloads, batch processing, migrations, multi-step deploys

### Progress bar design

```
Downloading assets ████████████░░░░░░░░ 62% (31/50 MB) ETA: 12s
```

### Components

| Component | Required? | Example |
|-----------|-----------|---------|
| Label | Yes | `Downloading assets` |
| Bar | Yes | `████████░░░░░░` |
| Percentage | Yes | `62%` |
| Count/size | Recommended | `31/50 MB` or `150/240 items` |
| ETA | Recommended | `ETA: 12s` |
| Speed | Optional | `2.5 MB/s` |
| Elapsed | Optional | `[00:15]` |

### Rules

- **Render on stderr.** Same reasoning as spinners.
- **Update no faster than 10 times per second.** More frequent updates cause flickering.
- **Show a final summary:** `Downloaded 50 MB in 28s (1.8 MB/s)`.
- **Degrade to a spinner** when total is unknown (e.g., streaming API response of unknown size).
- **Multi-bar for parallel operations:**
  ```
  Pulling image  ████████████████████ 100%
  Building app   ████████░░░░░░░░░░░░  40% ETA: 15s
  Running tests  ░░░░░░░░░░░░░░░░░░░░   0% (waiting)
  ```

### Libraries

| Framework | Library | Multi-bar | Notes |
|-----------|---------|-----------|-------|
| Node.js | `cli-progress` | Yes | Customizable format, multi-bar |
| Node.js | `progress` | No | Simpler API, single bar |
| Python | `rich.progress` | Yes | Best-in-class Python progress |
| Python | `tqdm` | Yes | Popular, pip-installable |
| Go | `schollz/progressbar/v3` | No | Simple API |
| Go | `vbauerster/mpb` | Yes | Multiple bars, ETA |
| Rust | `indicatif` | Yes | Multi-progress, templates, ETA |

---

## Step-by-Step Feedback

For multi-phase operations, show progress as a checklist:

```
$ mycli deploy production
  ✓ Building application (2.3s)
  ✓ Running tests (15.4s)
  ✓ Pushing container image (8.1s)
  ⠋ Updating deployment manifest...
  ○ Running health checks
  ○ Updating DNS

Step 4/6 — Updating deployment manifest
```

### Rules

- **Number the steps** (4/6) so the user knows how far along they are.
- **Show elapsed time per step** on completion.
- **Mark completed steps** with `✓`, current step with a spinner, pending steps with `○`.
- **Don't re-render completed steps.** Scroll down, don't repaint the screen (unless using a TUI library).

---

## OS Notifications

For operations taking more than 30 seconds, consider sending an OS notification on completion:

```bash
# macOS
osascript -e 'display notification "Deploy complete" with title "mycli"'

# Linux (libnotify)
notify-send "mycli" "Deploy complete"
```

**Rules:**
- **Opt-in only.** Don't send notifications unless the user enables them via config or `--notify` flag.
- **Only on success or failure.** Don't notify for warnings or informational messages.
- **Include the result:** "Deploy to production succeeded" not just "Deploy complete."

---

## Silent Mode

Support `--quiet` / `-q` to suppress all non-essential output:

```
$ mycli deploy production --quiet
# Only errors printed to stderr. No progress, no spinners, no success message.
# Exit code tells the result: 0 = success, non-zero = failure.
```

`--quiet` is essential for scripts that parse exit codes only. The CLI should still output data to stdout if the command's purpose is to produce output (e.g., `mycli list --quiet` still lists, just without decorations).
