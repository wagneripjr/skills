# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed or knowledge integrated |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md or auto memory |
| `promoted_to_skill` | Extracted as a reusable skill |

## Skill Extraction Fields

When a learning is promoted to a skill, add these fields:

```markdown
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

---

## [LRN-20260228-001] correction

**Logged**: 2026-02-28T12:00:00Z
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
User corrected: shipped stitch.sh with untested scripts and overengineered features nobody asked for.

### Details
Created `stitch.sh` with 10 commands (379 lines) when only 7 were needed. Added `list`, `screens`, `variants`, `design-system` commands, `--model`/`--count`/`--range` options — none requested. Script was never tested on macOS, had two critical bugs (stderr pipe, GNU timeout). User: "you designed the stitch skill and put scripts without testing it! and overengineered it too! stop doing this, do only what was asked!"

### Suggested Action
Before shipping wrapper scripts: (1) test on macOS, (2) only implement what was asked, (3) avoid GNU coreutils assumptions, (4) run the script at least once before committing.

### Resolution
- **Resolved**: 2026-02-28
- **Notes**: Simplified to 7 commands (298 lines). Fixed both bugs. All 11 tests pass. Check command now correctly detects Stitch extension.

### Metadata
- Source: user_feedback
- Related Files: skills/stitch/stitch.sh
- Tags: overengineering, testing, macOS, user-correction

---

## [LRN-20260228-002] best_practice

**Logged**: 2026-02-28T12:00:00Z
**Priority**: high
**Status**: promoted
**Promoted**: MEMORY.md + .learnings/ERRORS.md
**Area**: config

### Summary
Gemini CLI outputs `extensions list` to stderr, not stdout — pipe to grep requires `2>&1`.

### Details
Many CLI tools (Gemini CLI, others) write user-facing output to stderr when they detect they're in a pipe (no TTY). This means `cli-tool 2>/dev/null | grep pattern` will fail because grep gets empty input. Always use `2>&1 |` when piping CLI output for pattern matching.

### Suggested Action
Add to anti-patterns memory: "When piping CLI output to grep, use `2>&1 |` not `2>/dev/null |` — many tools output to stderr when piped."

### Metadata
- Source: error
- Related Files: skills/stitch/stitch.sh
- Tags: stderr, pipe, grep, cli-tools, gemini-cli
- See Also: ERR-20260228-001

---

## [LRN-20260301-002] best_practice

**Logged**: 2026-03-01T15:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
`source <(sed -n '/^func_name()/,/^}/p' script.sh)` fails silently in subshells — use `bash -c` with inline `$(sed ...)` instead when testing individual functions from monolithic shell scripts.

### Details
When testing shell functions extracted from a larger script, `source <(sed ...)` inside a `(...)` subshell silently fails to define the function, causing "command not found" errors. The process substitution `<(...)` interacts poorly with the subshell context. The fix is to use `bash -c` which creates a clean execution context:

```bash
# FAILS in subshells:
source <(sed -n '/^add_screen_id()/,/^}/p' "$STITCH")
add_screen_id "abc"  # command not found

# WORKS reliably:
bash -c "
    STITCH_CONFIG='.stitch.json'
    $(sed -n '/^add_screen_id()/,/^}/p' "$STITCH")
    add_screen_id abc
"
```

The `$(sed ...)` runs in the outer shell (where `$STITCH` is defined), expands the function definition inline, and `bash -c` executes it in a fresh context.

### Suggested Action
Use the `bash -c` + `$(sed ...)` pattern when writing unit tests for individual functions from monolithic shell scripts. Create a `run_stitch_fn` helper to DRY up repeated extractions.

### Resolution
- **Resolved**: 2026-03-01
- **Notes**: Applied in `test-stitch.sh` — all 17 tests pass including 6 new screen ID tracking tests.

### Metadata
- Source: error
- Related Files: skills/stitch/test-stitch.sh
- Tags: bash, testing, subshell, process-substitution, source, sed

---

