<script>
  import { onMount } from 'svelte'
  import { loadManifest } from './lib/manifest.js'
  import TopBar from './components/TopBar.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import MarkdownPane from './components/MarkdownPane.svelte'
  import SurfaceCatalog from './components/SurfaceCatalog.svelte'
  import CoverageView from './components/CoverageView.svelte'
  import DiagramLightbox from './components/DiagramLightbox.svelte'

  let manifest = $state(null)
  let error = $state(null)
  let activeSourceId = $state(null)
  let route = $state(decodeURIComponent(location.hash.slice(1)))
  let search = $state('')
  let theme = $state(
    localStorage.getItem('dtv-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  $effect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('dtv-theme', theme)
  })

  let activeSource = $derived(
    manifest ? manifest.sources.find((s) => s.id === activeSourceId) ?? manifest.sources[0] : null,
  )

  function firstItemPath(source) {
    for (const g of source.groups) {
      if (g.items && g.items.length) return g.items[0].path
      if (g.subgroups) {
        for (const sg of g.subgroups) if (sg.items && sg.items.length) return sg.items[0].path
      }
    }
    return ''
  }

  onMount(async () => {
    try {
      manifest = await loadManifest()
      activeSourceId = manifest.sources[0]?.id ?? null
      if (!route && activeSource) route = firstItemPath(activeSource)
    } catch (e) {
      error = String(e)
    }
    const onHash = () => (route = decodeURIComponent(location.hash.slice(1)))
    window.addEventListener('hashchange', onHash)
  })

  function navigate(r) {
    location.hash = '#' + r
  }

  function setSource(id) {
    activeSourceId = id
    const src = manifest.sources.find((s) => s.id === id)
    if (src) navigate(firstItemPath(src))
  }
</script>

{#if error}
  <div class="fatal">
    <h1>Could not load the viewer</h1>
    <p>{error}</p>
    <p class="hint">Is the doc-this viewer server running? Re-run <code>launch.mjs</code>.</p>
  </div>
{:else if !manifest}
  <div class="fatal"><p>Loading manifest…</p></div>
{:else}
  <div class="app">
    <TopBar {manifest} {activeSourceId} {setSource} bind:search bind:theme />
    <div class="body">
      <Sidebar source={activeSource} {route} {search} {navigate} />
      <main class="content">
        {#if route === '~surface'}
          {@const g = activeSource.groups.find((x) => x.kind === 'surface')}
          {#if g}<SurfaceCatalog sourcePath={g.source} />{/if}
        {:else if route === '~coverage'}
          <CoverageView coverage={manifest.coverage} counts={manifest.manifest_counts} />
        {:else if route}
          {#key route}<MarkdownPane path={route} />{/key}
        {:else}
          <div class="pane-msg">Select a document from the sidebar.</div>
        {/if}
      </main>
    </div>
  </div>
  <DiagramLightbox />
{/if}
