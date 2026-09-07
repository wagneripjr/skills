// Dependency-free pan/zoom controller for an element inside a viewport. Used by the
// fullscreen diagram lightbox. No runes here — this is plain DOM glue, callable from any
// module. The viewport clips (overflow:hidden); `content` is transformed in its place.
//
// Zoom is applied by resizing the inner <svg>'s own pixel box (native vector re-render →
// always crisp), NOT by `transform: scale()`. A scaled, GPU-promoted layer rasterizes the
// SVG once and upscales that bitmap (blurry — the old behavior). Pan stays on
// `transform: translate()`, which never blurs.

const STEP_IN = 1.25
const STEP_OUT = 0.8
const WHEEL_IN = 1.1
const WHEEL_OUT = 1 / 1.1
const MAX_FIT = 4 // don't enlarge a tiny diagram past 4× when fitting, even if it would "fit"

// Read the SVG's intrinsic size without depending on layout/timing. viewBox is an attribute,
// available the instant the node exists; getBBox/getBoundingClientRect are layout-dependent
// fallbacks for the rare SVG with no viewBox.
function intrinsicSize(svg) {
  if (!svg) return { w: 0, h: 0 }
  const vb = svg.viewBox && svg.viewBox.baseVal
  if (vb && vb.width && vb.height) return { w: vb.width, h: vb.height }
  const wa = parseFloat(svg.getAttribute('width'))
  const ha = parseFloat(svg.getAttribute('height'))
  if (wa && ha) return { w: wa, h: ha }
  try {
    const bb = svg.getBBox()
    if (bb.width && bb.height) return { w: bb.width, h: bb.height }
  } catch (_e) {
    /* getBBox throws if the SVG is not yet rendered */
  }
  const r = svg.getBoundingClientRect()
  return { w: r.width || 0, h: r.height || 0 }
}

export function createPanZoom(viewport, content, { min = 0.05, max = 12 } = {}) {
  let scale = 1
  let tx = 0
  let ty = 0

  const svg = content.querySelector('svg')
  const { w: baseW, h: baseH } = intrinsicSize(svg)
  // Free the SVG to grow: Mermaid's default (useMaxWidth:true) ships width="100%" + an inline
  // `max-width` that would otherwise clamp our explicit width on zoom-in.
  if (svg) {
    svg.style.maxWidth = 'none'
    svg.removeAttribute('width')
    svg.removeAttribute('height')
  }

  const clamp = (s) => Math.min(max, Math.max(min, s))
  const apply = () => {
    content.style.transform = `translate(${tx}px, ${ty}px)`
    if (svg && baseW && baseH) {
      svg.style.width = baseW * scale + 'px'
      svg.style.height = baseH * scale + 'px'
    }
  }

  // Zoom by `factor` while keeping the viewport-space point (cx, cy) fixed under the cursor.
  // The cursor-pinning math is independent of how magnification is applied: content-pixel P
  // sits on screen at (t + P*scale), so holding a screen point fixed gives t' = px - (px-t)*k.
  function zoomAt(cx, cy, factor) {
    const rect = viewport.getBoundingClientRect()
    const px = cx - rect.left
    const py = cy - rect.top
    const next = clamp(scale * factor)
    const k = next / scale
    tx = px - (px - tx) * k
    ty = py - (py - ty) * k
    scale = next
    apply()
  }

  function zoomCenter(factor) {
    const r = viewport.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor)
  }

  // Scale the content to ~97% of the viewport and center it. Uses the SVG's intrinsic size
  // (no layout/measure dance), so a small diagram enlarges to fill and a large one shrinks to
  // fit — both readable. MAX_FIT keeps an icon-sized diagram from ballooning absurdly.
  function fit() {
    const vr = viewport.getBoundingClientRect()
    if (!baseW || !baseH || !vr.width || !vr.height) {
      apply()
      return
    }
    const raw = Math.min(vr.width / baseW, vr.height / baseH) * 0.97
    scale = clamp(Math.min(raw, MAX_FIT))
    tx = (vr.width - baseW * scale) / 2
    ty = (vr.height - baseH * scale) / 2
    apply()
  }

  function onWheel(e) {
    e.preventDefault()
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_IN : WHEEL_OUT)
  }

  let dragging = false
  let startX = 0
  let startY = 0
  function onDown(e) {
    dragging = true
    startX = e.clientX - tx
    startY = e.clientY - ty
    if (viewport.setPointerCapture) viewport.setPointerCapture(e.pointerId)
  }
  function onMove(e) {
    if (!dragging) return
    tx = e.clientX - startX
    ty = e.clientY - startY
    apply()
  }
  function onUp(e) {
    dragging = false
    if (viewport.releasePointerCapture && e.pointerId != null) {
      try {
        viewport.releasePointerCapture(e.pointerId)
      } catch (_err) {
        /* pointer may already be released */
      }
    }
  }

  viewport.addEventListener('wheel', onWheel, { passive: false })
  viewport.addEventListener('pointerdown', onDown)
  viewport.addEventListener('pointermove', onMove)
  viewport.addEventListener('pointerup', onUp)
  viewport.addEventListener('pointerleave', onUp)

  apply()

  return {
    zoomIn: () => zoomCenter(STEP_IN),
    zoomOut: () => zoomCenter(STEP_OUT),
    reset: fit,
    fit,
    get scale() {
      return scale
    },
    destroy() {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('pointerdown', onDown)
      viewport.removeEventListener('pointermove', onMove)
      viewport.removeEventListener('pointerup', onUp)
      viewport.removeEventListener('pointerleave', onUp)
    },
  }
}

// Open a standalone copy of an <svg> element in a new browser tab at full size. The browser's
// native viewer then handles zoom/print/save. Click-initiated, so popup blockers allow it.
export function openSvgInNewTab(svgEl) {
  if (!svgEl) return
  const clone = svgEl.cloneNode(true)
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  // Drop any inline sizing the lightbox applied so the new tab opens at natural size.
  clone.style.removeProperty('width')
  clone.style.removeProperty('height')
  clone.style.removeProperty('max-width')
  const markup = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([markup], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  // The new tab keeps its own reference to the object; revoke ours once it has surely loaded.
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
