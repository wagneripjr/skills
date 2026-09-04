---
name: create-review-plugin
description: Scaffold and author a custom Tessl reviewer plugin, by forking the default rubric or building one from scratch. Fetches the published default Tessl review rubric (tessl/default-skill-review) so you can read and tweak it, scaffolds the plugin directory, writes rubric files and config.json, and validates with tessl review run. Use when the user wants to create or customise a review plugin, fork or tweak the default reviewer rubric, change scoring weights, add custom judges, or build a domain-specific rubric for tessl review.
---

`tessl review` scores a skill against a **reviewer plugin**. With no `--review-plugin`, it uses Tessl's default rubric (Anthropic best practices). A custom reviewer plugin lets you change what "good" means - re-weight dimensions, edit the scoring anchors, or add your own judges - then gate CI on your team's standard.

This skill creates that plugin. There are two ways to start:

- **Fork the default rubric** (recommended). Start from Tessl's default rubric — published as `tessl/default-skill-review`, fetched on demand — and tweak it. Best when you mostly agree with the default and want to adjust weights, wording, or add a dimension.
- **Build from scratch.** Author new judges from a blank template. Best when your standard is unrelated to the default, for example a security-only or domain-specific reviewer.

Both produce the same plugin structure and are validated the same way.

## The default rubric

Tessl's default rubric is published as the plugin `tessl/default-skill-review` — the exact rubric `tessl review` uses out of the box. Step 2 fetches it so you can read it before deciding whether to fork or start fresh; this skill no longer bundles its own copy, so what you fork is always the current default.

It scores three components (weights live in `config.json`):

| Component | Weight | What it measures |
|-----------|--------|------------------|
| `validation` | 0.2 | Deterministic checks: frontmatter, line count, schema, licence |
| `description` judge | 0.4 | How well the skill's description drives activation |
| `content` judge | 0.4 | Quality of the SKILL.md body |

The two judges and their dimensions (all on a 1-5 scale):

- **`description.json`** - specificity (0.2), trigger term quality (0.3), completeness (0.35), distinctiveness / conflict risk (0.15)
- **`content.json`** - conciseness (0.3), actionability (0.3), workflow clarity (0.25), progressive disclosure (0.15)

To fork the default, copy these files into your plugin and edit them (Step 4, Path A).

## Plugin structure

Every reviewer plugin has this layout:

```
<plugin-name>/
├── .tessl-plugin/
│   └── plugin.json
└── skills/skill-reviewer/
    ├── SKILL.md
    └── references/
        ├── config.json
        ├── schemas/
        │   ├── rubric.schema.json
        │   ├── config.schema.json
        │   └── results.schema.json
        └── rubrics/
            └── <judge-name>.json   (one per judge)
```

The schema files come from the fetched default reviewer (Step 2 copies them in). Use them verbatim — do not modify them.

## Step 1 — Choose your starting point and judges

Before writing files, decide:
- **Fork or scratch?** If you mostly agree with the default, fork it (Step 4, Path A). If your standard is unrelated, start from the blank template (Path B).
- **How many judges (rubrics)** — 1–6 is a good range. The default has 2 (`description`, `content`).
- **What each judge evaluates** (its `evaluation_target`) and **what weight it carries** in the final score.

### Weight invariant

```
validation_weight + Σ(judges[stem].weight) = 1.0
```

`validation_weight` controls how much the deterministic validation pass (frontmatter checks, line count, etc.) contributes to the score. Set to `0.0` to exclude validation from scoring entirely (it still runs as a gate).

**Examples:**

| Setup | config.json |
|-------|-------------|
| Default | `validation_weight: 0.2, judges: { description: { weight: 0.4 }, content: { weight: 0.4 } }` |
| 1 judge, validation off | `validation_weight: 0.0, judges: { content: { weight: 1.0 } }` |
| 3 judges | `validation_weight: 0.1, judges: { security: { weight: 0.5 }, clarity: { weight: 0.3 }, brevity: { weight: 0.1 } }` |

The judge key in `config.json` is the rubric filename stem — `security.json` → key `security`.

## Step 2 — Scaffold the directory

Ask the user where to create the plugin (or use `./my-reviewer`). Then create the directory structure:

