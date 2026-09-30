---
name: learning-capture
description: "Captures learnings, errors and feature requests as structured entries in a project's .learnings/ directory, building institutional memory that compounds across sessions. Use whenever: a command or operation fails unexpectedly, the user corrects the agent or says 'that's wrong' or 'actually...', the user requests a capability that doesn't exist, an external API or tool fails, knowledge is discovered to be outdated or incorrect, a better approach is found for a recurring task, an adversarial review finding is applied, or before starting major tasks (to review past learnings). Categorizes entries by type, priority and area, attributes a finding to the skill whose text should have prevented it, tracks recurring patterns with cross-references, and promotes proven insights to CLAUDE.md or auto memory. Never recreates a .learnings/ corpus a repository removed by decision. Not an error-handling skill: it records what was learned, it does not fix the failure."
---

# Learning Capture

Log learnings, errors, and feature requests to structured markdown files in `.learnings/` so what one session learns reaches the next. High-value learnings get promoted to project memory (`CLAUDE.md`) or cross-project memory (auto memory).

**Two memory tiers.** `.learnings/` entries are *episodic* memory — specific, timestamped experiences. Promotion distills proven ones into *semantic* memory — durable rules in `CLAUDE.md`, auto memory, or skills. The experience stays logged; the lesson graduates to where every session reads it.

The entry grammar is a contract other tools read: [references/entry-format.md](references/entry-format.md). Worked entries: [references/examples.md](references/examples.md). Claude Code versus Codex: [references/host-runtime.md](references/host-runtime.md). `<skill-dir>` below is the directory holding this `SKILL.md`.

## Quick Reference

| Situation | Trigger Phrases | Action |
|-----------|----------------|--------|
| Command/operation fails | Non-zero exit, stack trace, timeout | Log to `.learnings/ERRORS.md` |
| User corrects you | "that's wrong", "actually...", "no, it should be..." | Log to `.learnings/LEARNINGS.md`, category `correction` |
| User wants missing feature | "can you also...", "I wish you could...", "is there a way to..." | Log to `.learnings/FEATURE_REQUESTS.md` |
| API/external tool fails | Connection refused, timeout, unexpected response | Log to `.learnings/ERRORS.md` with integration details |
| Knowledge was outdated | User provides info you didn't know, docs are stale | Log to `.learnings/LEARNINGS.md`, category `knowledge_gap` |
| Found better approach | Discovered during investigation or review | Log to `.learnings/LEARNINGS.md`, category `best_practice` |
| Applied an adversarial-review finding | A review job's finding was fixed this turn | Log to `.learnings/LEARNINGS.md`, category `review_finding`, with `**Review**: <job-id>`, in the same turn as the fix |
| Similar to existing entry | `grep -r "keyword" .learnings/` finds a match | Link with `See Also`, consider a priority bump |
| Broadly applicable learning | Recurring 3+ times, useful cross-project | Promote — see the decision tree below |
| Before starting a major task | New feature, unfamiliar area | Review `.learnings/` for relevant past entries |

## Initialization

Bootstrap the corpus with the bundled script rather than by hand, because the script enforces the one rule that matters most here:

```bash
node "<skill-dir>/scripts/bootstrap.mjs" [repo-root]
```

It prints one of three decisions:

- `present` — `.learnings/` exists. It copies only templates whose file is missing and never overwrites one, so existing entries are safe. Exit 0.
- `may-create` — no directory and no decision against one. It creates `.learnings/` and copies the three templates from `assets/`. Copies, never symlinks: each project builds its own knowledge base. Exit 0.
- `absent-by-decision` — the directory is absent **and** the repository's `.gitignore` carries a `.learnings/` line (`/.learnings`, with or without the slashes). It writes nothing and exits 3.

**Never recreate a corpus a repository removed by decision.** A gitignored, absent `.learnings/` is a decision, not an omission: the corpus was removed on purpose. Do not bootstrap it, do not `mkdir` it, and do not edit `.gitignore` to make room for it. Capture to machine-local memory instead, and finish both steps — a decision to capture elsewhere that writes nothing loses the learning outright:

1. Write the full entry, in the format below, to a `learnings.md` in the host's per-project memory directory, outside the repository (the location per host is in [references/host-runtime.md](references/host-runtime.md)). Create the file if it is missing.
2. Tell the user the path you wrote, and why: `.learnings/` is gitignored and absent, so the repository chose to keep no corpus.

A missing file is easy to add later; a corpus recreated in a repository that deleted it undoes a decision nobody asked you to revisit.

## Logging Format

Log immediately after the event — context is freshest right after the issue occurs. Delayed logging loses what was tried, what failed, and why. Write for a future session that never saw this conversation: state the mechanism rather than "it failed", give reproduction steps and the files involved, and suggest a concrete fix rather than "investigate". Append below the template's final `---`; never rewrite an existing entry's header.

### Learning Entry

Append to `.learnings/LEARNINGS.md`:

```markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config
**Skill**: <plugin>:<name> | none
**Fix-type**: rule | skill | verifier | refactor
**Review**: <review job id> (only for a review_finding entry)

### Summary
One-line description of what was learned

### Details
Full context: what happened, what was wrong, what's correct

### Suggested Action
Specific fix or improvement to make

### Metadata
- Source: conversation | error | user_feedback | review
- Related Files: path/to/file.ext
- Tags: tag1, tag2
- See Also: LRN-20250110-001 (if related to an existing entry)

---
```

Categories: `correction`, `insight`, `knowledge_gap`, `best_practice`, `review_finding` — spelled exactly so, snake_case, because readers filter on them.

### Error Entry

Append to `.learnings/ERRORS.md` with the header `## [ERR-YYYYMMDD-XXX] command_name`, the same `Logged`/`Priority`/`Status`/`Area` lines, then `### Summary`, `### Error` (the actual output, fenced), `### Context` (command, inputs, environment), `### Suggested Fix`, and `### Metadata` (`- Reproducible: yes | no | unknown`, `- Related Files:`, `- See Also:`). Never paste output containing a column-0 `**Name**: value` or `- Name: value` line into the fence — a reader takes the last occurrence of a field, fenced or not, so indent such a line.

### Feature Request Entry

Append to `.learnings/FEATURE_REQUESTS.md` with the header `## [FEAT-YYYYMMDD-XXX] capability_name`, the same four field lines, then `### Requested Capability`, `### User Context`, `### Complexity Estimate` (`simple | medium | complex`), `### Suggested Implementation`, and `### Metadata` (`- Frequency: first_time | recurring`, `- Related Features:`).

### Evidence Fields (optional)

