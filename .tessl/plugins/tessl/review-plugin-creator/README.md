# review-plugin-creator

Guided workflow for creating a custom Tessl reviewer plugin, by forking the default rubric or building one from scratch.

## Install

```bash
tessl install tessl/review-plugin-creator
```

## What it does

`tessl review` scores a skill against a reviewer plugin. With no `--review-plugin`, it uses Tessl's default rubric (Anthropic best practices). This plugin walks you through creating your own reviewer plugin so reviews reflect your team's standard, then gating CI on that score.

Three starting points:

- **Fork the default rubric** – start from Tessl's default rubric (the published `tessl/default-skill-review`, fetched on demand) and tweak weights, anchors, or dimensions.
- **Build from scratch** – author new judges from a blank template for a security-only or domain-specific reviewer.
- **Derive from evidence** – ground the rubric in how your agents actually behave: existing skills, recurring PR review feedback, and agent logs showing where skills failed to activate or needed correction.

The default rubric lives in the published `tessl/default-skill-review` plugin (not bundled here); the fork path fetches it on demand, so you always read and fork exactly what `tessl review` uses out of the box.

## Skills

| Skill | Description |
|-------|-------------|
| `create-review-plugin` | Scaffolds the plugin, writes rubric files and config.json, and validates with `tessl review run` |
| `derive-review-rubrics` | Turns evidence (existing skills, PR feedback, agent logs) into rubric dimensions and anchors, then hands the design to `create-review-plugin` |
