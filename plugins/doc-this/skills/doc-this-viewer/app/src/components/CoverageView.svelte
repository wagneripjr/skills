<script>
  let { coverage, counts } = $props()

  let classRows = $derived(
    counts
      ? Object.entries(counts).map(([k, v]) => ({ k, v }))
      : [],
  )
</script>

<div class="coverage-view">
  <h1>Coverage</h1>

  {#if coverage && coverage.percent !== null}
    <div class="big-bar">
      <div class="big-fill" style="width:{coverage.percent}%"></div>
    </div>
    <p class="cov-numbers">
      <strong>{coverage.percent}%</strong> — {coverage.files_analyzed} of
      {coverage.files_total_source} source files analyzed
      ({coverage.files_pending} pending)
    </p>
  {:else}
    <p class="muted">No Total Source Coverage data (legacy run, or coverage not yet recorded).</p>
  {/if}

  {#if classRows.length}
    <h2>File manifest</h2>
    <table class="counts-table">
      <thead><tr><th>Class</th><th>Count</th></tr></thead>
      <tbody>
        {#each classRows as r (r.k)}
          <tr><td>{r.k}</td><td class="mono">{r.v}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
