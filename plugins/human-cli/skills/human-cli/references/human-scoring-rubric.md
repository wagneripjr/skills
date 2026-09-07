# Human-Friendliness Scoring Rubric

Seven axes, each scored 0-3, for a total of 0-21. Use this rubric to evaluate how well a CLI tool serves human users, and to prioritize improvements that yield the highest comfort and productivity return.

---

## Axes Overview

| # | Axis | Core Question |
|---|------|---------------|
| 1 | Command Learnability | Can a new user construct valid commands without reading full docs? |
| 2 | Visual Clarity | Does the output guide the eye to what matters? |
| 3 | Error Recovery | Can a user fix errors from the error message alone? |
| 4 | Interactive Comfort | Do prompts help without blocking automation? |
| 5 | Discoverability | Can a user find features they didn't know existed? |
| 6 | Responsiveness | Does the CLI feel fast and show progress for slow operations? |
| 7 | Configuration & Conventions | Does the CLI follow platform conventions and respect preferences? |

---

## Axis 1: Command Learnability

**Core question:** Can a new user construct valid commands without reading full documentation?

A learnable CLI has memorable command names, consistent grammar, and predictable flag patterns. Users should be able to guess the next command from the ones they already know.

| Score | Criteria |
|-------|----------|
| **0** | Inconsistent naming. Mixed grammar patterns. Positional arguments with no hint of order. Users must read docs for every command. |
| **1** | Consistent grammar pattern (noun-verb or verb-noun) but poor naming. Long, cryptic command names. No aliases. |
| **2** | Consistent grammar, memorable names, short aliases for common commands. Flag names are self-documenting. Help available on every subcommand. |
| **3** | All of level 2 plus: tab completion, `did-you-mean` suggestions for typos, command grouping by intent in help, and a guided wizard for first-time users. |

**What to test:**
- Ask a new user to list, create, and delete a resource using the CLI without reading docs. Can they guess the command?
- Type a misspelled command. Does the CLI suggest the correct one?
- How many characters must a user type to complete the most common operation?
- Are there aliases for frequently used commands (`ls`, `rm`, `cp`)?
- Run `--help` on the root command. Are commands grouped by user intent?

**Why this matters first:** If users can't construct commands, they can't use the CLI at all. Learnability is the entry barrier.

---

## Axis 2: Visual Clarity

**Core question:** Does the output guide the eye to what matters?

Clear output uses alignment, color, and whitespace to create a visual hierarchy. The most important information (status, name, errors) stands out; secondary information (timestamps, IDs) recedes.

| Score | Criteria |
|-------|----------|
| **0** | Unformatted text dump. No alignment, no color, no visual hierarchy. Users must scan every character to find information. |
| **1** | Basic formatting — columns or key-value pairs — but no color, no icons, no alignment. Output is readable but slow to scan. |
| **2** | Aligned tables with headers, semantic color (green=success, red=error), TTY-aware rendering. Color meaning always paired with text. Respects NO_COLOR. |
| **3** | All of level 2 plus: adaptive width, empty state messages with next-step guidance, dim/muted secondary info, truncation with `…` instead of wrapping, consistent icon vocabulary across commands. |

**What to test:**
- Run a `list` command. Can you identify the most important column in under 2 seconds?
- Run with `NO_COLOR=1`. Is the output still understandable without color?
- Pipe output to `cat`. Are there any ANSI escape codes in the piped output?
- Resize the terminal to 60 columns. Does the output adapt or break?
- Run a command that returns no results. Does it show an empty-state message with guidance?

**Why this matters:** Users spend most of their CLI time reading output, not typing commands. Unclear output creates cognitive overhead on every invocation.

---

## Axis 3: Error Recovery

**Core question:** Can a user fix errors from the error message alone?

Great error messages tell the user: (1) what failed, (2) why it failed, and (3) exactly what to do about it. The user should never need to search the web for an error message.

| Score | Criteria |
|-------|----------|
| **0** | Errors are raw exceptions, stack traces, or generic messages ("Error: failed", "Something went wrong"). No guidance. |
| **1** | Errors identify what failed ("Error: config file not found") but don't explain why or how to fix it. |
| **2** | Errors include what failed, why, and a concrete fix command or documentation URL. Example: `Error: config file not found at ~/.config/mycli/config.toml. Run 'mycli init' to create one.` |
| **3** | All of level 2 plus: contextual hints (different fix suggestions based on the error cause), link to relevant docs, exit code distinguishes error types, error output on stderr (not mixed with stdout data). |

