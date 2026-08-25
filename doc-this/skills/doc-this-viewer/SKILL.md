---
name: doc-this-viewer
description: "Open a local viewer to browse doc-this output in a browser — navigate units (requirements/design/tasks), the external-surface catalog, C4/ERD/flowchart diagrams, coverage, and open gaps from the rich .doc-this-sdd/ staging tree, plus promoted SDLC docs (FR-NNN requirements, ADRs, TRACEABILITY, .feature specs) when present. Runs a co-located launch.mjs that builds a manifest and starts a localhost-only static server for a prebuilt Svelte app, then opens the browser; stop it with launch.mjs --stop. Triggers: 'view doc-this docs', 'open the documentation viewer', 'browse doc-this output', 'serve the docs', 'open .doc-this-sdd in a browser', '/doc-this-viewer'. NOT for generating docs — that's /doc-this. NOT for staging specs into docs/ — that's /doc-this-promote. NOT for UI screenshot extraction — that's doc-this-visor."
license: MIT
---

# Doc-This-Viewer — Browse Discovery Output in the Browser

You are the **Viewer launcher**. Mission: serve a fast, navigable web UI over a doc-this
output folder so a human can read the specs without opening dozens of raw files. You do
**not** generate, judge, or modify documentation — you only start a local viewer over what
already exists.

This is a **user-triggered** skill (like `/doc-this-tracer` / `/doc-this-visor`). It is
**not** a pipeline worker — it runs against already-generated output and needs no live
pipeline state. It shows the rich `.doc-this-sdd/` staging tree (units, the interactive
Surface Catalog, diagrams, coverage, gaps) and the promoted `docs/` tree (FR-NNN, ADRs,
TRACEABILITY, `.feature`) when present, with a source switcher when both exist.

## Procedure

1. **Confirm there is output to view.** Read `.doc-this/state.json` → `output_folder`
   (default `.doc-this-sdd`). If `state.json` is absent, check for a top-level
   `.doc-this-sdd/` or `docs/`. If **none** exist, tell the user doc-this has not run here
   and stop — point them at `/doc-this`. This skill never generates docs.

2. **Launch the viewer** by running the bundled launcher via the Bash tool. Do **not**
   assemble a static-server command yourself — the script owns the port, the
   `127.0.0.1` bind, the manifest build, and the browser open:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/skills/doc-this-viewer/scripts/launch.mjs"
   ```

   Run it from the project root (the directory containing `.doc-this/` / `.doc-this-sdd/`).
   Pass an explicit root as the first argument only if you are not already in it:
   `launch.mjs /path/to/project`.

3. **Report the URL.** The launcher prints one line, `VIEWER_URL=http://127.0.0.1:<port>/...`.
   Relay that URL to the user verbatim so they can open it (it also auto-opens the browser).

4. **Tell the user how to stop it.** The server runs in the background with a pidfile.
   To stop it:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/skills/doc-this-viewer/scripts/launch.mjs" --stop
   ```

   Never `pkill node` — `--stop` reads `.doc-this/viewer/serve.pid` and kills only this server.

## Refreshing after a new doc-this run

Re-running the doc-this pipeline changes the files on disk; the manifest is rebuilt every
time `launch.mjs` starts, and the server sends `Cache-Control: no-store`. So after a new run,
either refresh the browser (if the server is still up) or re-run `launch.mjs`.

## Safety

Strictly read-only against the user's project: writes only under `.doc-this/viewer/`, binds
`127.0.0.1` only, runs no git / IaC / kubectl / deploy commands — safe to run inside a client
repository. Needs no `npm install` (the compiled app ships in `assets/dist/`).

Editing or rebuilding the viewer itself: see `references/maintaining.md`.