`- Applications:`, `- Confirmations:`, `- Contradictions:`, `- Confidence:` and `- Last-Observed:` bullets under `### Metadata` record how proven an entry is. On a recurrence, increment `Applications` and bump `Last-Observed` instead of logging a duplicate. Record observations, not derived numbers: a consumer may score them, and this skill computes nothing from them. Their spellings and the numeric rule are in [references/entry-format.md](references/entry-format.md#evidence-fields).

**Reserved fields.** `**Scenario**`, `**Verdict**` and `**Activation**` belong to a consumer that reconciles an entry into a skill. Capture never writes them, even when an entry is about a skill — writing one would tell that consumer work happened that did not.

### Attribution Fields

The entry is the one authoritative record of which skill a finding is against. Anything else that cites the finding points at the entry's id instead of repeating it.

- `**Skill**` — the skill whose text should have prevented the finding, as `<plugin>:<name>` (for example `example-plugin:example-skill`) — any plugin's skill, not only this one's — or `none`. An entry without the line reads as `none`. Attribution is a judgement at capture; nothing checks that the named skill is the right one, so name the one whose text a reader would have followed.
- `**Fix-type**` — which kind of change closes it. `rule` is a `CLAUDE.md` line or an auto-memory rule; `skill` is a `SKILL.md` edit, or a new skill when `**Skill**` is `none`; `verifier` is an own-code hook or check; `refactor` is a code change.
- `**Review**` — for a finding from an adversarial review, the review job's id, under the category `review_finding`. File the entry in the same turn as the fix: the next turn has already lost which job raised it. List several ids separated by commas or whitespace.

## ID Generation

Format: `TYPE-YYYYMMDD-XXX` — `TYPE` is `LRN`, `ERR` or `FEAT`; `YYYYMMDD` is today's UTC date, the same clock as `**Logged**: …Z`; `XXX` is three characters `[A-Z0-9]`, sequential (`001`, `002`) preferred. Get the next free id from the plugin's reader rather than by eye, because a collision silently merges two findings for every tool that looks one up:

```bash
node "<skill-dir>/scripts/entries.mjs" next-id LRN .learnings
```

It prints one id, for example `LRN-20260930-001`. `node "<skill-dir>/scripts/entries.mjs" list .learnings` prints every entry as id, file and status. An id, once written, never changes: other documents cite it.

## Status Lifecycle

| Status | Meaning | Next Actions |
|--------|---------|-------------|
| `pending` | Not yet addressed | Investigate, fix, or promote |
| `in_progress` | Actively being worked on | Complete or block |
| `resolved` | Issue fixed or knowledge integrated | Archive or promote |
| `wont_fix` | Decided not to address | Document why in Resolution |
| `promoted` | Elevated to CLAUDE.md, auto memory, or a skill | Add `**Promoted**: <target>` |
| `promoted_to_skill` | Extracted as a reusable skill | Add `**Skill-Path**: skills/<name>` |

Write statuses exactly as shown, lowercase. When resolving, add a `### Resolution` block after Metadata with `- **Resolved**:` (ISO-8601), `- **Commit/PR**:` and `- **Notes**:`.

## Promotion Decision Tree

Not every learning deserves promotion — promoting too aggressively clutters project memory, too conservatively loses institutional knowledge.

```
Is the learning project-specific?
├── Yes → Convention/gotcha any session in THIS project should know?
│   ├── Yes → Promote to project CLAUDE.md (a concise rule, in the relevant section)
│   └── No  → Keep in .learnings/ as resolved
└── No  → Cross-project pattern applicable to multiple repos?
    ├── Yes → Promote to auto memory (a topic file in the memory directory)
    └── No  → Keep in .learnings/ as resolved
```

**When to promote** — a rule of thumb, not a computation: `Applications ≥ 3`, or resolved with high `Confidence`, or **user-flagged** ("make sure this never happens again", "remember this"). A user flag promotes on first sight; otherwise unproven one-offs stay in `.learnings/` until they earn it, which keeps semantic memory trustworthy.

### How to Promote

1. **Distill** the learning into a concise rule — strip the investigation, keep the actionable insight. Write a directive, not a narrative.
2. **Add** it to the target: the relevant `CLAUDE.md` section (create one if needed), or a semantic topic file in auto memory (`patterns.md`, `debugging.md`).
3. **Update** the entry: `**Status**: promoted` and `**Promoted**: CLAUDE.md` (or `auto memory (<file>)`, or a skill path).
4. **Mark the destination** with a back-reference so the rule traces to its source:
   ```markdown
   <!-- source: LRN-YYYYMMDD-XXX | promoted: YYYY-MM-DD -->
   ```
   Above the rule in `CLAUDE.md`; inline in an auto-memory file; in the source-tracking section of an extracted skill. Invisible when rendered, greppable by id.

## Recurring Pattern Detection

Search before logging — recurrence is the strongest promotion signal.

1. `grep -r "keyword" .learnings/`
2. On a match, link the entries with `- See Also:` and increment `Applications` rather than logging a duplicate.
3. Bump priority when it keeps recurring (medium → high → critical).
4. Consider the systemic fix: missing documentation → promote to `CLAUDE.md`; missing automation → a hook or script; an architectural problem → a feature request.

## Priority and Area

| Priority | When to Use |
|----------|-------------|
| `critical` | Blocks core functionality, data loss risk, security issue |
| `high` | Significant impact, affects common workflows, recurring issue |
| `medium` | Moderate impact, workaround exists — the default when unsure |
| `low` | Minor inconvenience, edge case, nice-to-have |

Area tags filter by codebase region: `frontend` (UI, client code), `backend` (API, services), `infra` (CI/CD, deployment, cloud), `tests`, `docs`, `config` (configuration, environment, settings).

## Periodic Review

Review `.learnings/` before a major task, after finishing a feature, when working in an area with past entries, and weekly during active development — stale learnings lose value fast.

```bash
grep -h "Status\*\*: pending" .learnings/*.md | wc -l
grep -B5 "Priority\*\*: high" .learnings/*.md | grep "^## \["
grep -l "Area\*\*: backend" .learnings/*.md
```

Resolve fixed items, promote what earned it, link related entries, escalate recurring ones.

### Prune & Decay

Knowledge bases rot if they only grow. During review, also subtract:

- **Archive the superseded** — once promoted, the semantic version owns the knowledge; leave the entry as the audit trail.
- **Decay the contradicted** — increment `Contradictions` when newer evidence conflicts; if the entry stays unconvincing and has not recurred, mark it `wont_fix` with a reason. Never delete silently: the reason is itself a learning, and the id may be cited elsewhere.
- **Find stale candidates** — `grep -l "Status\*\*: resolved" .learnings/*.md`, then check `Logged` dates.

## Skill Extraction

Extract a learning as a reusable skill when it is recurring (`See Also` to 2+ entries), verified (resolved with a working fix), non-obvious, broadly applicable, or the user says "save this as a skill".

```bash
node "<skill-dir>/scripts/extract-skill.mjs" skill-name --dry-run
node "<skill-dir>/scripts/extract-skill.mjs" skill-name [--output-dir <relative-dir>]
```

The script accepts only lowercase-hyphenated names and relative output directories without `..`, and refuses to overwrite an existing skill. Fill the scaffold's TODO sections from the learning, put the back-reference in its Source Learning section, test and iterate it with your skill-authoring workflow, then set the entry's `**Status**: promoted_to_skill` and `**Skill-Path**: skills/<name>`.

## Hook Integration

One hook ships at the plugin level, `<plugin-root>/hooks/error-detector.mjs`, on `PostToolUse` for `Bash`, registered for both hosts. It self-gates on a `.learnings/` directory in the working directory, so a project that has not opted in never sees it. It stays silent when the result reports success (exit code 0, or an error flag of false), when a summary reads `0 failed`, when the command itself touches `.learnings/`, and inside subagents. Otherwise, when the output matches an error pattern, it injects an `<error-detected>` nudge naming the command and asking for `**Skill**`, `**Fix-type**` and `**Review**`. It fails open: bad input yields `{}`. Treat the nudge as a prompt to consider logging, never as proof of failure.

## Gitignore Options

- **Keep learnings local** (per-developer): create `.learnings/` first, then add `.learnings/` to `.gitignore`. The order matters — a gitignored `.learnings/` with no directory is read as a decision to have no corpus, and bootstrap refuses it.
- **Track learnings in the repo** (team-wide): leave `.learnings/` out of `.gitignore`.
- **Hybrid** (track structure, ignore entries): `.learnings/*.md` and `!.learnings/.gitkeep`.