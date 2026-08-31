---
name: okf-maintain
description: "Use when adopting the Open Knowledge Format (OKF v0.2) in a repository, or maintaining a documentation bundle already in it: bootstraps a conformant tree, stamps and repairs YAML frontmatter, regenerates every index.md bottom-up so no document goes unlisted, excludes paths another tool owns via .okfignore, removes log.md and strips changelog/history sections because git already holds history losslessly, and wires CLAUDE.md/AGENTS.md/GEMINI.md to the root index so agents stop grepping for a document's identity. Ships a conformance check that fails closed, plus a coverage check that names every document no index reaches. Triggers on: 'set up OKF', 'make these docs OKF-conformant', 'regenerate the docs index', 'add frontmatter to the docs', 'which docs are missing from the index', 'our documentation keeps drifting'. NOT for writing a document's body or deciding its content - repo templates and the adr skill own that. NOT for reverse-engineering a codebase into fresh specs."
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

## A declared profile is reported, not obeyed

`docs/okf.yaml` is not part of OKF v0.2 — it is a convention some toolchains use to declare a
dialect, and a `profile:` key in it names **which documents must carry which keys**. Read it if it
exists and say what it declares, because it changes how a conformance verdict should be read.

It does not change what gets indexed, and this skill no longer refuses a repository for carrying
one. The refusal it replaces rested on two claims nothing ever checked: that a profile ships its own
index generator, and that a commit gate somewhere compares the index byte-for-byte and would reject
v0.2 output. Where those hold, they are worth respecting — so check them rather than assume them: is
there a generator, and is a gate actually armed? Where they do not hold, refusing means the
repositories most likely to want an index are the ones guaranteed not to have one, and a guard whose
condition nothing can satisfy is a defect wearing a guard's clothes.

If a repository really does regenerate its index from another tool, that path belongs in
`.okfignore`, which is the mechanism for "another tool owns this" and states it per path instead of
per repository. Full argument: `references/adoption.md`.

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

Every directory containing markdown gets an `index.md`, up to and including the repo root, listing
**every** markdown file in it — unless `.okfignore` excludes it, or it is plugin payload (both
below). A document is listed
because it exists, not because its folder was registered anywhere: a reader hunting for the
contributing guide or a stray plan cannot know the corpus filed it as furniture, and an index that
confidently omits it sends them back to `ls`.

Listing costs the document nothing. The row's title degrades — frontmatter `title`, then the first
body heading, then the filename stem — so a file with no frontmatter is listed exactly as well as
one with, and being listed never obliges it to carry keys. What must carry keys is a separate
question, answered by `check` and unchanged.

Generate them with the bundled script, always:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs index <bundle-root>
```

**Pass the repo root as the bundle root.** It walks deepest-first, so a subdirectory's description
exists by the time its parent is written, and it is idempotent.

Two things it will not touch, both reported rather than done quietly:

- **Another repository's working tree.** A directory holding a `.git` entry is a submodule or a
  nested clone, and the repo you invoked on only pins it. Writing there edits someone else's
  repository, shows up in a `git status` nobody was looking at, and `coverage` cannot catch it
  because git reports a submodule as a single gitlink. The walk stops at the boundary and says
  `separate-repo: <path>/`. If that tree needs an index, generate it from inside that repository.
- **An `index.md` it did not write.** Every generated index carries the marker in its first
  content line; one without it is hand-maintained, or another tool's output, and its rows may carry
  an id, a status or a shape v0.2 does not project. Overwriting is a silent lossy downgrade of the
  exact catalog the index exists to be. It is left alone and reported as `foreign-index: <path>`.
  Read it, then either delete it to hand this tool the directory, or name it in `.okfignore` to
  leave it with its owner. Hand-rendering is the most reliable
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

## Plugin payload is refused, not configured

At a **Claude Code plugin root** — a directory holding `plugin.json` or `marketplace.json`, either at
the package root or under `.claude-plugin/`, both of which the loader accepts — the `commands/`,
`agents/` and `skills/` children belong to the loader. Every
`.md` under `commands/` *is* a slash command, every `.md` under `agents/` *is* an agent definition,
and a skill folder's entry point is `SKILL.md`, carrying Claude Code's frontmatter schema rather
than OKF's. Writing an `index.md` there puts a document where the loader expects payload; demanding
`type` there asks a `SKILL.md` for keys that are not its schema and makes a progressively-disclosed
reference file pay context for keys nobody reads.

So the walk never descends into one, `check` never scans one, `coverage` never demands one, and each
pruned directory is reported as `plugin-payload: <path>/`. This is refused structurally rather than
left to an `.okfignore` line, for the same reason another repository's work tree is: the line can
only be written after the first run has already done the damage.

The anchor is the **manifest, never the directory name** — a `docs/commands/` folder documenting a
CLI is ordinary knowledge and stays indexed. Delete the manifest and every one of those files is
enumerated again.

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

1. **Manifest check.** Read `docs/okf.yaml` if it exists and report what it declares. A `profile:`
   key scopes required keys; it is not a reason to stop.
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
8. **Verify.** `node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs check .` must exit 0,
   and `okf.mjs coverage .` must exit 0 too. `check` alone cannot tell you a document was never
   walked — it and the index are the same projection.
9. **Report** what was created, what was deleted, every `.okfignore` line and why, and any
   `description` you could not derive without guessing — leave it blank and say so.

Step 3 may follow step 6 instead. An index of titles and links with few descriptions is a **correct
intermediate state**: every title still routes, where an index of paragraphs outgrows the documents
it enumerates and sends readers back to grepping.

## Workflow — maintaining an existing bundle

Run after any change to the corpus: a document added, renamed, retyped, or re-described.

1. `check .` — fix what it names; act on `unused-ignore:`, which means a declared path moved or
   was deleted and the line now protects nothing.
2. `index .` — regenerate, and commit it *with* the content change, never as a follow-up commit
   someone forgets.
3. `coverage .` — the added document is the one most likely to be orphaned, and it is the only
   check that can say so.
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

Exit codes: `0` conformant, `1` violations named, `77` nothing was evaluated, `64` usage error.

**Treat `77` as a failure to verify, never as a pass.** The scan found no concept document at all —
a wrong path, an empty tree, or an `.okfignore` broader than intended. A clean bill issued over zero
files is the most convincing wrong answer a checker can give.

Frontmatter is parsed by a bundled reader — no YAML library, so the verdict is identical on every
machine. It **fails closed**: an unterminated quote, flow sequence or flow mapping, a duplicate key,
or nested content it cannot parse is a violation, because silent tolerance is how a corpus rots
behind a green light. Block scalars (`>`, `|`) are folded into their text — the danger in a
hand-rolled reader is never the syntax it rejects, which is loud, but the syntax it misreads.

## Coverage — the check `check` cannot perform

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs coverage <bundle-root>
```

