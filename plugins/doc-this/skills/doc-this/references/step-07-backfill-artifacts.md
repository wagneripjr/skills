# Step 7 — Artifact Backfill (`--backfill-artifacts`)

Brings a run into **per-module artifact completeness** (BUG-004) after the fact — for a run whose files are all read (the coverage ledger is complete) but whose per-module `data-dictionary/[module].md` / `flowcharts/[module].md` were skipped for some modules. The classic symptom: early modules shipped `code-analysis.md` + `modules.json` only, with their entities recorded in `modules.json` `entities[]` and no human-readable dictionary, while later modules got the full set.

**Why not the other flags:** the ledger is already complete here, so `--backfill-coverage` (step-06) computes an empty unread set and does nothing. `--regenerate=analysis` would needlessly re-read every file. The missing thing is **artifacts, not reads** — this flag regenerates them from data already captured, with near-zero source reads.

Applies only when `doc_level ∈ {standard, detailed}` (minimal embeds artifacts in `code-analysis.md`). Non-destructive outside `.doc-this/` + `<output_folder>/` (the absolute rule applies unchanged). The describe-only pact applies: you are **rendering already-cited facts**, never inferring new ones.

## 1. Detect the artifact gap (no reads)

Walk `modules.json` exactly as `doc-this-artifact-completeness-gate.mjs` does — keyed on counts, never prose:

```bash
OUT=$(jq -r '.output_folder // ".doc-this-sdd"' .doc-this/state.json)
jq -r '.modules[]? | [.name, (.entities // [] | length), (.functions // [] | length), (.algorithms // [] | length)] | @tsv' \
  .doc-this/context/modules.json |
while IFS=$'\t' read -r name n_ent n_fun n_alg; do
  [ "${n_ent:-0}" -gt 0 ] && [ ! -s "$OUT/data-dictionary/$name.md" ] && printf 'DICT  %s (%s entities)\n' "$name" "$n_ent"
  { [ "${n_fun:-0}" -gt 0 ] || [ "${n_alg:-0}" -gt 0 ]; } && [ ! -s "$OUT/flowcharts/$name.md" ] && printf 'FLOW  %s (%s fn / %s algo)\n' "$name" "$n_fun" "$n_alg"
done
```

`DICT` lines need a data dictionary; `FLOW` lines need a flowchart. Report the gap list to the user. If empty, the run is already complete — say so and stop.

## 2. Regenerate the missing dictionaries (zero source reads)

For each `DICT` module, render `<output_folder>/data-dictionary/[module].md` **directly from `modules.json` `entities[]`** — the fields, types, required-flags, and `file:line` citations are already captured there (`modules-schema.md` `entities[].fields[]`). No source file is reopened. One section per entity:

```markdown
## Module: `views`  <!-- or the doc_language heading -->

### Entity `PriceListItem`
| Field | Type | Required | Default | Source |
|-------|------|----------|---------|--------|
| `sku` | string | yes | — | `priceList.ts:14` 🟢 |
| `quantity` | number | no | 0 | `priceList.ts:15` 🟢 |
```

Every row keeps the entity's existing 🟢 citation; a field captured without a citation in `modules.json` stays 🔴 (do not manufacture one). Append a link line for this module to the optional `<output_folder>/data-dictionary.md` roll-up index.

## 3. Regenerate the missing flowcharts (reads only if prose is thin)

For each `FLOW` module, draw `<output_folder>/flowcharts/[module].md` (Mermaid) from two already-captured sources:

1. `modules.json` `functions[]` — names, params, returns, `file:line`.
2. the module's existing control-flow prose in `code-analysis.md`.

Re-read **only that module's `primary_files`** (the entry-point subset in `modules.json`, never the whole module) **when** the captured prose is too thin to draw an honest, citeable diagram. Each node/edge that asserts a branch must trace to a `file:line` — a flowchart is a description, not a guess. If neither the prose nor a `primary_files` read supports a control-flow claim, it does not go in the diagram (and any genuine unknown is a 🔴 in `questions.md`).

## 4. Confirm dual placement

After regeneration, each touched module's entities live in **both** `modules.json` `entities[]` (the machine-readable schema Detective/Architect/Writer consume) **and** `data-dictionary/[module].md` (the human-readable artifact). That is the correct steady state — `entities[]` is the trigger, the dictionary file is the obligation, never one instead of the other.

## 5. Verify

1. Re-run the detection in step 1 — the gap list must be empty.
2. The gate flips: a `doc-this-artifact-completeness-gate.mjs` deny at the detective transition becomes an allow.
3. Run the Reviewer; its **§3b / checklist §A2** (per-module artifact completeness) is the completion criterion — backfill is done when every module with entities has its dictionary and every module with functions/algorithms has its flowchart.

Report to the user: dictionaries regenerated, flowcharts regenerated, modules that needed a `primary_files` re-read, and confirmation the gate now allows the Detective.

## Model & cost guidance

| Step | Work | Model |
|---|---|---|
| 1 | Detect the gap | none (bash/jq) |
| 2 | Render dictionaries from `modules.json` | cheap — mechanical JSON→Markdown; citations already attached |
| 3 | Draw flowcharts from prose (+ thin `primary_files` reads) | session model — control-flow synthesis is judgment |
| 5 | Reviewer §3b | session model (strong) — it IS the completion gate |

The only failure mode no gate catches is a flowchart node asserting a branch the source does not support; mitigate by tracing every asserted edge to a `file:line` from the captured data or a `primary_files` read.
