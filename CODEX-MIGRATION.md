---
type: Note
title: Codex configuration migration handoff
description: Replace copied public skills and hook routes with native plugins while preserving private configuration.
---

# Codex configuration migration handoff

This handoff is for a separate session in `claude-code-config`. No files in that repository were
changed. The inspected source was `scripts/configure-codex.mjs`; references to its adapter below
describe the routes it installs, not an audit of that adapter's implementation.

## Result owned by this repository

The nine public plugins have native Claude Code and Codex manifests and marketplaces. Both hosts
share the canonical skill instructions and gate evaluators. Codex-specific code handles native
worker dispatch, continuation identity, and multi-file patches. Installation does not require
Tessl, personal global instructions, or generated public skill copies.

Codex exposes the eight standalone skills plus `doc-this`, `doc-this-help`, `doc-this-promote`, and
`doc-this-viewer`. The other ten doc-this skills ship as worker instructions and are not entry
points. Skill directory names remain the same; native Codex selectors are namespaced:
`$doc-this:doc-this`, `$doc-this:doc-this-help`, `$doc-this:doc-this-promote`,
`$doc-this:doc-this-viewer`, and `$<plugin>:<skill>` for the standalone plugins. Update any
configuration instructions that still advertise loose-skill selectors such as `$doc-this`.

## Changes to make in the configuration repository

1. Replace the public-plugin portion of `renderManagedTree` with native marketplace installation:

   ```bash
   codex plugin marketplace add wagneripjr/skills --ref master
   codex plugin add <name>@wagner-skills-marketplace
   ```

   Apply to `agent-cli`, `airflow-dags`, `doc-this`, `human-cli`, `okf-maintain`,
   `platform-sre-kubernetes`, `postmortem`, `prototype-spike`, and `requirements-elicitation`.
   Refresh with `codex plugin marketplace upgrade wagner-skills-marketplace`, followed by
   `codex plugin add <name>@wagner-skills-marketplace` for installed entries.

2. Remove the public-plugin markdown adaptation step, doc-this `UPSTREAM.md` replacement and
   generated wrapper, public model-name rewrites, prototype host-note injection, and managed
   copies of these nine plugins. Keep any adaptations needed by private plugins.

3. Remove only the twelve public skill links owned by this configurator. Verify each link target
   belongs to its managed public-plugin tree before removal. Preserve a real directory or
   unrelated link at the same path and report the conflict. Do not remove the entire managed
   tree: it also contains private skills.

4. Retire the global adapter's doc-this and OKF routes once native hooks are installed and enabled.
   Inspect that adapter in the separate session and remove only those public routes. Preserve
   private/global hooks, rules, custom agents, MCP servers, credentials, and their configuration.
   Do not leave both public routes active: duplicate post-edit hooks and different worker
   identity conventions can produce inconsistent enforcement.

5. Replace public-source checkout/copy updates with marketplace refreshes. Retain source-fetching
   code only where another owned responsibility still uses it. Preserve the configurator's
   backup, ownership, and idempotence guarantees.

## Migration verification

- Install the native plugins and verify their files before removing owned copies. Remove duplicate
  links/routes before starting a discovery session, then restart Codex and review `/hooks`.
- Confirm exactly twelve public entry points, with no duplicate bare skills and no discoverable
  workers. The generated `UPSTREAM.md` wrapper must no longer supply the active instructions.
- Verify an unanchored core-worker dispatch is denied, an allowed dispatch succeeds, and later
  worker messages are still gated. Confirm interrupted work resumes through the parent without
  workers writing pipeline state or marking incomplete work complete.
- Verify a patch with a forbidden second staging file is denied as a whole, ordinary source edits
  remain allowed, and an OKF document edit regenerates the edited repository's index.
- Run setup twice: the second run must not duplicate marketplace registrations, skills, or hooks.
  Check private skills, MCP access, and unrelated hooks after migration.

For rollback, remove the new native public plugins and restore only the backed-up public links and
routes. Restart Codex; never run both installations during the rollback check.

## Tessl boundary

Tessl MCP was available and authenticated during investigation. Four isolated CLI probes against
0.109.0 confirmed that generic hooks translate blocking output while preserving native patch,
worker-dispatch, and worker-result payloads unchanged. `nativeHooks` can manage host-specific
registration, but still needs the same adapters. Native installations therefore have no Tessl
runtime dependency. Existing Tessl publication and quality review remain optional workflows.

References: [Tessl hooks](https://docs.tessl.io/reference/configuration.md#hooks),
[Codex hooks](https://learn.chatgpt.com/docs/hooks), and
[Codex plugins](https://developers.openai.com/plugins/build/plugins).
