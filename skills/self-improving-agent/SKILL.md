---
name: self-improving-agent
description: "This skill should be used whenever: a command or operation fails unexpectedly, user corrects Claude or says 'that's wrong' or 'actually...', user requests a capability that doesn't exist, an external API or tool fails, knowledge is discovered to be outdated or incorrect, a better approach is found for a recurring task, or before starting major tasks (to review past learnings). Captures learnings, errors, and corrections to structured .learnings/ logs for continuous improvement. Even when the situation seems minor, always consider logging — small learnings compound into significant improvements over time."
---

# Self-Improving Agent

Log learnings, errors, and feature requests to structured markdown files in `.learnings/` for continuous improvement across sessions. Coding agents process these into fixes, and high-value learnings get promoted to project memory (`CLAUDE.md`) or cross-project memory (`~/.claude/projects/*/memory/`).

## Quick Reference

| Situation | Action |
|-----------|--------|
| Command/operation fails | Log to `.learnings/ERRORS.md` |
| User corrects you | Log to `.learnings/LEARNINGS.md` with category `correction` |
| User wants missing feature | Log to `.learnings/FEATURE_REQUESTS.md` |
| API/external tool fails | Log to `.learnings/ERRORS.md` with integration details |
| Knowledge was outdated | Log to `.learnings/LEARNINGS.md` with category `knowledge_gap` |
| Found better approach | Log to `.learnings/LEARNINGS.md` with category `best_practice` |
| Similar to existing entry | Link with `**See Also**`, consider priority bump |
| Broadly applicable learning | Promote — see Promotion Decision Tree below |
| Before starting major task | Review `.learnings/` for relevant past entries |

## Initialization

On first use in any project, create the `.learnings/` directory and populate it with templates from this skill's `assets/` folder. Copy the templates — do not symlink, because each project builds its own knowledge base.

```bash
mkdir -p .learnings
cp "${CLAUDE_PLUGIN_ROOT}/skills/self-improving-agent/assets/LEARNINGS.md" .learnings/
cp "${CLAUDE_PLUGIN_ROOT}/skills/self-improving-agent/assets/ERRORS.md" .learnings/
cp "${CLAUDE_PLUGIN_ROOT}/skills/self-improving-agent/assets/FEATURE_REQUESTS.md" .learnings/
```

If `.learnings/` already exists with entries, do not overwrite — the templates are only for bootstrapping empty projects.

## Logging Format

Log immediately after the event — context is freshest right after the issue occurs. Delayed logging loses critical details about what was tried, what failed, and why.

### Learning Entry

Append to `.learnings/LEARNINGS.md`:

```markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
One-line description of what was learned

### Details
Full context: what happened, what was wrong, what's correct

### Suggested Action
Specific fix or improvement to make

### Metadata
- Source: conversation | error | user_feedback
- Related Files: path/to/file.ext
- Tags: tag1, tag2
- See Also: LRN-20250110-001 (if related to existing entry)

---
```

### Error Entry

Append to `.learnings/ERRORS.md`:

```markdown
## [ERR-YYYYMMDD-XXX] skill_or_command_name

**Logged**: ISO-8601 timestamp
**Priority**: high
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
Brief description of what failed

### Error
```
Actual error message or output
```

### Context
- Command/operation attempted
- Input or parameters used
- Environment details if relevant

### Suggested Fix
If identifiable, what might resolve this

### Metadata
- Reproducible: yes | no | unknown
- Related Files: path/to/file.ext
- See Also: ERR-20250110-001 (if recurring)

---
```

### Feature Request Entry

Append to `.learnings/FEATURE_REQUESTS.md`:

```markdown
## [FEAT-YYYYMMDD-XXX] capability_name

**Logged**: ISO-8601 timestamp
**Priority**: medium
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Requested Capability
What the user wanted to do

### User Context
Why they needed it, what problem they're solving

### Complexity Estimate
simple | medium | complex

### Suggested Implementation
How this could be built, what it might extend

### Metadata
- Frequency: first_time | recurring
- Related Features: existing_feature_name

---
```

## ID Generation

Format: `TYPE-YYYYMMDD-XXX`
- **TYPE**: `LRN` (learning), `ERR` (error), `FEAT` (feature)
- **YYYYMMDD**: Current date
- **XXX**: Sequential number or random 3 chars (e.g., `001`, `A7B`)

Check for collisions before creating — scan the target file for existing IDs with the same date prefix. Use the next available sequential number.

## Status Lifecycle

