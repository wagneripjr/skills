<script>
  import { fetchText } from '../lib/manifest.js'
  import { renderMarkdown, postProcess } from '../lib/markdown.js'
  import { renderMermaidBlocks } from '../lib/mermaid.js'

  let { path } = $props()

  // Async derivation: a promise of rendered HTML. `path` is constant per instance
  // (the parent remounts this via {#key route}), so this resolves once.
  const doc = $derived(fetchText(path).then(renderMarkdown))

  // Attachment: runs once the <article> (with its {@html} content) is in the DOM —
  // rewrite relative links/images, chip file:line citations, render Mermaid diagrams.
  function enhance(node) {
    queueMicrotask(() => {
      postProcess(node, path)
      renderMermaidBlocks(node)
    })
  }
</script>

{#await doc}
  <div class="pane-msg">Loading…</div>
{:then html}
  <!-- Trusted local content (user's own doc-this output, served on loopback only). -->
  <article class="md" {@attach enhance}>{@html html}</article>
{:catch e}
  <div class="pane-msg error">{String(e)}</div>
{/await}
