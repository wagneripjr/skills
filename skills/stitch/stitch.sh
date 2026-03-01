#!/bin/bash
# stitch.sh — Gemini CLI + Stitch extension wrapper for web design
# Co-located with SKILL.md, runs via ${CLAUDE_PLUGIN_ROOT}
#
# Usage:
#   stitch.sh check                              # Verify prerequisites
#   stitch.sh link <project-id> [title]          # Link project to current dir
#   stitch.sh unlink                             # Unlink project
#   stitch.sh create "Title"                     # Create new Stitch project
#   stitch.sh generate "prompt" [options]         # Generate a screen
#   stitch.sh edit <screen-id> "prompt" [options] # Edit a screen
#   stitch.sh export [options]                    # Export code to files
#
# Exit codes: 0=success, 1=error, 2=prerequisite-missing

set -euo pipefail

STITCH_CONFIG=".stitch.json"
GEMINI_MD="GEMINI.md"

# --- Prerequisite checks ---

check_gemini() {
    if ! command -v gemini >/dev/null 2>&1; then
        cat >&2 <<'INSTALL'
ERROR: Gemini CLI not found.

Install Gemini CLI:
  npm install -g @google/gemini-cli
  # or
  brew install gemini-cli

Then authenticate:
  gemini  # (first run opens browser for Google login)
  # or export GEMINI_API_KEY="your-key"
INSTALL
        exit 2
    fi
}

check_stitch_extension() {
    if ! gemini extensions list 2>&1 | grep -qi stitch; then
        cat >&2 <<'INSTALL'
ERROR: Stitch extension not found in Gemini CLI.

Install:
  gemini extensions install https://github.com/gemini-cli-extensions/stitch --auto-update

Authenticate Stitch (choose one):
  A) API Key:
     1. Go to stitch.withgoogle.com > Profile > Settings > API Keys > Create Key
     2. Run:
        export API_KEY="your-key"
        sed "s/YOUR_API_KEY/$API_KEY/g" \
          ~/.gemini/extensions/Stitch/gemini-extension-apikey.json \
          > ~/.gemini/extensions/Stitch/gemini-extension.json

  B) Google Cloud ADC:
     gcloud auth application-default login
     gcloud beta services mcp enable stitch.googleapis.com --project=YOUR_PROJECT
INSTALL
        exit 2
    fi
}

# --- Project linking ---

read_project_id() {
    local pid_flag="${1:-}"
    if [ -n "$pid_flag" ]; then
        echo "$pid_flag"
    elif [ -f "$STITCH_CONFIG" ]; then
        jq -r '.projectId // empty' "$STITCH_CONFIG" 2>/dev/null
    fi
}

require_project_id() {
    local pid
    pid=$(read_project_id "${1:-}")
    if [ -z "$pid" ]; then
        echo "ERROR: No project linked. Run 'stitch.sh link <project-id>' or pass --pid <id>." >&2
        exit 1
    fi
    echo "$pid"
}

write_stitch_json() {
    local pid="$1"
    local title="${2:-}"
    jq -n --arg pid "$pid" --arg title "$title" \
        '{projectId: $pid, title: $title, screens: []}' > "$STITCH_CONFIG"
    echo "Linked project $pid to $STITCH_CONFIG"
}

add_screen_id() {
    local screen_id="$1"
    if [ -z "$screen_id" ] || [ ! -f "$STITCH_CONFIG" ]; then
        return 1
    fi
    # Append if not already present (deduplicate)
    local tmp
    tmp=$(jq --arg sid "$screen_id" \
        'if .screens then
            if (.screens | index($sid)) then . else .screens += [$sid] end
         else
            .screens = [$sid]
         end' "$STITCH_CONFIG")
    echo "$tmp" > "$STITCH_CONFIG"
}

read_screen_ids() {
    if [ -f "$STITCH_CONFIG" ]; then
        jq -r '.screens // [] | .[]' "$STITCH_CONFIG" 2>/dev/null
    fi
}

append_gemini_md() {
    local pid="$1"
    local title="${2:-}"
    local marker="## Stitch Design System"

    if [ -f "$GEMINI_MD" ] && grep -qF "$marker" "$GEMINI_MD"; then
        echo "GEMINI.md already has Stitch section, skipping." >&2
        return
    fi

    cat >> "$GEMINI_MD" <<EOF

$marker
- Stitch Project ID: $pid
- Project: $title
- Use Stitch tools to manage screens in this project
- Match the existing design system when generating new screens
EOF
    echo "Appended Stitch section to $GEMINI_MD"
}

# --- Core execution ---

run_gemini() {
    local prompt="$1"
    gemini -p "$prompt" --yolo 2>&1
    return $?
}

# --- Argument parsing helpers ---

parse_opts() {
    PID_FLAG=""
    DEVICE="DESKTOP"
    FORMAT="html"
    OUTPUT_DIR="./stitch-export"

    while [ $# -gt 0 ]; do
        case "$1" in
            --pid)      PID_FLAG="$2"; shift 2 ;;
            --device)   DEVICE="$(echo "$2" | tr '[:lower:]' '[:upper:]')"; shift 2 ;;
            --format)   FORMAT="$2"; shift 2 ;;
            --dir)      OUTPUT_DIR="$2"; shift 2 ;;
            *)          echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done
}

# --- Commands ---

cmd_check() {
    echo "Checking prerequisites..."
    check_gemini
    echo "  Gemini CLI: $(gemini --version 2>/dev/null || echo 'installed')"
    check_stitch_extension
    echo "  Stitch extension: installed"

    echo "Verifying Stitch auth (listing projects)..."
    local result
    result=$(run_gemini "Use Stitch to list all my projects. Show project name and ID for each. If there are no projects, say 'No projects found'.")
    echo "$result"
    echo ""
    echo "All checks passed."
}

