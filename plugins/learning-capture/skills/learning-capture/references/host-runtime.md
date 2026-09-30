# Host runtime: Claude Code and Codex

The skill behaves the same on either host. Only how it is invoked and what the fault nudge can see differ.

Resolve bundled paths from the installed `SKILL.md`, never from the project's working directory. `<skill-dir>` is the directory that holds `SKILL.md`, and `<plugin-root>` is two levels above it. Quote every path. `.learnings/` and every path inside it stay relative to the project's root.

| Capability | Claude Code | Codex |
|---|---|---|
| Invocation | `/learning-capture`, or the Skill tool with `learning-capture:learning-capture` | `$learning-capture:learning-capture` |
| Bootstrap `.learnings/` | Bash: `node "<skill-dir>/scripts/bootstrap.mjs" [repo-root]` | Terminal execution, same command |
| Next free id | Bash: `node "<skill-dir>/scripts/entries.mjs" next-id <LRN\|ERR\|FEAT> [.learnings]` | Terminal execution, same command |
| Extract a skill | Bash: `node "<skill-dir>/scripts/extract-skill.mjs" <name> [--dry-run]` | Terminal execution, same command |
| Machine-local capture (absent-by-decision) | `~/.claude/projects/<project>/memory/learnings.md`, where `<project>` is the absolute project path with `/` replaced by `-`; list `~/.claude/projects/` and take the entry that matches the current path | The host's own per-project memory location if the session exposes one; otherwise put the full entry in the reply and say it was not persisted |
| Fault nudge | `PostToolUse` on `Bash`, from `hooks/hooks.json` | `PostToolUse` on `Bash`, from `hooks/codex-hooks.json` |

Both hosts run the same `hooks/error-detector.mjs`, and on both it stays silent unless the project has a `.learnings/` directory.

**The Codex nudge reads output only.** Claude Code's `tool_response` carries an exit code or an error flag, so a passing command whose output merely mentions `Error:` is recognised as passing and stays quiet. Codex hands the hook a bare string of output with no exit code, so there the nudge relies on the output patterns alone — plus the `0 failed` / `all tests passed` override. Expect the occasional nudge after a successful command that printed failure vocabulary, and the occasional miss after a failure that printed none. The nudge is a prompt to consider logging, never a verdict: read the output before filing an entry.

If `node` is missing, the scripts cannot run and the nudge never fires. Say so, and create the files by hand from `<skill-dir>/assets/` only where the absent-by-decision rule allows it.