| Status | Meaning | Next Actions |
|--------|---------|-------------|
| `pending` | Not yet addressed | Investigate, fix, or promote |
| `in_progress` | Actively being worked on | Complete or block |
| `resolved` | Issue fixed or knowledge integrated | Archive or promote |
| `wont_fix` | Decided not to address (add reason) | Document why in Resolution |
| `promoted` | Elevated to CLAUDE.md or auto memory | Update with promotion target |
| `promoted_to_skill` | Extracted as a reusable skill | Add Skill-Path field |

When resolving, add a Resolution block after Metadata:

```markdown
### Resolution
- **Resolved**: ISO-8601 timestamp
- **Commit/PR**: abc123 or #42
- **Notes**: Brief description of what was done
```

When promoting, add a Promoted field:

```markdown
**Status**: promoted
**Promoted**: CLAUDE.md (or auto memory)
```

## Promotion Decision Tree

Not every learning deserves promotion. Use this decision tree to route learnings to the right destination — promoting too aggressively clutters project memory, while promoting too conservatively loses institutional knowledge.

```
Is the learning project-specific?
├── Yes → Convention/gotcha any session in THIS project should know?
│   ├── Yes → Promote to project CLAUDE.md
│   │         (Distill into a concise rule. Add to relevant section.)
│   └── No  → Keep in .learnings/ as resolved
│             (One-off fix, not worth permanent memory.)
└── No  → Cross-project pattern applicable to multiple repos?
    ├── Yes → Promote to auto memory (~/.claude/projects/*/memory/)
    │         (Write to the appropriate topic file in memory/.)
    └── No  → Keep in .learnings/ as resolved
              (Too niche for cross-project, too generic for this project.)
```

### How to Promote

1. **Distill** the learning into a concise rule or fact — strip investigation context, keep the actionable insight
2. **Add** to the appropriate target:
   - **CLAUDE.md**: Add to the relevant section (create section if needed). Write as a directive, not a narrative.
   - **Auto memory**: Write to `~/.claude/projects/<project-path>/memory/<topic>.md`. Use semantic topic files (e.g., `patterns.md`, `debugging.md`).
3. **Update** the original entry: set `**Status**: promoted` and add `**Promoted**: <target>`

### Promotion Examples

**Learning** (verbose in `.learnings/`):
> Project uses pnpm workspaces. Attempted `npm install` but failed. Lock file is `pnpm-lock.yaml`. Must use `pnpm install`.

**Promoted to CLAUDE.md** (concise):
```markdown
## Build & Dependencies
- Package manager: pnpm (not npm) — use `pnpm install`
```

**Learning** (verbose):
> When modifying API endpoints, must regenerate TypeScript client. Forgetting causes type mismatches at runtime.

**Promoted to auto memory** `patterns.md` (actionable):
```markdown
## API Client Regeneration
After changing API endpoints, always run client regeneration. Type mismatches from stale clients only appear at runtime.
```

## Detection Triggers

Automatically log when any of these signals appear — do not wait for the user to ask. Proactive logging is the entire point of this skill.

**Corrections** (log as learning with `correction` category):
- "No, that's not right..."
- "Actually, it should be..."
- "You're wrong about..."
- "That's outdated..."
- User provides different information than what you assumed

**Feature Requests** (log as feature request):
- "Can you also..."
- "I wish you could..."
- "Is there a way to..."
- "Why can't you..."

**Knowledge Gaps** (log as learning with `knowledge_gap` category):
- User provides information you didn't know
- Documentation you referenced is outdated
- API behavior differs from your understanding
- Configuration or convention you assumed incorrectly

**Errors** (log as error entry):
- Command returns non-zero exit code
- Exception or stack trace in output
- Unexpected output or behavior
- Timeout or connection failure

## Recurring Pattern Detection

Before logging a new entry, search for similar existing entries — recurring patterns are the most valuable signal for promotion.

1. **Search first**: `grep -r "keyword" .learnings/`
2. **Link entries**: Add `**See Also**: ERR-20250110-001` in Metadata
3. **Bump priority** if the issue keeps recurring (medium → high → critical)
4. **Consider systemic fix**: Recurring issues often indicate:
   - Missing documentation → promote to CLAUDE.md
   - Missing automation → create a hook or script
   - Architectural problem → create tech debt ticket or feature request

When a pattern recurs 3+ times across different contexts, it almost certainly deserves promotion.

## Priority Guidelines

| Priority | When to Use |
|----------|-------------|
| `critical` | Blocks core functionality, data loss risk, security issue |
| `high` | Significant impact, affects common workflows, recurring issue |
| `medium` | Moderate impact, workaround exists |
| `low` | Minor inconvenience, edge case, nice-to-have |

