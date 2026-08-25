<script>
  import { fetchJSON } from '../lib/manifest.js'

  let { sourcePath } = $props()

  let kindFilter = $state('all')
  let visFilter = $state('all')
  let q = $state('')

  // `sourcePath` is constant per instance — resolves once.
  const dataPromise = $derived(fetchJSON(sourcePath))

  function detail(e) {
    switch (e.kind) {
      case 'http':
        return `${e.method || ''} ${e.path || ''}`.trim()
      case 'ui':
        return e.route || e.page || ''
      case 'message':
        return `${e.topic || ''} (${e.broker || ''}/${e.role || ''})`
      case 'cli':
        return e.command || ''
      case 'grpc':
        return `${e.service || ''}.${e.method || ''}`
      case 'database':
        return `${e.schema_object || ''} [${e.type || ''}]`
      case 'websocket':
        return e.path || ''
      case 'job':
        return e.schedule || '(no schedule)'
      default:
        return ''
    }
  }

  function applyFilters(entries) {
    const needle = q.toLowerCase()
    return entries.filter(
      (e) =>
        (kindFilter === 'all' || e.kind === kindFilter) &&
        (visFilter === 'all' || e.visibility === visFilter) &&
        (needle === '' || (e.name || '').toLowerCase().includes(needle)),
    )
  }
</script>

<div class="surface">
  <h1>External Surface Catalog</h1>

  {#await dataPromise}
    <div class="pane-msg">Loading surface catalog…</div>
  {:then data}
    {@const entries = data.entries ?? []}
    {@const kinds = [...new Set(entries.map((e) => e.kind))].sort()}
    {@const visibilities = [...new Set(entries.map((e) => e.visibility).filter(Boolean))].sort()}
    {@const filtered = applyFilters(entries)}

    <div class="filters">
      <div class="kind-chips">
        <button class:active={kindFilter === 'all'} onclick={() => (kindFilter = 'all')}>
          all ({entries.length})
        </button>
        {#each kinds as k (k)}
          <button class:active={kindFilter === k} onclick={() => (kindFilter = k)}>
            {k} ({entries.filter((e) => e.kind === k).length})
          </button>
        {/each}
      </div>
      <div class="row2">
        <select bind:value={visFilter}>
          <option value="all">all visibility</option>
          {#each visibilities as v (v)}<option value={v}>{v}</option>{/each}
        </select>
        <input type="search" placeholder="Filter by name…" bind:value={q} />
      </div>
    </div>

    <table class="surface-table">
      <thead>
        <tr>
          <th>Kind</th>
          <th>Name</th>
          <th>Detail</th>
          <th>Visibility</th>
          <th>Confidence</th>
          <th>Consumers</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as e, i (e.name + ':' + i)}
          <tr>
            <td><span class="kind-badge">{e.kind}</span></td>
            <td class="name">{e.name}</td>
            <td class="mono">{detail(e)}</td>
            <td><span class="vis vis-{e.visibility}">{e.visibility || 'unknown'}</span></td>
            <td><span class="conf conf-{e.confidence}">{e.confidence || 'unknown'}</span></td>
            <td class="consumers">
              {#if e.consumed_by && e.consumed_by.length}
                <details>
                  <summary>{e.consumed_by.length}</summary>
                  <ul>
                    {#each e.consumed_by as c, ci (ci)}<li class="mono">{c}</li>{/each}
                  </ul>
                </details>
              {:else}
                <span class="muted">0</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if filtered.length === 0}<p class="empty">No surfaces match the current filters.</p>{/if}
  {:catch e}
    <div class="pane-msg error">{String(e)}</div>
  {/await}
</div>
