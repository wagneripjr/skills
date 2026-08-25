---
name: okf-maintain
description: "Use when adopting the Open Knowledge Format (OKF v0.2) in a repository, or maintaining a documentation bundle already in it: bootstraps a conformant tree, stamps and repairs YAML frontmatter, regenerates every index.md bottom-up, excludes paths another tool owns via .okfignore, removes log.md and strips changelog/history sections because git already holds history losslessly, and wires CLAUDE.md/AGENTS.md/GEMINI.md to the root index so agents stop grepping for a document's identity. Ships a conformance check that fails closed. Triggers on: 'set up OKF', 'make these docs OKF-conformant', 'regenerate the docs index', 'add frontmatter to the docs', 'keep generated docs out of the index', 'our documentation keeps drifting'. NOT for writing a document's body or deciding its content - repo templates and the adr skill own that. NOT for a repo whose docs/okf.yaml declares a profile, which runs its own toolchain and makes this skill halt. NOT for reverse-engineering a codebase into fresh specs."
license: MIT
---

# okf-maintain — Adopt and Maintain an OKF Documentation Bundle

The Open Knowledge Format is a directory of markdown files with YAML frontmatter. That is the whole
format: no schema registry, no central authority, no runtime. Its value is not the frontmatter — it
is that a corpus becomes **enumerable**, so an agent answers "which document covers X" from one
generated index read instead of grepping a tree and guessing from prose.

This skill operates on the **bundle**: structure, frontmatter, indexes, and the entry points routing
agents into it. It never writes a document's body — authorship belongs to the repo's own templates,
and to the `adr` skill for decision records. Keeping that line sharp is what makes it safe to run
over documentation it did not write.

Target: **OKF v0.2**. Read `references/frontmatter.md` for the field families and
`references/index-format.md` for the frozen index grammar before writing either.

## Halt first — is this repo already profiled?

Before touching anything, read `docs/okf.yaml` if it exists.

**If it carries a `profile:` key, stop and report it.** A profile means the repo runs its own
dialect and generator, usually behind a commit gate comparing the committed `index.md`
byte-for-byte against that generator's output. Regenerating in v0.2 grammar produces different
bytes, so **every subsequent commit in that repo is denied**. This skill's output does not break the
corpus; it breaks the repo's own gate — silently, and at someone else's next commit, which is why
the script enforces it too: every subcommand exits `3` and writes nothing.

Name the profile and say its toolchain owns the bundle. Do not offer to convert the corpus; a
profile migration has consequences past documentation. A repo with no `docs/okf.yaml`, or one
without a `profile:` key, is in scope. Full argument: `references/adoption.md`.

## What this skill owns

| Owns | Delegates |
|---|---|
| Bundle layout and the chained root indexes | A concept document's body and its claims |
| Frontmatter presence, shape, and repair | What `type` a new kind of document should be |
| Index generation, everywhere, bottom-up | Requirement text, acceptance criteria, ADR decisions |
| Which paths are in scope (`.okfignore`) | Anything another tool generates or owns |
| Removing `log.md` and in-document history | The repo's existing document templates |
| Agent-entry wiring in `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` | Navigation and lookup at read time |
| §11 conformance verdicts | Any profile-specific dialect |

## Frontmatter — one required key, and it is `type`

OKF v0.2 §11 requires exactly one thing of a concept document: a parseable YAML frontmatter block
containing a non-empty `type`. A document carrying only `type` is fully conformant.

```yaml
---
type: Playbook
title: "Incident response: data freshness alert"
description: Steps to triage a freshness alert on the orders pipeline.
tags: [oncall, incident]
---
```

`type` is a free string — no central registry — so pick self-explanatory values and reuse them
consistently, because **`type` is what the index groups by**. Near-synonyms (`Runbook` and
`Playbook`) fracture one section into two.

`title` and `description` are optional to the spec but load-bearing here: they are the two fields
the index projects. A document with no `description` contributes a bare link and answers nothing
before it is opened. Derive it from the document's own opening sentence — never invent a summary of
content you have not read.

