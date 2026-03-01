---
name: stitch
description: >-
  Use when designing web UIs, generating HTML pages, creating landing pages, building React
  components, producing design systems, or iterating on screen designs via Google Stitch.
  Delegates all design work to Gemini CLI with Stitch extension — preserves Claude's context
  window and token credits while leveraging Gemini's free quota (~350 Flash/month, ~50 Pro/month).
  Triggers on "design a page", "create a landing page", "generate UI", "build a web layout",
  "generate a screen", "export HTML from Stitch", "export React components", "create design
  system", "iterate on design", "generate design variants", "link Stitch project", "list Stitch
  projects". Requires Gemini CLI and Stitch extension installed — run check command to verify
  and get install instructions if missing. This is NOT for web search or research — use
  gemini-web for that. This is NOT for browser testing — use playwright for that. This is NOT
  for direct Stitch MCP calls — it delegates to Gemini CLI to save context and credits.
---

# Stitch: Web Design via Gemini CLI

Delegate UI/web design to **Gemini CLI + Stitch extension**. Every design operation runs externally through `gemini -p "..." --yolo`, preserving Claude's context window and API credits.

## Quick Reference

```bash
STITCH="${CLAUDE_PLUGIN_ROOT}/skills/stitch/stitch.sh"

"$STITCH" check                                    # Verify prerequisites
"$STITCH" link <project-id> ["Title"]              # Link project to working dir
"$STITCH" unlink                                   # Unlink project
"$STITCH" create "My App"                          # Create new project (auto-links)
"$STITCH" list                                     # List all projects
"$STITCH" screens                                  # List screens in linked project
"$STITCH" generate "modern login page" --device desktop
"$STITCH" edit <screen-id> "add dark mode toggle"
"$STITCH" variants <screen-id> "color scheme" --count 3 --range explore
"$STITCH" export --format html --dir ./src/pages
"$STITCH" design-system --output DESIGN.md
```

## Prerequisites

**Both are REQUIRED. Run `stitch.sh check` to verify.**

### 1. Gemini CLI

```bash
npm install -g @google/gemini-cli
# or: brew install gemini-cli

# Authenticate (first run opens browser, or use API key):
export GEMINI_API_KEY="your-key"  # from https://aistudio.google.com/apikey
```

### 2. Stitch Extension

```bash
gemini extensions install https://github.com/gemini-cli-extensions/stitch --auto-update
```

Authenticate Stitch (choose one):

**API Key** (recommended):
1. Go to stitch.withgoogle.com > Profile icon > Stitch Settings > API Keys > Create Key
2. Configure the extension:
   ```bash
   export API_KEY="your-stitch-key"
   sed "s/YOUR_API_KEY/$API_KEY/g" \
     ~/.gemini/extensions/Stitch/gemini-extension-apikey.json \
     > ~/.gemini/extensions/Stitch/gemini-extension.json
   ```

**Google Cloud ADC** (enterprise):
```bash
gcloud auth application-default login
gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT
```

Run `stitch.sh check` after setup — it verifies the binary, extension, and auth by actually listing projects.

## Workflow

A typical design session follows this flow:

1. **Create or select a project** — `create "Title"` or `link <existing-pid>`
2. **Generate screens** — `generate "description"` with device type and model options
3. **Iterate** — `edit` screens or `variants` to explore alternatives
4. **Export code** — `export --format html` or `--format react` to local files
5. **Document** — `design-system` extracts colors, fonts, spacing into DESIGN.md

## Command Reference

### check

Verify Gemini CLI is installed, Stitch extension is present, and authentication works. Run before first use or when troubleshooting.

### link / unlink

Link a Stitch project to the current working directory. Creates two files:
- `.stitch.json` — machine-readable config for the script (`{"projectId": "...", "title": "..."}`)
- Appends a `## Stitch Design System` section to `GEMINI.md` — gives Gemini CLI context about the project's design system

