# Visual Output Design

How to render CLI output that guides the human eye to what matters — using tables, color, icons, and TTY-aware formatting. Output is the CLI's primary communication channel with the user; every design choice either clarifies or clutters.

---

## TTY-Aware Dual-Mode Output

The same CLI serves two audiences from one binary by checking whether stdout is a terminal:

```
stdout is a TTY → Human mode: tables, color, icons, alignment
stdout is piped → Machine mode: plain text, one item per line, no ANSI
--json flag     → Force JSON envelope regardless of TTY
--no-color flag → Human formatting without ANSI escape codes
```

### Detection patterns

**Node.js:**
```js
import { isatty } from 'node:tty';
const humanMode = isatty(1) && !process.env.NO_COLOR && !opts.noColor;
```

**Python:**
```python
import sys
human_mode = sys.stdout.isatty() and not os.environ.get('NO_COLOR') and not args.no_color
```

**Go:**
```go
import "golang.org/x/term"
humanMode := term.IsTerminal(int(os.Stdout.Fd())) && os.Getenv("NO_COLOR") == "" && !opts.NoColor
```

**Rust:**
```rust
use atty::is;
let human_mode = is(atty::Stream::Stdout) && std::env::var("NO_COLOR").is_err() && !opts.no_color;
// Or use `is-terminal` crate (atty successor): stdout().is_terminal()
```

### Mode behavior matrix

| Concern | Human mode (TTY) | Machine mode (piped) |
|---------|------------------|---------------------|
| Color | Semantic ANSI codes | None — strip all escape sequences |
| Tables | Aligned columns with headers | TSV or one-item-per-line |
| Icons | Unicode symbols (checkmark, cross, arrow) | Text labels only |
| Progress | Spinner/bar on stderr | Silent or single status line |
| Width | Adapt to terminal width (`process.stdout.columns`) | No width assumption |

---

## Semantic Color Palette

Use color to reinforce meaning, never as the sole carrier of meaning. Every colored element must also have a text label, icon, or structural distinction.

| Meaning | Color | ANSI | Example |
|---------|-------|------|---------|
| Success | Green | `\x1b[32m` | `✓ Deployed to production` |
| Error | Red | `\x1b[31m` | `✗ Build failed: missing dependency` |
| Warning | Yellow | `\x1b[33m` | `⚠ Config file not found, using defaults` |
| Info | Cyan | `\x1b[36m` | `ℹ Using region us-east-1` |
| Muted/secondary | Dim/gray | `\x1b[2m` | Timestamps, IDs, metadata |
| Emphasis | Bold | `\x1b[1m` | Command names, resource names |
| User input echo | Magenta | `\x1b[35m` | Values the user typed |

### Rules

- **Maximum 4 colors in any single output.** More creates visual noise.
- **Bold for structure, color for status.** Headers are bold; status indicators are colored.
- **Dim for noise reduction.** Timestamps, UUIDs, and metadata in dim gray reduce visual weight.
- **Never red for non-errors.** Users interpret red as "something is wrong."

---

## Table Rendering

### Aligned columns with headers

```
NAME         STATUS    REPLICAS   AGE
web-server   Running   3/3        2d
api-gateway  Pending   1/3        5m
worker       Failed    0/3        1h
```

### Design rules

1. **Left-align text, right-align numbers.** Text scans left-to-right; numbers compare right-to-left.
2. **Truncate, don't wrap.** Long values get truncated with `…` rather than wrapping to the next line: `my-very-long-resource-na…`
3. **Adapt to terminal width.** Drop low-priority columns on narrow terminals rather than producing horizontal scroll.
4. **Column order by importance.** The most relevant columns appear first (leftmost). ID/name is always first.
5. **No borders by default.** Borders (box-drawing characters) add clutter. Use spacing and alignment instead. Offer `--border` for users who prefer them.

### Empty state

Don't print nothing. Don't print an empty table:

```
# Bad
NAME    STATUS    REPLICAS

# Good
No pods found. Create one with: mycli pod create --name my-pod
```

An empty state is a teaching moment — tell the user what to do next.

---

