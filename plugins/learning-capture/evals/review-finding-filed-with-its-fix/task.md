# Apply the review finding and file it

This is the `ledger-sync` repository at Quillmark Press. Recreate the files below exactly in the
working directory first; they are already committed.

### `src/sync.js`

```js
export async function syncBatch(client, rows) {
  for (const row of rows) {
    client.post('/royalties', row).catch(() => {});
  }
  return rows.length;
}
```

### `.learnings/LEARNINGS.md`

```markdown
# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice | review_finding
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

---
```

## The finding

An adversarial review ran on this change as job `review-job-7731` and returned one finding:

> `syncBatch` fires each POST without awaiting it and swallows every rejection, then reports all
> rows as synced. A partner outage therefore reads as a successful batch and the rows are lost.

We agree with it. The coding standards our agents follow come from the `quillmark-conventions`
plugin; its `error-handling` skill says nothing about fire-and-forget promises, and it should
have — that text is what ought to have prevented this.

Fix the bug, and file the finding the way our learnings are meant to be filed.