Most commands read the project ID from `.stitch.json` automatically. Pass `--pid <id>` to override.

`unlink` removes `.stitch.json` but leaves `GEMINI.md` for manual cleanup.

### create

Create a new Stitch project. If no `.stitch.json` exists in the current directory, the new project is auto-linked. The project ID is extracted from Gemini's response and written to `.stitch.json`.

### list

List all Stitch projects with name, numeric ID, and screen count. No project linking required.

### screens

List all screens in the linked project (or `--pid`). Shows screen name, ID, and device type.

### generate

Generate a new screen from a text prompt.

Options:
- `--device mobile|desktop|tablet` — target device (default: desktop)
- `--model flash|pro` — generation model. Flash is fast (~350/month), Pro is higher quality (~50/month)
- `--pid <id>` — override linked project

Generation takes 1-2 minutes. The script uses a 180-second timeout (configurable via `STITCH_TIMEOUT` env var).

### edit

Edit an existing screen by ID with a text prompt describing changes. Requires the screen ID from `screens` output.

### variants

Generate design variants of a screen. Explore alternatives without losing the original.

Options:
- `--count 1-5` — number of variants (default: 3)
- `--range refine|explore|reimagine` — variation intensity:
  - REFINE — subtle tweaks (spacing, alignment)
  - EXPLORE — moderate changes (layout shifts, color adjustments)
  - REIMAGINE — dramatic redesign

### export

Export all screens from the linked project to local files.

Options:
- `--format html|react` — output format (default: html)
- `--dir ./path` — output directory (default: `./stitch-export`)

Gemini writes files directly to disk (via `--yolo` auto-approve). After export, lists all created files.

### design-system

Analyze the linked project and generate a comprehensive design system document. Extracts colors, typography, spacing, borders, shadows, and component patterns.

Options:
- `--output DESIGN.md` — output file (default: DESIGN.md)

## Device Types

| Type | Use for |
|------|---------|
| `DESKTOP` | Full-width web pages, dashboards, admin panels (default) |
| `MOBILE` | Phone-sized screens, mobile-first designs |
| `TABLET` | iPad-sized layouts, responsive breakpoints |

## Models

| Model | Speed | Quality | Quota |
|-------|-------|---------|-------|
| `flash` | Fast (~30s) | Standard | ~350 generations/month |
| `pro` | Slower (~90s) | Higher fidelity | ~50 generations/month |

Default: flash. Use pro for hero sections, complex layouts, or final polish.

## Project Context with GEMINI.md

Gemini CLI reads `GEMINI.md` automatically from the project root. The `link` command appends a Stitch section, but enrich it with your design system for better results:

```markdown
## Stitch Design System
- Stitch Project ID: 13534454087919359824
- Project: My App
- Primary color: #0052CC
- Secondary color: #FF5630
- Font: Inter
- Style: Clean, minimal, professional
- Use Stitch tools to manage screens in this project
- Match the existing design system when generating new screens
```

See `references/gemini-md-template.md` for a full template.

## Prompt Tips

Effective Stitch prompts are specific about:
- **Layout**: "hero section with centered headline, 3-column feature grid below, CTA button"
- **Style**: "dark mode, glassmorphism cards, gradient accent from blue to purple"
- **Content**: "pricing page with Free/Pro/Enterprise tiers, monthly/annual toggle"
- **Device**: match `--device` to the prompt context (responsive mobile nav vs desktop sidebar)

Avoid vague prompts like "make a nice page" — Stitch produces better results with concrete descriptions.

## Limitations

- **Generation time**: 1-2 minutes per screen (the script uses a 180s timeout)
- **Monthly quota**: ~350 Flash, ~50 Pro generations per month (free tier)
- **Experimental**: Stitch is a Google Labs product — features and API may change
- **Auth dependency**: requires valid Stitch API key or GCP ADC
- **Gemini CLI required**: this skill does NOT use Stitch MCP tools directly — it delegates to Gemini CLI
