# ID Assignment Rules

How `doc-this-promote` assigns next-available `FR-NNN`, `NFR-NNN`, and `ADR-NNN` IDs without colliding with existing project content.

## Format detection

Scan `docs/requirements/*.md` filenames AND headings to detect the project's existing convention:

| Convention | Example | When to use |
|------------|---------|-------------|
| Flat numeric | `FR-001`, `FR-042` | Default; small to medium projects |
| Compound | `FR-MEM-AUTO-5`, `FR-ONBOARD-1` | Project already uses subdomain prefixes |

If existing IDs are flat: use flat. If compound, follow the same prefix scheme — never mix conventions in the same project.

The pattern, which is also what a commit-traceability gate typically expects where a project enforces one:
```
(FR|NFR)(-segment)*-N
```
Where `(-segment)*` allows zero or more uppercase segments and the last segment is digits. Keep `BUG-NNN` flat-only and 3-digit zero-padded, matching the convention most bug-tracking schemes use.

## Assignment algorithm

In an OKF repo (`docs/okf.yaml` present), read `docs/requirements/index.md` FIRST — the generated
`id — status — description` catalog answers the existing-ID scan in one read. Fall back to the
directory scan below when there is no index or it lacks the generator marker.

```
existing_ids = scan(docs/requirements/*.md)
    via filenames matching FR-(\w+-)*\d+ or NFR-(\w+-)*\d+
    via headings matching # FR-(\w+-)*\d+ or # NFR-(\w+-)*\d+

next_fr = max(numeric suffix of FR-* IDs) + 1
next_nfr = max(numeric suffix of NFR-* IDs) + 1
next_adr = max(numeric suffix of ADR-* in docs/adr/*.md) + 1
```

If no existing IDs exist:
- `FR-001`, `NFR-001`, `ADR-001`

If existing IDs use compound format with a specific prefix that matches the unit (e.g., `FR-AUTH-*` exists and we're promoting an auth unit):
- Use the matching prefix, increment within
- E.g., last `FR-AUTH-3` → next is `FR-AUTH-4`

If existing IDs use compound but the new unit doesn't fit any prefix:
- Use a new prefix derived from the unit slug (UPPER-CASE, hyphenated)
- E.g., new "billing" unit → `FR-BILLING-1`, `FR-BILLING-2`, ...

## Slug generation

The filename is `<ID>-<slug>.md`. Slug is the unit name:
- Lowercase
- Spaces and `_` → `-`
- Drop characters not in `[a-z0-9-]`
- Trim leading/trailing `-`
- Truncate to 50 chars

Example: `Place a New Order` → `place-a-new-order` → file `FR-042-place-a-new-order.md`

## Multi-FR units

A unit's `requirements.md` may contain multiple local FRs (`FR-Local-1`, `FR-Local-2`). The promotion options:

**Option A — Split into separate FR files** (recommended for small FRs)
- Each `FR-Local-N` becomes its own `FR-NNN-<slug>.md`
- One unit = N FR files
- Best when each FR is independently testable / has its own slug-worthy name

**Option B — Bundle as one FR file with sub-requirements** (recommended for tightly coupled FRs)
- One `FR-NNN-<slug>.md` per unit
- `FR-Local-N` references stay as in-doc anchors (`### FR-Local-N`) but the file's primary ID is the unit's
- Best when FRs are facets of a single feature

Default to A unless the unit has > 5 FRs that are facets of the same behavior. Confirm with the user during the planning step if ambiguous.

## NFR handling

NFRs in unit `requirements.md` are typically per-unit (NFR-Local-1, NFR-Local-2). Promote each as its own `NFR-NNN-<slug>.md` UNLESS multiple units share the same NFR (e.g., "all endpoints respond < 200ms"). In that case:
- Detect duplicates across units (textual comparison)
- Promote once, reference from each affected unit's `requirements.md`

## ADR handling

ADR files in `.doc-this-sdd/adrs/` are typically already numbered (`0001-jwt-auth.md`). Renumber to project-wide `ADR-NNN`:
- Strip the local 4-digit prefix
- Use the slug
- Assign next available `ADR-NNN`

## Collision resolution

If a target filename already exists in `docs/requirements/`, `docs/adr/`, or `tests/.../*.feature`:
- **Halt**. Do not overwrite.
- Ask the user:
  > "Conflict: `docs/requirements/FR-042-place-order.md` already exists. The Discovery output for `orders/requirements.md` would land at the same path. Options:
  >  1. Skip — leave existing file untouched
  >  2. Append to a new ID — assign next available (FR-043)
  >  3. Diff and merge — show me the differences first"

Default to option 2 unless the user picks otherwise.

## Validation before write

For each ID assigned:
- [ ] Pattern matches `(FR|NFR)(-segment)*-\d+` or `ADR-\d+`
- [ ] Filename is unique in target directory
- [ ] Heading inside file matches the filename's ID
- [ ] Frontmatter `id:` equals the filename's ID (see `references/okf-conformance.md`)
- [ ] Cross-references in `TRACEABILITY.md` use the same ID
