<script>
  import { lightbox, closeDiagram } from '../lib/lightbox.svelte.js'
  import { createPanZoom, openSvgInNewTab } from '../lib/panzoom.js'

  // The active pan/zoom controller, created when the overlay's viewport enters the DOM.
  let pz = $state(null)

  // Attachment on the viewport: wire pan/zoom to the SVG content inside it. Runs whenever the
  // overlay opens (the {#if} below toggles the node), and its returned cleanup runs on close.
  function wire(viewport) {
    const content = viewport.querySelector('.dtv-lb-content')
    const controller = createPanZoom(viewport, content)
    pz = controller
    // Fit from the SVG's intrinsic viewBox — an attribute, available immediately — so this is
    // synchronous and timing-proof (the old single-rAF measure was the "fit doesn't fit" bug).
    controller.fit()
    // Keep the diagram fitted when the window/viewport resizes while the overlay is open.
    const ro = new ResizeObserver(() => controller.fit())
    ro.observe(viewport)
    return () => {
      ro.disconnect()
      controller.destroy()
      pz = null
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && lightbox.open) closeDiagram()
  }

  // Close only when the click lands on the backdrop itself, not on the toolbar or diagram.
  function onBackdrop(e) {
    if (e.target === e.currentTarget) closeDiagram()
  }

  function newTab() {
    // Re-serialize the live SVG node currently displayed in the overlay.
    const svg = document.querySelector('.dtv-lb-content svg')
    openSvgInNewTab(svg)
  }
</script>

<svelte:window onkeydown={onKey} />

{#if lightbox.open}
  <div
    class="dtv-lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Diagram viewer"
    tabindex="-1"
    onclick={onBackdrop}
    onkeydown={onKey}
  >
    <div class="dtv-lb-toolbar">
      <button class="mmd-btn" title="Zoom out" onclick={() => pz?.zoomOut()}>−</button>
      <button class="mmd-btn" title="Fit to screen" onclick={() => pz?.reset()}>⟲ fit</button>
      <button class="mmd-btn" title="Zoom in" onclick={() => pz?.zoomIn()}>+</button>
      <span class="dtv-lb-spacer"></span>
      <button class="mmd-btn" title="Open in new tab" onclick={newTab}>↗ new tab</button>
      <button class="mmd-btn" title="Close (Esc)" onclick={closeDiagram}>✕</button>
    </div>
    <div class="dtv-lb-viewport" {@attach wire}>
      <!-- Trusted local content (user's own doc-this output, served on loopback only). -->
      <div class="dtv-lb-content">{@html lightbox.svg}</div>
    </div>
  </div>
{/if}
