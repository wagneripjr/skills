# Security Policy

## Scope

This repository ships two Claude Code plugins: `wagner-skills` and `doc-this`. They are
Markdown skill definitions plus zero-dependency Node hooks and scripts that run
**locally, inside your own Claude Code session**. There is no hosted service and no
telemetry.

Worth knowing before you install:

- Hooks in `doc-this/hooks/` run on `Skill`, `Edit`, `Write`, and `LSP` tool calls while the
  plugin is enabled. They read your project files and write log lines to
  `~/.claude/logs/doc-this-gates.log`. They are deny-only gates — they never send anything
  off your machine.
- `doc-this-viewer` starts a static HTTP server bound to `127.0.0.1` only. The page it serves
  loads Mermaid and its ELK layout plugin from `cdn.jsdelivr.net` when you open a document
  containing a diagram — your browser fetches those two scripts, nothing of yours is sent. Diagrams
  degrade to a code block if the fetch fails, so the viewer works offline.
- `doc-this-reviewer`'s optional cross-review step invokes the `agy` (Antigravity) CLI, which
  sends the generated specs to a third-party model. It is opt-in, skips cleanly when `agy` is
  not installed, and is never required — but treat it as egress when you do enable it.

## Contributor tooling

The above covers the plugins as installed. One *development* command in this repository also
leaves your machine, and it is opt-in:

- `npx tessl skill review` — used by `tests/test-tessl-quality-gate.mjs` and documented in the
  README — uploads the reviewed skill to tessl's hosted grading service. It is never run by the
  plugins, never run automatically, and is not required to contribute. Do not point it at a skill
  containing confidential material.

## Reporting a vulnerability

Email **wagneripjr@adustio.com.br** with a description and reproduction steps. Please do not
open a public issue for anything exploitable. Expect an acknowledgement within a few days.

## Supported versions

Only the latest published version is supported. Version is tracked in
`.claude-plugin/plugin.json` and `doc-this/.claude-plugin/plugin.json`.