**What to test:**
- Trigger 5 different errors (missing file, invalid flag, auth failure, network error, permission denied). For each, can you fix it from the message alone?
- Do errors go to stderr? Run `mycli bad-command 2>/dev/null` — does stderr show the error?
- Does the error message include a command to run or a URL to visit?
- Are exit codes semantic (2=usage, 1=general)?

**Why this matters:** Every confusing error message is a potential user abandonment or a support ticket. Self-service error recovery is the highest-ROI UX investment.

---

## Axis 4: Interactive Comfort

**Core question:** Do prompts help without blocking automation?

Interactive prompts make destructive operations safer and complex inputs easier. But prompts that block scripts or CI/CD with no bypass are a deal-breaker.

| Score | Criteria |
|-------|----------|
| **0** | No interactive prompts. Destructive operations execute silently. Or: prompts exist but have no bypass flags, blocking all automation. |
| **1** | Confirmation prompts on destructive operations, but no bypass flag. Or: bypass exists (`--yes`) but prompts still fire in non-TTY contexts. |
| **2** | Prompts on destructive ops with `--yes`/`--force` bypass. TTY detection prevents prompts in non-interactive mode (fails with actionable error). |
| **3** | All of level 2 plus: rich prompt types (select, multi-select, search), `--dry-run` preview before commit, guided wizards for complex setup, all prompts have corresponding flag bypasses. |

**What to test:**
- Run a destructive command. Does it confirm before executing?
- Run the same command with `--yes` or `--force`. Does it skip the prompt?
- Pipe input: `echo "" | mycli delete resource`. Does it hang waiting for input or fail gracefully?
- Is there a `--dry-run` for mutating commands?
- Run `mycli init` — does it guide first-time setup interactively?