Stamp the optional families only when there is a real fact to record — `generated`, `verified`,
`status` (`draft`/`stable`/`deprecated`, absent means `stable`). Field families, the actor
convention, and why a date-only `stale_after` is ignored: `references/frontmatter.md`.

## Indexes are generated — never hand-written

Every directory containing markdown gets an `index.md` listing what is in it — unless `.okfignore`
excludes it (below). Generate them with the bundled script, always:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs index <bundle-root>
```

**Pass the repo root as the bundle root.** It walks deepest-first, so a subdirectory's description
exists by the time its parent is written, and it is idempotent. Hand-rendering is the most reliable
way to introduce drift — sort order, separator and trailing newline vary between one writing and the
next, and nothing fails when they do. A stale-looking index is a regeneration task, never a reason
to grep the folder.

A `description` over **160 characters** is **dropped** rather than truncated, leaving the bare link
an absent one would leave, and named on stderr as `long-description: <path>`. A machine-cut
half-sentence would be a summary no author wrote, planted in the field consumers trust most.

The script cannot summarise a **subdirectory**, so it reports `needs-description: <path>`. Read
enough of it to write one honest line and supply it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs index docs --describe requirements="Functional and non-functional requirements."
```

It then persists by round-tripping through the generated index, so it is written once. A directory
holding exactly one described document inherits that description and is not reported.

## `.okfignore` — the paths this skill does not own

A real bundle root holds paths another tool owns: delivery logs, generated projections, vendored
docs. List them at the bundle root — one path per line, trailing `/` for a directory, `#` to comment.

```
docs/plans/
docs/TRACEABILITY.md
```

A listed path is **not enumerated, not checked, and never stamped** — three consequences of the one
fact that it is not yours. Matching is exact, with no globs, so a blank line matches nothing rather
than everything.

Exclusion fails *green*, so it is reported: every skip as `ignored: <path> (.okfignore:N)`, every
line matching nothing as `unused-ignore:`, and a line broad enough to empty the corpus drops both
commands to `77` instead of a quiet success.

Prefer fixing the owner. A generated file whose generator stamps `type` needs no line here — it is
an ordinary concept document with a real description, which is where an important one belongs.
`.okfignore` is for what you cannot make conformant.

## History belongs to git, not to markdown

**Never create `log.md` (§9), and `git rm` any that exist. Strip `## History`, `## Changelog`,
`## Revision history`, version tables, and `Last updated:` lines from concept bodies.**

One reason covers both: each is a hand-maintained copy of what git already stores, they disagree the
first time someone commits without updating them, and **nothing fails when they do** — so the drift
is found by a reader who trusted the wrong one. Deleting loses nothing; the content is in history.
The spec's answer to "when" is `generated.at` and `verified[].at` (§5.2): point-in-time facts, not
an accumulating record. This is the one place the skill is more opinionated than the spec — say so,
and point at `git log --follow`.

## Wire the agent-entry files

An index nobody is told to read saves nothing.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs wire <bundle-root>
```

That writes a marker-delimited block into `CLAUDE.md` and `AGENTS.md`, creating either if absent and
leaving existing content alone:

```markdown
<!-- okf:entry -->
## Documentation

