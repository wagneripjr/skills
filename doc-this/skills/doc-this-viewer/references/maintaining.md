# Maintaining doc-this-viewer

Not part of the user flow — for whoever edits this skill.

## Architecture (three pieces)

- **`app/`** — Svelte 5 + Vite source. Compiled output is committed to `assets/dist/` so
  the **runtime needs no `npm install`**; `launch.mjs` only copies that prebuilt bundle.
- **`scripts/build-manifest.mjs`** — zero-dep Node. Walks the doc-this output tree(s) and
  emits `.doc-this/viewer/viewer-manifest.json` (the single contract the SPA fetches).
  Contract: `references/manifest-schema.md`. Deterministic — no wall-clock fields.
- **`scripts/serve.mjs` + `launch.mjs`** — `serve.mjs` is the localhost-only static server
  (free port, `127.0.0.1` bind, `Cache-Control: no-store`); `launch.mjs` is the frozen
  launcher (build manifest → copy dist → start server detached → print `VIEWER_URL=` →
  open browser; `--stop` reads the pidfile).

## Why a localhost server (not a single `file://` HTML)

Chrome blocks `fetch()` over `file://`. Serving over `http://127.0.0.1` rooted at the
project makes the SPA (at `/.doc-this/viewer/index.html`) fetch the output trees by
absolute same-origin paths (`/.doc-this-sdd/...`, `/docs/...`). Lazy-loading also scales to
large runs (Total Source Coverage can be thousands of files).

## Libraries

- `marked` — bundled into the SPA (offline markdown rendering).
- Mermaid — loaded lazily from CDN via `<script>`; degrades to a styled `<pre>` of the
  diagram source when offline. Kept out of the committed bundle to stay small.

## Diagram interaction (zoom / pan / new tab)

Mermaid diagrams render fit-to-width inline; each gets a hover toolbar (`🔍` open zoom,
`↗` open the raw SVG in a new browser tab) and is click-to-zoom. Pieces:

- **`app/src/lib/mermaid.js`** — after `mermaid.render()`, wraps the SVG in a
  `<figure class="mermaid-diagram">` with the inline toolbar and wires click → `openDiagram()`.
- **`app/src/lib/lightbox.svelte.js`** — shared rune state (`.svelte.js` extension is
  **mandatory**; `$state` in a plain `.js` white-screens at runtime). `openDiagram(svg)` /
  `closeDiagram()`; `mermaid.js` calls them imperatively, the overlay reads them reactively.
- **`app/src/lib/panzoom.js`** — dependency-free pan/zoom controller (`createPanZoom`:
  wheel zoom-toward-cursor, drag pan, `zoomIn/zoomOut/fit`) plus `openSvgInNewTab()`
  (serialize → `image/svg+xml` Blob → `window.open`).
- **`app/src/components/DiagramLightbox.svelte`** — fullscreen overlay mounted once in
  `App.svelte`; `{@attach}` wires `createPanZoom` to the SVG on open and tears it down on close.

Out of scope: re-theming already-rendered diagrams on the light/dark toggle (Mermaid reads
its theme once at CDN load). The overlay chrome is theme-correct; diagram colors are not
re-rendered on toggle.

## Editing the Svelte app

After changing anything under `app/`:

```bash
bash scripts/build.mjs          # npm ci + vite build → refresh assets/dist/
```

Then commit the refreshed `assets/dist/`. Validate Svelte components with the Svelte MCP
autofixer; `{@html}` in `MarkdownPane.svelte` is an intentional, documented exception
(trusted local content, loopback-only).

## Testing

```bash
node scripts/test-build-manifest.mjs
```

Unit tests cover the manifest builder (nav groups, confidence counts, surface catalog,
coverage, idempotency, output_folder honoring, legacy-no-coverage). Server smoke tests
start `launch.mjs` and assert `200` (skipped if `assets/dist/` or `curl` is missing).
