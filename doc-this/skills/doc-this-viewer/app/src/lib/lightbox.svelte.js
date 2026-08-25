// Shared reactive state for the fullscreen diagram lightbox. The `.svelte.js` extension is
// mandatory: $state in a plain `.js` file silently compiles but white-screens at runtime.
//
// The getter pattern is the robust way to share rune state across module boundaries —
// exporting a `$state` *variable* directly and reassigning it elsewhere does not propagate,
// but exported getters always read the live value in a reactive context.

let _open = $state(false)
let _svg = $state('')

export const lightbox = {
  get open() {
    return _open
  },
  get svg() {
    return _svg
  },
}

// Called imperatively from mermaid.js when a diagram is clicked. `svg` is the diagram's
// outerHTML — trusted local content (the user's own doc-this output, served on loopback).
export function openDiagram(svg) {
  _svg = svg
  _open = true
}

export function closeDiagram() {
  _open = false
}