Default to `medium` when unsure. Bump up on recurrence; bump down if a workaround is trivial.

## Area Tags

Use to filter learnings by codebase region:

| Area | Scope |
|------|-------|
| `frontend` | UI, components, client-side code |
| `backend` | API, services, server-side code |
| `infra` | CI/CD, deployment, Docker, cloud |
| `tests` | Test files, testing utilities, coverage |
| `docs` | Documentation, comments, READMEs |
| `config` | Configuration files, environment, settings |

## Periodic Review

Review `.learnings/` at natural breakpoints — stale learnings lose value rapidly.

### When to Review
- Before starting a new major task (check for relevant past entries)
- After completing a feature (resolve fixed items)
- When working in an area with past learnings (apply what was learned)
- Weekly during active development (prevent staleness)

### Quick Status Check
```bash
# Count pending items
grep -h "Status\*\*: pending" .learnings/*.md | wc -l

# List pending high-priority items
grep -B5 "Priority\*\*: high" .learnings/*.md | grep "^## \["

# Find learnings for a specific area
grep -l "Area\*\*: backend" .learnings/*.md
```

### Review Actions
- Resolve fixed items (update status, add Resolution block)
- Promote applicable learnings (follow decision tree)
- Link related entries (add See Also cross-references)
- Escalate recurring issues (bump priority, consider systemic fix)

## Skill Extraction

When a learning is valuable enough to become a reusable skill, extract it. A learning qualifies when ANY of these apply:

| Criterion | Description |
|-----------|-------------|
| **Recurring** | Has `See Also` links to 2+ similar issues |
| **Verified** | Status is `resolved` with a working fix |
| **Non-obvious** | Required debugging or investigation to discover |
| **Broadly applicable** | Not project-specific; useful across codebases |
| **User-flagged** | User says "save this as a skill" or similar |

### Extraction Workflow

1. **Identify candidate**: Learning meets extraction criteria above
2. **Run helper** (or create manually):
   ```bash
   "${CLAUDE_PLUGIN_ROOT}/skills/self-improving-agent/scripts/extract-skill.sh" skill-name --dry-run
   "${CLAUDE_PLUGIN_ROOT}/skills/self-improving-agent/scripts/extract-skill.sh" skill-name
   ```
3. **Customize SKILL.md**: Fill the TODO sections with content from the learning
4. **Test and iterate**: Use `skill-creator:skill-creator` to test with prompts, evaluate, and refine
5. **Update learning**: Set `**Status**: promoted_to_skill` and add `**Skill-Path**: skills/<name>`

### Extraction Detection Triggers

Watch for these signals in conversation:
- "Save this as a skill" / "Remember this pattern"
- "I keep running into this"
- "This would be useful for other projects"

In learning entries:
- Multiple `See Also` links (recurring issue)
- High priority + resolved status
- Category `best_practice` with broad applicability

## Hook Integration

This skill includes two hook scripts that fire automatically when installed as a plugin:

| Script | Hook Type | Behavior |
|--------|-----------|----------|
| `scripts/activator.sh` | UserPromptSubmit | Injects `<self-improvement-reminder>` after each prompt (~50-100 tokens) |
| `scripts/error-detector.sh` | PostToolUse (Bash) | Injects `<error-detected>` when command output matches error patterns |

The hooks are configured in the plugin's `hooks/hooks.json` — no manual setup required when installed via the plugin system. The activator provides a lightweight nudge to evaluate learnings; the error detector catches failures that might otherwise be dismissed.

## Gitignore Options

Choose based on team preference:

**Keep learnings local** (per-developer, private iterations):
```gitignore
.learnings/
```

**Track learnings in repo** (team-wide, shared knowledge):
Don't add `.learnings/` to `.gitignore` — entries become shared knowledge that any contributor benefits from.

**Hybrid** (track structure, ignore entries):
```gitignore
.learnings/*.md
!.learnings/.gitkeep
```

## Best Practices

1. **Log immediately** — context is freshest right after the issue
2. **Be specific** — future sessions need to understand quickly without full conversation context
3. **Include reproduction steps** — especially for errors; "it failed" is not actionable
4. **Link related files** — makes fixes easier to locate and verify
5. **Suggest concrete fixes** — not just "investigate" or "look into this"
6. **Use consistent categories** — enables filtering and pattern detection
7. **Promote aggressively** — if in doubt, promote; a slightly cluttered CLAUDE.md is better than lost institutional knowledge
8. **Review regularly** — stale learnings lose value; unresolved entries accumulate debt

For concrete entry examples, consult `references/examples.md` bundled with this skill.
