# You ran the wrong migration command

This is the `ledger-sync` repository at Quillmark Press. Recreate the files below exactly in the
working directory first; they are already committed.

### `README.md`

```markdown
# ledger-sync

Syncs the royalty ledger from the print-on-demand partner into our accounting database.

## Database

Run `npm run migrate` to apply migrations.
```

### `package.json`

```json
{
  "name": "ledger-sync",
  "private": true,
  "scripts": {
    "migrate": "knex migrate:latest"
  }
}
```

### `Makefile`

```make
db-migrate:
	npx knex migrate:latest
	npx knex seed:run --specific=01_currency_codes.js
```

### `.learnings/LEARNINGS.md`

```markdown
# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice | review_finding
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

---

## [LRN-20260112-001] knowledge_gap

**Logged**: 2026-01-12T09:40:00Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
The partner API returns amounts in minor units (cents), not decimals

### Details
The first import doubled-counted decimals. The API documents `amount` as an integer in minor units.

### Suggested Action
Divide by 100 at the adapter boundary only.

### Metadata
- Source: error
- Related Files: src/partner/adapter.js
- Tags: currency, partner-api

---
```

## What happened

Earlier today I asked you to bring the database up to date and you ran `npm run migrate`. That's
wrong. In this repo migrations always go through `make db-migrate`, because the npm script skips
the currency-code seed, and without it every royalty row in a non-USD currency fails its foreign
key. The README is what misled you.

Fix the README, and make sure no session in this repository ever makes that mistake again.
