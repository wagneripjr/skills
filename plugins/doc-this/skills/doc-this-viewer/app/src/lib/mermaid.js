// Lazy-load Mermaid (ESM) from a CDN only when a diagram is on screen. Kept out of the
// committed bundle to stay small. The ELK layout engine is registered best-effort for far
// less node overlap on flowcharts/state diagrams; if it fails we still render with dagre +
// spacing config. If Mermaid itself is unreachable (offline), diagrams degrade to readable
// <pre> source — never a broken page.

import { openDiagram } from './lightbox.svelte.js'
import { openSvgInNewTab } from './panzoom.js'

// `/* @vite-ignore */` keeps these as runtime CDN fetches (Vite/Rollup leaves them alone).
const MERMAID_ESM = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
const ELK_ESM = 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs'
let loader = null
let counter = 0

function loadMermaid() {
  if (loader) return loader
  loader = (async () => {
    let mermaid
    try {
      const mod = await import(/* @vite-ignore */ MERMAID_ESM)
      mermaid = mod.default || mod
    } catch (_e) {
      return null // CDN unreachable (offline) — caller degrades to <pre>
    }

    // ELK layout engine — best-effort and independently failable. Registered before
    // initialize; an ELK fetch failure leaves dagre + the spacing config below in charge.
    let elkReady = false
    try {
      const elk = await import(/* @vite-ignore */ ELK_ESM)
      mermaid.registerLayoutLoaders(elk.default || elk)
      elkReady = true
    } catch (_e) {
      /* dagre fallback */
    }

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
        // ELK only affects diagram types that support pluggable layout (flowchart, state).
        // C4 / ER / sequence ignore it harmlessly and fall back to their own renderers.
        ...(elkReady ? { layout: 'elk' } : {}),
        // Spacing levers. useMaxWidth:false makes each svg carry an explicit px size — text
        // renders at native size and the lightbox has no inline max-width to un-clamp on zoom.
        flowchart: { nodeSpacing: 60, rankSpacing: 70, useMaxWidth: false, curve: 'basis' },
        state: { useMaxWidth: false },
        er: { useMaxWidth: false },
        // C4 has no auto-layout (it is statement-order driven); shapes/row + boundaries/row +
        // margins are its only spacing levers. Modest help — the durable win for crowded C4
        // is the now-crisp lightbox zoom/pan, not config.
        c4: {
          useMaxWidth: false,
          c4ShapeInRow: 3,
          c4BoundaryInRow: 1,
          diagramMarginX: 40,
          diagramMarginY: 40,
        },
      })
    } catch (_e) {
      /* initialize is best-effort */
    }
    return mermaid
  })()
  return loader
}

export async function renderMermaidBlocks(container) {
  const blocks = container.querySelectorAll('pre > code.language-mermaid')
  if (!blocks.length) return
  const mermaid = await loadMermaid()
  for (const code of blocks) {
    const pre = code.parentElement
    if (!pre) continue
    const source = code.textContent || ''
    if (!mermaid) {
      pre.classList.add('mermaid-fallback')
      continue
    }
    try {
      const { svg } = await mermaid.render('mmd-' + counter++, source)
      // Trust model: this viewer renders the user's OWN local doc-this output, served on
      // loopback only — not third-party content. svg is produced by mermaid from that
      // trusted source, so innerHTML here is not an XSS vector in this single-user context.
      const view = document.createElement('div')
      view.className = 'mmd-view'
      view.innerHTML = svg

      const toolbar = document.createElement('div')
      toolbar.className = 'mmd-toolbar'
      const zoomBtn = document.createElement('button')
      zoomBtn.className = 'mmd-btn'
      zoomBtn.type = 'button'
      zoomBtn.title = 'Zoom / pan'
      zoomBtn.textContent = '🔍'
      const tabBtn = document.createElement('button')
      tabBtn.className = 'mmd-btn'
      tabBtn.type = 'button'
      tabBtn.title = 'Open in new tab'
      tabBtn.textContent = '↗'
      toolbar.append(zoomBtn, tabBtn)

      const openZoom = () => openDiagram(view.innerHTML)
      zoomBtn.addEventListener('click', openZoom)
      tabBtn.addEventListener('click', () => openSvgInNewTab(view.querySelector('svg')))
      const svgEl = view.querySelector('svg')
      if (svgEl) svgEl.addEventListener('click', openZoom)

      const figure = document.createElement('figure')
      figure.className = 'mermaid-diagram'
      figure.append(toolbar, view)
      pre.replaceWith(figure)
    } catch (_e) {
      pre.classList.add('mermaid-fallback')
    }
  }
}
