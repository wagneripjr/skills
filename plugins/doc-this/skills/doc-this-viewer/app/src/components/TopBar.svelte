<script>
  let { manifest, activeSourceId, setSource, search = $bindable(), theme = $bindable() } = $props()

  let cov = $derived(manifest.coverage)

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark'
  }
</script>

<header class="topbar">
  <div class="brand">
    <span class="logo">📚</span>
    <span class="project">{manifest.project}</span>
    {#if manifest.doc_level}<span class="tag">{manifest.doc_level}</span>{/if}
    {#if manifest.doc_language}<span class="tag subtle">{manifest.doc_language}</span>{/if}
  </div>

  <div class="meters">
    <span class="chip ok" title="confirmed claims">🟢 {manifest.confidence.confirmed_total}</span>
    <span class="chip gap" title="open gaps">🔴 {manifest.confidence.gap_total}</span>
    {#if cov && cov.percent !== null}
      <div class="coverage" title="source files analyzed">
        <div class="bar"><div class="fill" style="width:{cov.percent}%"></div></div>
        <span class="cov-label">{cov.percent}% ({cov.files_analyzed}/{cov.files_total_source})</span>
      </div>
    {/if}
  </div>

  <div class="controls">
    {#if manifest.sources.length > 1}
      <div class="source-switch">
        {#each manifest.sources as s (s.id)}
          <button class:active={s.id === activeSourceId} onclick={() => setSource(s.id)}>
            {s.label}
          </button>
        {/each}
      </div>
    {/if}
    <input class="search" type="search" placeholder="Search docs…" bind:value={search} />
    <button class="icon-btn" title="Toggle theme" onclick={toggleTheme}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  </div>
</header>