Start at [index.md](index.md). Every documentation folder carries a generated `index.md` listing
each document's title and one-line description — answer "which doc covers X" and "does a doc for Y
exist" from that index in one read, and open a document only after the index names it. Do not grep
`docs/` for a document's identity; grep stays correct only for a literal phrase inside a body that
the index cannot carry.
<!-- /okf:entry -->
```

The markers make the block **idempotently updatable**: a later run replaces what lies between them
rather than appending a second copy. `GEMINI.md` uses import lines, so it gets `@index.md` instead.
`wire` exits `1` until an `index.md` exists — pointing agents at a missing file is worse than not
pointing them anywhere.

It writes those files **into the bundle root**, so the bundle root must be the repo root: `wire
docs` produces a `docs/CLAUDE.md` nothing reads. Chained roots are the design — `./index.md` is the
address you give agents, and it links `docs/` onward.

Keep the block's second half. Without the stated grep exception the rule reads as overreach and is
ignored wholesale, costing more index reads than it buys.

## Workflow — adopting OKF in a repo

1. **Halt check.** Read `docs/okf.yaml`. Profile key present → report and stop.
2. **Survey.** List the markdown present and how it is grouped. Do not restructure directories that
   already make sense; OKF is agnostic about layout. Put anything another tool writes into
   `.okfignore` now, before it produces violations you would try to fix by hand.
3. **Triage.** `node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs check .` *before* writing anything. It prints one `note:` per
   `description` the index will refuse — **that is the worklist**, shorten each to a sentence. A
   corpus that already has frontmatter needs this, not a pass that overwrites it.
4. **Frontmatter pass.** For documents with none, add `type`, `title`, and a `description` drawn
   from the document's own opening. Read each file — one invented from a filename is a fabricated
   claim in a machine-readable field.
5. **History pass.** `git rm` any `log.md`; strip history sections and `Last updated:` lines.
6. **Generate.** `okf.mjs index` at the repo root, so `./index.md`, `docs/index.md` and every folder
   index are written as one chain. Supply `--describe` for each reported directory.
7. **Wire.** `node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs wire .`
8. **Verify.** `node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs check .` must exit 0.
9. **Report** what was created, what was deleted, every `.okfignore` line and why, and any
   `description` you could not derive without guessing — leave it blank and say so.

Step 3 may follow step 6 instead. An index of titles and links with few descriptions is a **correct
intermediate state**: every title still routes, where an index of paragraphs outgrows the documents
it enumerates and sends readers back to grepping.

## Workflow — maintaining an existing bundle

Run after any change to the corpus: a document added, renamed, retyped, or re-described.

1. Halt check, as above.
2. `check .` — fix what it names; act on `unused-ignore:`, which means a declared path moved or
   was deleted and the line now protects nothing.
3. `index .` — regenerate, and commit it *with* the content change, never as a follow-up commit
   someone forgets.
4. `wire .` — a no-op unless the block's wording changed, and safe to run every time for that
   reason.

Delete a removed document's file and regenerate; leave no tombstone entry. A superseded one gets
`status: deprecated` and stays — §5.4 exists so links do not break.

## Conformance

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs check <bundle-root>
```

It checks §11 and nothing stricter: parseable frontmatter, non-empty `type`, reserved filenames used
only for their reserved purpose. It does **not** fail a bundle for missing optional fields, unknown
`type` values, extra keys, broken links, missing indexes, or an over-long `description` — the spec
forbids rejecting on those, and a check that invents its own strictness trains people to ignore it.
Over-long descriptions come back as `note:` lines: the repair worklist.

Exit codes: `0` conformant, `1` violations named, `3` profiled repo, `77` nothing was evaluated,
`64` usage error.

**Treat `77` as a failure to verify, never as a pass.** The scan found no concept document at all —
a wrong path, an empty tree, or an `.okfignore` broader than intended. A clean bill issued over zero
files is the most convincing wrong answer a checker can give.

Frontmatter is parsed by a bundled reader — no YAML library, so the verdict is identical on every
machine. It **fails closed**: an unterminated quote, flow sequence or flow mapping, a duplicate key,
or nested content it cannot parse is a violation, because silent tolerance is how a corpus rots
behind a green light. Block scalars (`>`, `|`) are folded into their text — the danger in a
hand-rolled reader is never the syntax it rejects, which is loud, but the syntax it misreads.

## Anti-patterns

- **Hand-editing a generated `index.md`.** The next regeneration silently discards it. Change the
  source frontmatter instead.
- **Inventing a `description`** to fill a column. An empty one is a visible gap; a fabricated one is
  a false claim in the field consumers trust most.
- **Adding a `## Changelog` back** because a reviewer asked. Point at `git log --follow`.
- **Treating a `77` from `check` as green**, or a profiled repo as convertible. Both fail elsewhere,
  later, and quietly.
- **Stamping frontmatter into a file a generator rewrites.** It is erased on that tool's next run
  and nothing reports it. Fix the generator, or declare the path in `.okfignore`.
- **Reaching for `.okfignore` to silence a violation.** It declares who owns a path, not which
  complaints you would rather not see. A document you own with no `type` is a document to fix.