cmd_link() {
    local pid="${1:-}"
    if [ -z "$pid" ]; then
        echo "Usage: stitch.sh link <project-id>" >&2
        exit 1
    fi
    local title="${2:-}"
    write_stitch_json "$pid" "$title"
    append_gemini_md "$pid" "$title"
}

cmd_unlink() {
    if [ -f "$STITCH_CONFIG" ]; then
        rm "$STITCH_CONFIG"
        echo "Removed $STITCH_CONFIG. Clean GEMINI.md manually if needed."
    else
        echo "No $STITCH_CONFIG found." >&2
    fi
}

cmd_create() {
    local title="${1:-}"
    if [ -z "$title" ]; then
        echo "Usage: stitch.sh create \"Project Title\"" >&2
        exit 1
    fi

    check_gemini

    local result
    result=$(run_gemini "Use Stitch to create a new project titled '$title'. After creating it, return ONLY the numeric project ID on a single line, nothing else.")
    echo "$result"

    # Auto-link if no .stitch.json exists
    local pid
    pid=$(echo "$result" | grep -oE '[0-9]{10,}' | head -1)
    if [ -n "$pid" ] && [ ! -f "$STITCH_CONFIG" ]; then
        write_stitch_json "$pid" "$title"
        append_gemini_md "$pid" "$title"
        echo "Auto-linked project $pid"
    fi
}

cmd_generate() {
    local prompt="${1:-}"
    if [ -z "$prompt" ]; then
        echo "Usage: stitch.sh generate \"prompt\" [--device X] [--pid X]" >&2
        exit 1
    fi
    shift
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini

    local result
    result=$(run_gemini "Use Stitch to generate a new screen in project $pid. Device type: $DEVICE.

Screen description: $prompt

After generating, show the screen ID and a brief summary of what was created.")
    echo "$result"

    # Capture screen ID (hex string, typically 7+ chars) and store in .stitch.json
    local screen_id
    screen_id=$(echo "$result" | grep -oE '[0-9a-f]{7,}' | head -1)
    if [ -n "$screen_id" ]; then
        add_screen_id "$screen_id"
        echo "Tracked screen $screen_id in $STITCH_CONFIG"
    fi
}

cmd_edit() {
    local screen_id="${1:-}"
    local prompt="${2:-}"
    if [ -z "$screen_id" ] || [ -z "$prompt" ]; then
        echo "Usage: stitch.sh edit <screen-id> \"prompt\" [--pid X]" >&2
        exit 1
    fi
    shift 2
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini

    run_gemini "Use Stitch to edit screen $screen_id in project $pid. Apply these changes: $prompt

After editing, confirm what was changed."
}

cmd_export() {
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini

    local format_instruction
    case "$FORMAT" in
        html)   format_instruction="Export as clean HTML with inline CSS or Tailwind classes." ;;
        react)  format_instruction="Export as React components with Tailwind CSS." ;;
        *)      format_instruction="Export as $FORMAT." ;;
    esac

    local ext
    case "$FORMAT" in
        html)   ext="html" ;;
        react)  ext="tsx" ;;
        *)      ext="$FORMAT" ;;
    esac

    # Try listing all screens first
    local result
    result=$(run_gemini "Use Stitch to get all screens in project $pid. For each screen:
1. Get the screen code ($FORMAT format)
2. Save each screen as a separate file in the directory: $OUTPUT_DIR/
3. Use the screen name or a descriptive filename

$format_instruction

Create the output directory if it doesn't exist. After exporting, list all files created with their paths.")
    echo "$result"

    # Fallback: if list_screens returned no screens, use stored screen IDs
    if echo "$result" | grep -qiE "(no screens|does not contain|0 screens|empty|not found)"; then
        local stored_ids
        stored_ids=$(read_screen_ids)
        if [ -n "$stored_ids" ]; then
            echo ""
            echo "list_screens returned empty. Falling back to stored screen IDs..."
            mkdir -p "$OUTPUT_DIR"
            while IFS= read -r sid; do
                echo "Fetching screen $sid..."
                run_gemini "Use Stitch to get screen $sid from project $pid. $format_instruction Save the code to $OUTPUT_DIR/${sid}.$ext"
            done <<< "$stored_ids"
            echo "Fallback export complete. Check $OUTPUT_DIR/ for files."
        else
            echo ""
            echo "No stored screen IDs in $STITCH_CONFIG. Generate screens first with 'stitch.sh generate'." >&2
        fi
    fi
}

# --- Main ---

if [ $# -lt 1 ]; then
    cat >&2 <<'USAGE'
Usage: stitch.sh <command> [args...]

Commands:
  check                                  Verify Gemini CLI + Stitch extension
  link <project-id> [title]              Link Stitch project to current dir
  unlink                                 Unlink Stitch project
  create "Title"                         Create new Stitch project
  generate "prompt" [--device X] [--pid X]
                                         Generate a screen from text
  edit <screen-id> "prompt" [--pid X]    Edit an existing screen
  export [--format html|react] [--dir ./out] [--pid X]
                                         Export screens to local files
USAGE
    exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
    check)          cmd_check ;;
    link)           cmd_link "$@" ;;
    unlink)         cmd_unlink ;;
    create)         cmd_create "$@" ;;
    generate)       cmd_generate "$@" ;;
    edit)           cmd_edit "$@" ;;
    export)         cmd_export "$@" ;;
    *)
        echo "ERROR: Unknown command '$COMMAND'. Run 'stitch.sh' for usage." >&2
        exit 1
        ;;
esac