`check` and "regenerate, then diff against the committed index" both read the corpus through the
same walk. A document that walk never reaches is therefore missing from the committed index *and*
from the regenerated one, the two agree perfectly, and the run is green. A projection compared
against itself cannot report a missing input — not because the comparison is sloppy, but because
the missing input is absent from both sides by construction.

`coverage` gets a second, independent enumerator: `git ls-files --cached --others
--exclude-standard`, resolved from the repository root. Every markdown file it lists that no
`index.md` links to is named:

```
unindexed: .github/CONTRIBUTING.md
okf.mjs: 113 tracked document(s) in 44 index file(s), 1 reachable only by ls
```

**Those three flags are the contract, not defaults.** Plain `git ls-files` reads the *index*, so a
document written but not yet staged is invisible to it — and that is exactly the document at risk,
the one being added right now. A check blind to it passes, the commit lands with no row, and the
next commit belatedly adds the previous document's row with nobody the wiser. `--others` covers the
working tree; `--exclude-standard` keeps the repo's own ignore rules authoritative so build output
stays out. Indexes are likewise read from disk, so running straight after `index` and before `git
add` tells you the truth about what you are about to commit.

Exit `0` when nothing is orphaned, `1` naming each orphan, `77` outside a git work tree — which is a
refusal to verify, never a pass.

Two ways to clear a finding, and the choice is the whole point: index the document, or declare in
`.okfignore` that something else owns it. There is no third option where it stays invisible, which
is what the old behaviour amounted to.

**Dot-directories are the one place `index` will not go**, and coverage says so when a finding lands
there. The walk skips them because they hold tooling — descending reaches `.git`, `.venv`, and every
editor's cache — so no amount of regenerating produces an index inside one. That leaves two honest
answers and one trap. Move the document out of the dot-directory if it is real documentation; name
the path in `.okfignore` if it is machine output. Do **not** hand-write the missing `index.md`: it is
outside the walk, so nothing regenerates it, and it rots unseen — which is the exact failure this
command exists to surface, reappearing at the one place the tool declines to reach.

## Anti-patterns

- **Hand-editing a generated `index.md`.** The next regeneration silently discards it. Change the
  source frontmatter instead.
- **Deleting a `foreign-index:` file to make the report go away.** That is the one action that
  destroys what the report was protecting. Read the file first: if its rows carry an id or a status,
  the directory belongs to whatever produces them, and the answer is an `.okfignore` line.
- **Inventing a `description`** to fill a column. An empty one is a visible gap; a fabricated one is
  a false claim in the field consumers trust most.
- **Adding a `## Changelog` back** because a reviewer asked. Point at `git log --follow`.
- **Treating a `77` from `check` or `coverage` as green.** Both mean nothing was evaluated, and a
  clean bill issued over zero files is the most convincing wrong answer a checker can give.
- **Reading a green `check` as "everything is indexed".** It cannot mean that: it walks the same
  tree the index came from. Only `coverage` compares against a list the walk did not produce.
- **Stamping frontmatter into a file a generator rewrites.** It is erased on that tool's next run
  and nothing reports it. Fix the generator, or declare the path in `.okfignore`.
- **Reaching for `.okfignore` to silence a violation.** It declares who owns a path, not which
  complaints you would rather not see. A document you own with no `type` is a document to fix.