## Icons and Symbols

Use Unicode symbols sparingly to reinforce status:

| Symbol | Meaning | Usage |
|--------|---------|-------|
| `✓` (U+2713) | Success/complete | `✓ Tests passed` |
| `✗` (U+2717) | Failure/error | `✗ Build failed` |
| `⚠` (U+26A0) | Warning | `⚠ Deprecated flag` |
| `ℹ` (U+2139) | Information | `ℹ Using default config` |
| `→` (U+2192) | Arrow/flow | `→ Deploying to us-east-1` |
| `●` (U+25CF) | Bullet/status dot | `● Running  ○ Stopped` |
| `…` (U+2026) | Truncation | `my-long-name…` |

### Rules

- **One icon per line maximum.** Multiple icons per line create visual confusion.
- **Pair icon with text.** `✓ Passed` not just `✓`. Icons supplement; they don't replace.
- **Avoid emoji.** Emoji render inconsistently across terminals. Unicode symbols are more reliable.
- **Degrade gracefully.** When `TERM=dumb` or a legacy terminal, fall back to ASCII: `[OK]`, `[FAIL]`, `[WARN]`, `[INFO]`.

---

## NO_COLOR and Color Disabling

Respect the [no-color.org](https://no-color.org) convention:

### Priority order (highest wins)

1. `--no-color` flag → disable
2. `NO_COLOR` environment variable (any value, including empty string) → disable
3. `FORCE_COLOR` environment variable → enable (overrides NO_COLOR if both set — controversial, some tools support it)
4. `TERM=dumb` → disable
5. TTY detection → enable if TTY, disable if piped

### Implementation

```python
def should_color(args):
    if args.no_color:
        return False
    if 'NO_COLOR' in os.environ:
        return False
    if os.environ.get('TERM') == 'dumb':
        return False
    return sys.stdout.isatty()
```

### Testing

Always test output with `NO_COLOR=1 mycli list | cat` to verify ANSI stripping works. Search the output for `\x1b` — any match is a bug.

---

## ANSI Stripping

When writing to a non-TTY, strip all ANSI escape sequences before writing. Don't rely on the terminal to ignore them — downstream tools (`grep`, `wc`, `awk`) see them as characters.

```js
// Node.js
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
```

```python
# Python
import re
def strip_ansi(text):
    return re.sub(r'\x1b\[[0-9;]*m', '', text)
```

**Libraries that handle this automatically:**
- Node.js: `chalk` respects `NO_COLOR` and non-TTY. `strip-ansi` for manual stripping.
- Python: `rich` respects `NO_COLOR`. `colorama` + `strip_ansi`.
- Go: `fatih/color` respects `NO_COLOR` and non-TTY.
- Rust: `colored` respects `NO_COLOR`. `console` crate for auto-detection.

---

## Output on stderr vs stdout

| Content | Destination | Why |
|---------|-------------|-----|
| Data (tables, results, JSON) | stdout | Consumers pipe and redirect stdout |
| Errors | stderr | Errors must appear even when stdout is redirected |
| Warnings | stderr | Same reason as errors |
| Progress (spinners, bars) | stderr | Progress indicators pollute piped data |
| Prompts | stderr (or /dev/tty) | Prompts must appear even when stdout is piped |
| Debug/verbose output | stderr | Verbose diagnostics are for the operator, not the consumer |

**Rule:** If in doubt, stderr. Only data the user explicitly asked for goes to stdout.

---

## Width Adaptation

Detect terminal width and adapt output:

```python
import shutil
width = shutil.get_terminal_size().columns  # Default 80 if not a TTY
```

```js
const width = process.stdout.columns || 80;
```

### Responsive strategies

| Width | Strategy |
|-------|----------|
| < 60 | Drop all but essential columns. Stack key-value pairs vertically. |
| 60-100 | Show primary columns with truncation. |
| 100-160 | Show all columns comfortably. |
| > 160 | Add spacing between columns. Don't stretch to fill ultra-wide terminals. |

Cap maximum output width at ~160 characters even on very wide terminals. Text that spans 300 characters is harder to read than text at 120.
