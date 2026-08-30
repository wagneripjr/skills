# Index format — the frozen grammar

An `index.md` enumerates a directory's contents so a human or an agent can see what exists before
opening anything. That is **progressive disclosure**, and it is the entire reason a corpus is worth
formatting: one read answers "which document covers X", "does one for Y exist", and "what is this
folder", without a grep and without a guess.

Generate these with `${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs index`. This document exists so you can review the output and
recognise a hand-edit, not so you can render one by hand.

## The grammar

```markdown
# Playbook

* [Incident response: data freshness alert](incident-response.md) - Steps to triage a freshness alert on the orders pipeline.
* [Rotating the signing key](key-rotation.md) - Quarterly rotation procedure for the release signing key.

# Reference

* [Event schema](event-schema.md) - Field-by-field description of the analytics event payload.

# Subdirectories

* [requirements](requirements/index.md) - Functional and non-functional requirements.
```

Rules, all mechanical:

1. **No frontmatter** on an index, with exactly one exception: the bundle-root `index.md` may carry
   `okf_version: "0.2"` (§12). No other index carries any.
2. One `# <Type>` heading per distinct `type` among the directory's own documents, headings sorted
   alphabetically. A document with no `type` groups under `# Other`.
3. Entries within a section sorted by title, case-insensitively.
4. Entry form is `* [<title>](<link>) - <description>`. Title degrades: frontmatter `title`, then
   the first `# ` heading in the body (ignoring fenced blocks, where a `#` is a shell comment), then
   the filename stem. When `description` is absent the entry is `* [<title>](<link>)` with **no
   trailing separator** — an empty description is a visible gap, not a dangling dash.
5. A `description` is collapsed to one line, and one longer than **160 characters is dropped**,
   rendering the same bare `* [<title>](<link>)` as an absent one. The script never truncates: a
   machine-cut half-sentence is a summary no author wrote, sitting in the field consumers trust
   most. A dropped one is named on stderr so the frontmatter gets shortened rather than silently
   losing its entry — `long-description: docs/requirements/FR-001.md (342 chars, max 160)`.
6. Subdirectories are collected under a single `# Subdirectories` heading, sorted, linking
   `<dir>/index.md`.
7. Sections separated by one blank line; the file ends with exactly one trailing newline.
8. `index.md` and `log.md` are reserved (§3.1) and never appear as entries.
9. **Every other markdown file appears**, readme and contributing guide included. A document is
   listed because it exists, not because its folder or kind was registered somewhere. Rule 4 is what
   makes this free: the row degrades all the way to a filename, so listing never obliges a file to
   carry frontmatter. Which documents must carry required keys is a separate question, and `check`
   still answers it the same way.

The separator between link and description is ` - ` (space hyphen space). It is a small thing that
varies every time a human writes one, which is why a script writes them.

## Chained roots

Every directory containing markdown gets an index — except those `.okfignore` declares unowned — and
the walk is **deepest-first** so a subdirectory's description exists by the time its parent is
written:

```
repo/
  index.md              <- entry point; links docs/ and any root-level concepts
  docs/
    index.md            <- links each concept folder
    requirements/
      index.md          <- links the requirement documents
    adr/
      index.md
```

This is not a special case bolted on for repositories. It is the general recursion: index every
directory that holds markdown, and the chain falls out. A repo whose documentation lives only in
`docs/` gets two roots; one with markdown at top level gets a root index that carries both its own
concepts and a `# Subdirectories` section.

`./index.md` is the address you give agents (see `adoption.md`). Keeping it generated rather than
hand-written is what makes it safe to point everything at.

## What the script does, and what you must do

The split is not arbitrary — it follows what can be derived from the corpus and what cannot.

| Derived — the script | Judged — you |
|---|---|
| Walking directories, deepest-first | Writing a subdirectory's one-line description |
| Reading `type` / `title` / `description` | Fixing an inconsistent `type` across documents |
| Grouping, sorting, rendering, trailing newline | Deciding a document's `description` when it has none |
| Preserving a subdirectory description already in the index | Confirming a description still matches the folder |
| Folding a `>` or `|` block scalar into its text | Shortening a `description` the index refused to carry |
| Skipping what `.okfignore` names, and reporting it | Deciding which paths another tool owns |

Every row on the right is a judgement the corpus does not state. Ownership is the newest of them:
nothing in a markdown file says whether a generator rewrites it, so the walk cannot infer it and
will happily demand frontmatter of a file that is about to be overwritten.

A **directory** has no frontmatter, so nothing in the corpus states what it is for. Upstream's own
reference implementation calls a language model to synthesize that line. Here you are that step.

The script reports the gap and continues:

```
needs-description: docs/requirements
```

Read enough of the directory to write one honest line, then supply it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs index . --describe docs/requirements="Functional and non-functional requirements."
```

Two shortcuts avoid asking you unnecessarily:

- **Round-trip.** On the next run the script parses the description back out of the index it wrote
  and reuses it. You supply each one once. This is why indexes have no sidecar file: the generated
  index *is* the store, and §8 forbids frontmatter that could hold it instead.
- **Single-child inheritance.** A directory holding exactly one document that has a description
  inherits it, since restating it would add nothing.

If you delete an `index.md`, its subdirectory descriptions go with it and will be asked for again.
That is the cost of having no sidecar, and it is cheap.

## Reading an index — the discipline it buys

| Question | Answered from the index alone |
|---|---|
| Which document covers X | Scan descriptions, follow the link |
| Does a document for Y exist | Its presence or absence *is* the answer |
| What kinds of document are here | The `# <Type>` headings |

Open a document only once the index has named it. The index routes; the document is the
destination reached through it.

**The one legitimate grep**: a literal phrase or token inside a body — something the index
structurally cannot carry. An identity, existence, or description lookup is not that case. Being
honest about this exception is what keeps people using the index for everything else.

## Completeness is not staleness

Regenerating fixes a **stale** index. It cannot fix an **incomplete** one, and the difference is
worth holding onto: staleness is a row that disagrees with its document, incompleteness is a
document with no row anywhere. Regenerate-and-diff catches the first and is blind to the second,
because both copies come from the same walk — the document the walk never reached is missing from
each of them, and they match.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs coverage .
```

That runs `git ls-files --cached --others --exclude-standard` from the repository root and names
every markdown file no index links to. The enumerator has to come from outside the tool for the
comparison to mean anything, and `git` is the one at hand that is complete, honours ignore rules,
and costs nothing.

`--others` is not optional garnish. Without it the enumeration is the git *index*, which does not
yet contain the document you are adding — so the check would go green on precisely the commit that
introduces an unindexed document, and the omission would surface one commit later as a mystery.

## Staleness

A stale-looking index is a regeneration task, never a reason to bypass it and grep the folder. It
is a projection of frontmatter: regenerate, then re-read.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/okf-maintain/scripts/okf.mjs index . --stdout   # render without writing, to diff against the committed file
```

Commit a regenerated index **in the same commit as the content change that caused it**. Split into
a follow-up commit, it becomes the thing someone forgets, and a corpus with a stale index is worse
than one with no index — it answers confidently and wrongly.
