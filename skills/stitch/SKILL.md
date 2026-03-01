---
name: stitch
description: >-
  Use when designing web UIs, generating HTML pages, creating landing pages, building React
  components, or iterating on screen designs via Google Stitch.
  Delegates all design work to Gemini CLI with Stitch extension — preserves Claude's context
  window and token credits while leveraging Gemini's free quota (~350 generations/month).
  Triggers on "design a page", "create a landing page", "generate UI", "build a web layout",
  "generate a screen", "export HTML from Stitch", "export React components",
  "iterate on design", "link Stitch project". Requires Gemini CLI and Stitch extension
  installed — run check command to verify and get install instructions if missing.
  This is NOT for web search or research — use gemini-web for that.
  This is NOT for browser testing — use playwright for that.
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
"$STITCH" generate "modern login page" --device desktop
"$STITCH" edit <screen-id> "add dark mode toggle"
"$STITCH" export --format html --dir ./src/pages
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

1. **Create or select a project** — `create "Title"` or `link <existing-pid>`
2. **Generate screens** — `generate "description"` with `--device` option
3. **Iterate** — `edit <screen-id> "changes"` to refine
4. **Export code** — `export --format html` or `--format react` to local files

## Command Reference

### check

Verify Gemini CLI is installed, Stitch extension is present, and authentication works.

### link / unlink

Link a Stitch project to the current working directory. Creates:
- `.stitch.json` — config for the script (`{"projectId": "...", "title": "...", "screens": []}`)
- Appends a `## Stitch Design System` section to `GEMINI.md`

The `screens` array is populated automatically by `generate` and used as a fallback by `export`.

Most commands read the project ID from `.stitch.json` automatically. Pass `--pid <id>` to override.

`unlink` removes `.stitch.json` but leaves `GEMINI.md` for manual cleanup.

### create

Create a new Stitch project. If no `.stitch.json` exists, the new project is auto-linked.

### generate

Generate a new screen from a text prompt. **Screen IDs are automatically tracked** in `.stitch.json` — this is critical because Stitch's `list_screens` API can be unreliable (see export).

Options:
- `--device mobile|desktop|tablet` — target device (default: desktop)
- `--pid <id>` — override linked project

### edit

Edit an existing screen by ID with a text prompt describing changes.

### export

Export all screens from the linked project to local files. Uses `list_screens` first, but **falls back to stored screen IDs** from `.stitch.json` when the list returns empty (known Stitch API limitation). Always generate screens through `stitch.sh generate` to ensure IDs are tracked.

Options:
- `--format html|react` — output format (default: html)
- `--dir ./path` — output directory (default: `./stitch-export`)

## Device Types

| Type | Use for |
|------|---------|
| `DESKTOP` | Full-width web pages, dashboards, admin panels (default) |
| `MOBILE` | Phone-sized screens, mobile-first designs |
| `TABLET` | iPad-sized layouts, responsive breakpoints |

## Project Context with GEMINI.md

Gemini CLI reads `GEMINI.md` automatically from the project root. The `link` command appends a Stitch section, but enrich it with your design system for better results:

```markdown
## Stitch Design System
- Stitch Project ID: 13534454087919359824
- Project: My App
- Primary color: #0052CC
- Font: Inter
- Style: Clean, minimal, professional
- Use Stitch tools to manage screens in this project
```

## Prompt Tips

Effective Stitch prompts are specific about:
- **Layout**: "hero section with centered headline, 3-column feature grid below, CTA button"
- **Style**: "dark mode, glassmorphism cards, gradient accent from blue to purple"
- **Content**: "pricing page with Free/Pro/Enterprise tiers, monthly/annual toggle"
- **Device**: match `--device` to the prompt context (responsive mobile nav vs desktop sidebar)

## Limitations

- **Generation time**: 1-2 minutes per screen
- **Monthly quota**: ~350 generations per month (free tier)
- **Experimental**: Stitch is a Google Labs product — features and API may change
- **Auth dependency**: requires valid Stitch API key or GCP ADC
- **Gemini CLI required**: delegates to Gemini CLI, not direct Stitch MCP calls
- **`list_screens` unreliable**: may return empty for projects with screens. `export` falls back to stored screen IDs from `.stitch.json`. Always use `stitch.sh generate` (not raw Gemini CLI) to ensure IDs are tracked
