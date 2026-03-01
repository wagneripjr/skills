# Errors

Command failures, exceptions, and unexpected behaviors captured during development.

**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted

## Priority Guide

| Priority | When to Use |
|----------|-------------|
| `critical` | Blocks core functionality, data loss risk, security issue |
| `high` | Significant impact, affects common workflows, recurring issue |
| `medium` | Moderate impact, workaround exists |
| `low` | Minor inconvenience, edge case |

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being investigated or fixed |
| `resolved` | Error fixed (add Resolution block with commit/PR) |
| `wont_fix` | Won't address (add reason in Resolution notes) |
| `promoted` | Root cause promoted to CLAUDE.md or auto memory |

---

## [ERR-20260228-001] stitch.sh check_stitch_extension

**Logged**: 2026-02-28T12:00:00Z
**Priority**: high
**Status**: resolved

### Summary
`check_stitch_extension()` always reports "not found" even when Stitch extension IS installed.

### Error
```
ERROR: Stitch extension not found in Gemini CLI.
```

### Context
- `gemini extensions list` outputs to **stderr**, not stdout
- The script used `gemini extensions list 2>/dev/null | grep -qi stitch`
- `2>/dev/null` suppresses stderr, leaving empty pipe for grep → always "not found"
- Confirmed: `gemini extensions list 2>&1 | grep -qi stitch` returns FOUND

### Suggested Fix
Change `2>/dev/null` to `2>&1` in `check_stitch_extension()`.

### Resolution
- **Resolved**: 2026-02-28
- **Commit**: pending (fix applied to stitch.sh line 47)
- **Notes**: Many CLI tools output to stderr when piped (no TTY detection). Always use `2>&1` when piping CLI output to grep.

### Metadata
- Reproducible: yes
- Related Files: skills/stitch/stitch.sh
- Tags: gemini-cli, stderr, pipe, macOS
- See Also: ERR-20260228-002

---

## [ERR-20260228-002] stitch.sh run_gemini timeout

**Logged**: 2026-02-28T12:00:00Z
**Priority**: high
**Status**: resolved

### Summary
`timeout` command not available on macOS — every `run_gemini()` call fails with "command not found".

### Error
```
timeout: command not found
```

### Context
- `timeout` is GNU coreutils, not in macOS base install
- Used as `timeout "$GEMINI_TIMEOUT" gemini -p "$prompt" --yolo 2>&1`
- Affects ALL commands that invoke Gemini (check, create, generate, edit, export)

### Suggested Fix
Remove `timeout` entirely. Just call `gemini -p "$prompt" --yolo 2>&1` directly. User can Ctrl+C if needed.

### Resolution
- **Resolved**: 2026-02-28
- **Commit**: pending (fix applied to stitch.sh line 125)
- **Notes**: Avoid GNU coreutils commands in portable shell scripts: `timeout`, `readlink -f`, `seq`, `shuf`. Use POSIX alternatives or check availability.

### Metadata
- Reproducible: yes
- Related Files: skills/stitch/stitch.sh
- Tags: macOS, gnu-coreutils, timeout, portability
- See Also: ERR-20260228-001

---

