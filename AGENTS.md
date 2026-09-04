# AI Coding Agent Instructions

This project uses `CLAUDE.md` as the single source of truth for all AI coding instructions —
project structure, plugin conventions, commands, and the reasoning behind the pipeline design.

**No `docs/` tree:** this repo carries no requirement/ADR corpus, so there is no generated doc index
to consult here — read `CLAUDE.md` for structure and the per-skill `SKILL.md` for behavior.

<!-- Auto-maintained by Claude Code -->

<!-- okf:entry -->
## Documentation

Start at [index.md](index.md). Every documentation folder carries a generated `index.md` listing
each document's title and one-line description — answer "which doc covers X" and "does a doc for Y
exist" from that index in one read, and open a document only after the index names it. Do not grep
`docs/` for a document's identity; grep stays correct only for a literal phrase inside a body that
the index cannot carry.
<!-- /okf:entry -->

# Agent Rules <!-- tessl-managed -->

@.tessl/RULES.md follow the [instructions](.tessl/RULES.md)