```bash
PLUGIN_DIR=<chosen-path>
mkdir -p "$PLUGIN_DIR"/{.tessl-plugin,skills/skill-reviewer/references/{rubrics,schemas}}
```

Fetch the published default reviewer (`tessl/default-skill-review`) into a temp dir — no install, it does not touch your project. Both starting points scaffold from it:

```bash
DEFAULT_DIR=$(mktemp -d)
curl -fsSL "https://codeload.github.com/tesslio/product-plugins/tar.gz/refs/heads/main" \
  | tar -xz -C "$DEFAULT_DIR" --strip-components=2 "product-plugins-main/default-skill-review"
DEFAULT_SRC="$DEFAULT_DIR/skills/skill-reviewer"
```

Copy the canonical schema files and the reviewer agent prompt from the fetched default:

```bash
cp "$DEFAULT_SRC"/references/schemas/*.json \
   "$PLUGIN_DIR/skills/skill-reviewer/references/schemas/"
cp "$DEFAULT_SRC"/SKILL.md \
   "$PLUGIN_DIR/skills/skill-reviewer/SKILL.md"
```

The plugin's `SKILL.md` is the reviewer agent instruction — it drives the agent during review runs. Start from the fetched default verbatim and make only targeted edits.

- **Safe to customise:** evaluation style, domain-specific guidance, how the agent interprets rubric anchors
- **Risky to remove:** the steps that read `config.json`/`rubrics/` and write `results.json` — these are load-bearing for scoring

The `results.json` output schema is enforced at the recipe level regardless of what your `SKILL.md` says — the agent's output is validated against the schema even if the instruction differs.

## Step 3 — Write `plugin.json`

```bash
cat > "$PLUGIN_DIR/.tessl-plugin/plugin.json" << 'EOF'
{
  "name": "<workspace>/<plugin-name>",
  "version": "0.1.0",
  "description": "<what this plugin evaluates>",
  "private": true,
  "skills": "./skills/"
}
EOF
```

## Step 4 — Add your rubrics

### Path A — Fork the default rubric

The default is already fetched in Step 2 (`$DEFAULT_SRC`). Copy its rubrics and config into your plugin, then edit them:

```bash
cp "$DEFAULT_SRC"/references/rubrics/description.json \
   "$PLUGIN_DIR/skills/skill-reviewer/references/rubrics/"
cp "$DEFAULT_SRC"/references/rubrics/content.json \
   "$PLUGIN_DIR/skills/skill-reviewer/references/rubrics/"
cp "$DEFAULT_SRC"/references/config.json \
   "$PLUGIN_DIR/skills/skill-reviewer/references/config.json"
```

Now make targeted edits. Common tweaks:
- **Re-weight dimensions** within a rubric (e.g. push `conciseness` up). The rubric's dimension weights must still sum to 1.0.
- **Re-weight judges** in `config.json` (e.g. weight `content` over `description`). `validation_weight` + judge weights must still sum to 1.0.
- **Edit anchors and examples** so the score reflects your house style.
- **Add a dimension** to a judge (e.g. a security-hygiene dimension inside `content`), then re-balance that rubric's dimension weights to sum to 1.0.
- **Add a judge** — drop a new `<stem>.json` in `rubrics/` and add `<stem>: { weight }` to `config.json`.

Forking already wrote `config.json`, so edit it in place rather than writing a new one in Step 5. Go to Step 6 to validate.

### Path B — Build from scratch

For each judge, create `$PLUGIN_DIR/skills/skill-reviewer/references/rubrics/<stem>.json`.

A rubric file must conform to `references/schemas/rubric.schema.json` (copied into your plugin in Step 2). Key fields:

- `evaluation_target` — what is being evaluated (matches the judge's purpose)
- `scale` — `{ "min": 1, "max": 5 }` is standard
- `reference_examples` — `judging_guidelines` (array of strings), `good_overall_examples`, `bad_overall_examples`
- `dimensions` — array of scoring dimensions; weights within a rubric must sum to `1.0`

Each dimension needs: `id` (snake_case), `name`, `weight`, `question`, and `scores` (array with `score`, `anchor`, `example` for each level from min to max).

**Minimal rubric template:**

```json
{
  "$schema": "../schemas/rubric.schema.json",
  "evaluation_target": "<what-this-judge-evaluates>",
  "scale": { "min": 1, "max": 5 },
  "reference_examples": {
    "judging_guidelines": [
      "Use odd scores (1, 3, 5) when the content clearly matches an anchor; use even scores (2, 4) when it falls between two anchors.",
      "After assigning each score, re-read the anchors for the score above and below and adjust to the best fit.",
      "Award 5 only when <specific criterion>.",
      "Score 1 for <negative criterion>."
    ],
    "good_overall_examples": ["<example of a high-scoring skill>"],
    "bad_overall_examples": ["<example of a low-scoring skill>"]
  },
  "dimensions": [
    {
      "id": "dimension_one",
      "name": "Dimension One",
      "weight": 0.6,
      "question": "Does the skill <specific question>?",
      "scores": [
        { "score": 1, "anchor": "No evidence of <criterion>", "example": "<bad example>" },
        { "score": 2, "anchor": "Minimal <criterion>", "example": "<weak example>" },
        { "score": 3, "anchor": "Partial <criterion>", "example": "<ok example>" },
        { "score": 4, "anchor": "Mostly complete <criterion>", "example": "<solid example>" },
        { "score": 5, "anchor": "Clear and complete <criterion>", "example": "<good example>" }
      ]
    },
    {
      "id": "dimension_two",
      "name": "Dimension Two",
      "weight": 0.4,
      "question": "Does the skill <second question>?",
      "scores": [
        { "score": 1, "anchor": "...", "example": "..." },
        { "score": 2, "anchor": "...", "example": "..." },
        { "score": 3, "anchor": "...", "example": "..." },
        { "score": 4, "anchor": "...", "example": "..." },
        { "score": 5, "anchor": "...", "example": "..." }
      ]
    }
  ]
}
```

Dimension `weight` values within a single rubric must sum to `1.0` (separate from the plugin-level judge weights in `config.json`).

## Step 5 — Write `config.json` (scratch path)

Path A already copied a `config.json` — edit that one instead. For Path B, write it:

```bash
cat > "$PLUGIN_DIR/skills/skill-reviewer/references/config.json" << 'EOF'
{
  "$schema": "../schemas/config.schema.json",
  "validation_weight": <value>,
  "judges": {
    "<rubric-stem-1>": { "weight": <value> },
    "<rubric-stem-2>": { "weight": <value> }
  }
}
EOF
```

Verify the invariant: `validation_weight + sum of all judge weights = 1.0`.

## Step 6 — Validate

Create a throwaway skill to test against:

```bash
SKILL_DIR=$(mktemp -d)
cat > "$SKILL_DIR/SKILL.md" << 'EOF'
---
name: plugin-test
description: Use when testing a custom reviewer plugin.
---
# Plugin test
Use when verifying a custom reviewer plugin works correctly.
EOF
```

Run with your new plugin:

```bash
tessl review run "$SKILL_DIR" \
  --workspace <workspace-name> \
  --review-plugin "$PLUGIN_DIR" \
  --force \
  --json
```

**Healthy output** — the JSON should contain:
- `validation.overallPassed: true`
- `judges` map with one key per rubric stem
- `review.reviewScore` as an integer 0–100

If the plugin fails validation (bad weights, missing rubric, malformed schema), the API returns 400 with a message describing the exact problem. Fix the relevant file and re-run.

## Common problems

| Problem | Cause | Fix |
|---------|-------|-----|
| 400 "weights do not sum to 1.0" | `validation_weight + judge weights ≠ 1.0` | Adjust values in `config.json` |
| 400 "judges key X does not match any rubric" | Key in `config.json` has no matching `X.json` in `rubrics/` | Create the rubric or fix the key name |
| 400 "rubric dimensions weights" | Dimension weights in a rubric don't sum to 1.0 | Fix the `dimensions[].weight` values in that rubric |
| `judges` map empty in results | `SKILL.md` is missing the rubric-reading steps | Ensure `SKILL.md` includes the steps that read `config.json`/`rubrics/` and write `results.json` |
| Score always 0 | `validation_weight: 0` AND judge scoring all returned 0 | Check rubric anchors and examples |