**Why this matters:** The balance between safety (prompts prevent mistakes) and automation (scripts can't answer prompts) defines whether the CLI works in both contexts.

---

## Axis 5: Discoverability

**Core question:** Can a user find features they didn't know existed?

A discoverable CLI teaches new features through help text, completions, suggestions, and contextual hints. Users shouldn't need to read a manual cover-to-cover.

| Score | Criteria |
|-------|----------|
| **0** | Only `--help` with flag list. No examples, no suggestions, no completions. Users must know what they're looking for. |
| **1** | `--help` with examples on some commands. No shell completions. No suggestions for related commands. |
| **2** | `--help` with examples on all commands, shell completions (bash/zsh/fish), and `SEE ALSO` sections linking related commands. |
| **3** | All of level 2 plus: `did-you-mean` typo correction, `mycli help <topic>` for guided tutorials, command suggestions based on context ("Did you mean `mycli deploy`? You're in a project directory."), and man pages. |

**What to test:**
- Run `--help` on 3 commands. Does every one have an examples section?
- Does shell completion work? Install it and try tab-completing a command and a flag.
- Type a misspelled command. Does the CLI suggest the correct one?
- Run `mycli help` (no args). Does it show all commands grouped by category?
- Is there a way to discover commands for a specific workflow (e.g., "how do I deploy?")?

**Why this matters:** Users only use features they know about. Poor discoverability means features go unused regardless of quality.

---

## Axis 6: Responsiveness

**Core question:** Does the CLI feel fast and show progress for slow operations?

A responsive CLI has fast startup, immediate feedback for quick operations, and visible progress for slow ones. Silence during a long operation is indistinguishable from a hang.

| Score | Criteria |
|-------|----------|
| **0** | Startup over 1 second. No progress indication for slow operations. The terminal sits silent for 30+ seconds. |
| **1** | Startup under 1 second. Some slow operations show a message before starting but no ongoing progress. |
| **2** | Startup under 500ms. Spinner on operations >1s. Progress bar when total is known. Elapsed time shown on completion. |
| **3** | All of level 2 plus: step-by-step feedback for multi-phase operations, lazy-loaded plugins, background update checks (non-blocking), OS notification for very long operations (opt-in). |

**What to test:**
- `time mycli --version` — is it under 500ms?
- Start a long operation (deploy, download, migration). Is there a spinner within 1 second?
- For file transfers or batch operations, is there a progress bar with ETA?
- For multi-step operations, can you see which step is current?
- Does the spinner/bar render on stderr (not polluting stdout)?

**Why this matters:** Perceived performance affects user confidence. A silent 10-second operation feels broken; the same operation with a progress bar feels fast.

---

## Axis 7: Configuration & Conventions

**Core question:** Does the CLI follow platform conventions and respect user preferences?

A conventional CLI stores config in standard locations, respects environment variables, follows semver, and plays well with the Unix ecosystem.

| Score | Criteria |
|-------|----------|
| **0** | Config in random location. No env var support. Ignores NO_COLOR. No version command. Breaking changes without version bump. |
| **1** | Config in `$HOME` (dotfile). `--version` exists. Basic env var support. May not follow XDG or NO_COLOR. |
| **2** | XDG-compliant paths. NO_COLOR respected. Config precedence documented (flags > env > file > defaults). Semantic exit codes. `--version` prints name+semver. Graceful signal handling. |
| **3** | All of level 2 plus: project-local config (like `.gitignore` search), `mycli config show` displaying resolved values with sources, migration from legacy paths, self-update mechanism, deprecation warnings for removed features. |

**What to test:**
- Where does the CLI store config? Is it XDG-compliant?
- Set `NO_COLOR=1`. Does color disappear?
- Run `mycli --version`. Does it print name and semver?
- Set a config value via env var and via config file. Does the env var win?
- Press Ctrl+C during a long operation. Does it clean up and exit 130?
- What happens when you pass a deprecated flag?

**Why this matters:** Platform conventions create predictability. A CLI that stores config in `~/.mycli/`, ignores NO_COLOR, and crashes on SIGINT feels unprofessional and untrustworthy.

---

## Score Interpretation

| Range | Rating | Description |
|-------|--------|-------------|
| 0-5 | **Hostile** | Actively frustrating. Users fight the CLI to get basic tasks done. Error messages don't help, commands aren't discoverable, no visual feedback. |
| 6-10 | **Functional** | Gets the job done but requires memorization, doc-diving, and patience. No delight, no guidance, workable for experts only. |
| 11-15 | **Comfortable** | Pleasant to use daily. Good help, clear output, progress feedback. A few rough edges remain — typically in discoverability or config conventions. |
| 16-21 | **Delightful** | Users actively enjoy using the CLI. Teaches as it runs, recovers gracefully from errors, adapts to context. The kind of CLI people recommend to others. |

---

## How to Evaluate

### Step 1: Inventory commands

List all top-level commands and subcommands. Group by purpose:
- **CRUD operations** — `list`, `get`, `create`, `update`, `delete`
- **Workflow operations** — `deploy`, `init`, `build`, `test`
- **Config operations** — `config set`, `config get`, `login`
- **Meta operations** — `version`, `help`, `completion`

### Step 2: Select representative commands

Pick the 3-5 most common operations. Include at least one CRUD, one workflow, and one error scenario.

### Step 3: Score each axis independently

For each axis, test representative commands against the criteria table. Score based on the highest level consistently met. If level 2 for most commands but level 0 for some, score at 1.

### Step 4: Sum and interpret

Add the seven axis scores (0-21). Use the interpretation table to classify.

### Step 5: Identify improvement priorities

Rank axes by score (lowest first). Use the prioritization section below.

---

## Example Evaluations

### `gh` (GitHub CLI) — Score: 17/21 (Delightful)

| Axis | Score | Rationale |
|------|-------|-----------|
| Command Learnability | 3 | Consistent verb-noun grammar (`gh pr list`, `gh issue create`). Tab completion. `did-you-mean` suggestions. Aliases configurable via `gh alias set`. |
| Visual Clarity | 3 | Color-coded status columns. Adaptive width. Empty states with guidance. NO_COLOR support. Dim metadata. |
| Error Recovery | 2 | Good error messages with context. Some errors lack fix commands. Auth errors explain how to re-auth. |
| Interactive Comfort | 3 | `gh pr create` has interactive mode with prompts. All prompts bypassable with flags. `--web` opens browser alternative. TTY-aware. |
| Discoverability | 2 | Examples in help. Completions. No `did-you-mean` for subcommands (only aliases). No help topics. |
| Responsiveness | 2 | Fast startup (~200ms). Spinner for API calls. No multi-step progress. No ETA. |
| Configuration & Conventions | 2 | XDG paths. NO_COLOR. Config show. No self-update. No deprecation warnings. |

### `rg` (ripgrep) — Score: 16/21 (Delightful)

| Axis | Score | Rationale |
|------|-------|-----------|
| Command Learnability | 2 | Single-command CLI (no subcommands to learn). Flag names match grep conventions. Many flags to memorize for advanced use. |
| Visual Clarity | 3 | Color-coded matches, filenames, line numbers. Respects NO_COLOR. Adaptive to terminal width. Groups results by file. |
| Error Recovery | 2 | Clear error messages ("No such file or directory"). Missing: fix suggestions and documentation links. |
| Interactive Comfort | 2 | No prompts needed (non-destructive). `--` separates flags from patterns. Works perfectly in pipes. |
| Discoverability | 2 | Excellent `--help` with grouped sections. Man page. No tab completion by default. No examples in help. |
| Responsiveness | 3 | Instantaneous startup. Streams results as found. Progress not needed (fast enough). |
| Configuration & Conventions | 2 | Config via `.ripgreprc`. NO_COLOR. Semantic exit codes (0=match, 1=no match, 2=error). SIGPIPE handled. |

### `docker` CLI — Score: 11/21 (Comfortable)

| Axis | Score | Rationale |
|------|-------|-----------|
| Command Learnability | 2 | Consistent noun-verb (`docker container list`). Legacy aliases (`docker ps`). Tab completion available. Many commands to discover. |
| Visual Clarity | 1 | Basic table formatting. Limited color. ID truncation. No empty-state guidance. |
| Error Recovery | 1 | Error messages identify what failed but rarely suggest fixes. Daemon connection errors are cryptic. |
| Interactive Comfort | 1 | Minimal prompting. `docker system prune` has confirm but many destructive operations don't. |
| Discoverability | 2 | Good help text. Shell completions. No `did-you-mean`. Management commands group help. |
| Responsiveness | 2 | Fast startup. Pull shows layer progress. Build shows step progress. No spinner for other operations. |
| Configuration & Conventions | 2 | Config in `~/.docker/` (not XDG). Env vars documented. Exit codes semantic. Signal handling OK. |

### `aws` CLI — Score: 10/21 (Functional)

| Axis | Score | Rationale |
|------|-------|-----------|
| Command Learnability | 1 | Consistent grammar (`aws <service> <action>`). But 300+ services — overwhelming. Command names match API names, not human intent. |
| Visual Clarity | 1 | Default output is JSON (not human-friendly). `--output table` exists but formatting is basic. No color. |
| Error Recovery | 2 | Error messages include error code, message, and sometimes a fix. Auth errors are clear. Permission errors reference IAM policy. |
| Interactive Comfort | 1 | `aws configure` is interactive. Almost nothing else prompts. No `--dry-run` on most services. |
| Discoverability | 2 | `--help` on every command. Tab completion. `aws help` opens man-style pager. No examples in most help. |
| Responsiveness | 1 | Startup ~800ms (Python). No spinner. No progress bar except S3 transfers. |
| Configuration & Conventions | 2 | Config in `~/.aws/` (pre-XDG convention). Env vars well-documented. Exit codes semantic. Profiles system well-designed. |

---

## Improvement Prioritization

### High ROI (improve first)

**Error Recovery (Axis 3):** Adding "what failed + why + fix command" to error messages is the highest-ROI improvement. Every user hits errors; self-service recovery eliminates support burden. Implementation cost is low — it's string formatting.

**Visual Clarity (Axis 2):** Adding color, alignment, and empty-state messages transforms the output experience. Most frameworks have libraries that handle 90% of the work.

### Medium ROI (improve second)

**Command Learnability (Axis 1):** Consistent naming and aliases reduce the learning curve. Add tab completion — it's usually a framework feature that takes minutes to enable.

**Responsiveness (Axis 6):** Add spinners for slow operations. Optimize startup by lazy-loading. Low engineering effort, high perceived quality improvement.

### Lower ROI (improve third)

**Interactive Comfort (Axis 4):** Add confirmation prompts for destructive operations. Important for safety but lower frequency than the above.

**Discoverability (Axis 5):** Add examples to `--help`, `did-you-mean` suggestions. Improves onboarding but power users bypass these.

**Configuration & Conventions (Axis 7):** Migrate to XDG, add signal handling. Important for professionalism but invisible to most users until something goes wrong.

### Score-Based Decision Matrix

| Current Total | Priority Actions |
|---------------|-----------------|
| 0-5 | Axis 3 (errors) and Axis 1 (learnability) first. Users can't use the CLI if they can't construct commands or recover from errors. |
| 6-10 | Axis 2 (output) and Axis 6 (responsiveness). The CLI works but feels rough. Polish the visual experience. |
| 11-15 | Axis 4 (prompts) and Axis 5 (discovery). Add safety prompts and help users find features. |
| 16-18 | Axis 7 (conventions). Follow all platform standards. Add self-update, deprecation warnings. |
| 19-21 | Maintain and iterate. Monitor user feedback for pain points. |

---

## Applying This Rubric

1. **Score it** — Walk through all seven axes using the procedure above
2. **Identify the floor** — The lowest-scoring axis determines the bottleneck user experience
3. **Plan improvements** — Use the prioritization matrix to sequence work
4. **Re-evaluate after changes** — Score again to verify improvement and catch regressions
5. **Document the score** — Include the per-axis breakdown in the CLI's README so users know what to expect

The goal is not 21/21 on every CLI. The goal is to identify the minimum investment that moves the CLI into the "Comfortable" range (11+) and then iterate based on user feedback.
