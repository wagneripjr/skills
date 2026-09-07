<script>
  let { source, route, search, navigate } = $props()

  const q = $derived(search.trim().toLowerCase())

  function matches(item) {
    if (!q) return true
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.excerpt || '').toLowerCase().includes(q)
    )
  }

  // Returns the items of a group that pass the search filter.
  function visibleItems(items) {
    return (items || []).filter(matches)
  }

  function groupHasMatches(group) {
    if (group.kind === 'surface' || group.kind === 'coverage') {
      return !q || group.label.toLowerCase().includes(q)
    }
    if (group.items) return visibleItems(group.items).length > 0
    if (group.subgroups) return group.subgroups.some((sg) => visibleItems(sg.items).length > 0)
    return false
  }

  let groups = $derived((source?.groups ?? []).filter(groupHasMatches))
</script>

<nav class="sidebar">
  {#each groups as group (group.id)}
    <details open class="group">
      <summary><span class="g-icon">{group.icon}</span> {group.label}</summary>

      {#if group.kind === 'surface'}
        <button class="leaf special" class:active={route === '~surface'} onclick={() => navigate('~surface')}>
          🔌 External surfaces
        </button>
      {:else if group.kind === 'coverage'}
        <button class="leaf special" class:active={route === '~coverage'} onclick={() => navigate('~coverage')}>
          📊 Coverage report
        </button>
      {:else if group.subgroups}
        {#each group.subgroups as sg (sg.id)}
          {@const items = visibleItems(sg.items)}
          {#if items.length}
            <details open class="subgroup">
              <summary class="sub">{sg.label}</summary>
              {#each items as item (item.path)}
                <button class="leaf nested" class:active={route === item.path} onclick={() => navigate(item.path)}>
                  <span class="leaf-title">{item.title}</span>
                  {#if item.confirmed || item.gaps}
                    <span class="counts">
                      {#if item.confirmed}<span class="c ok">🟢{item.confirmed}</span>{/if}
                      {#if item.gaps}<span class="c gap">🔴{item.gaps}</span>{/if}
                    </span>
                  {/if}
                </button>
              {/each}
            </details>
          {/if}
        {/each}
      {:else}
        {#each visibleItems(group.items) as item (item.path)}
          <button class="leaf" class:active={route === item.path} onclick={() => navigate(item.path)}>
            <span class="leaf-title">{item.title}</span>
            {#if item.confirmed || item.gaps}
              <span class="counts">
                {#if item.confirmed}<span class="c ok">🟢{item.confirmed}</span>{/if}
                {#if item.gaps}<span class="c gap">🔴{item.gaps}</span>{/if}
              </span>
            {/if}
          </button>
        {/each}
      {/if}
    </details>
  {/each}

  {#if groups.length === 0}
    <p class="empty">No documents match “{search}”.</p>
  {/if}
</nav>
