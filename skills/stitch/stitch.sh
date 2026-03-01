#!/bin/bash
# stitch.sh — Gemini CLI + Stitch extension wrapper for web design
# Co-located with SKILL.md, runs via ${CLAUDE_PLUGIN_ROOT}
#
# Usage:
#   stitch.sh check                              # Verify prerequisites
#   stitch.sh link <project-id>                  # Link project to current dir
#   stitch.sh unlink                             # Unlink project
#   stitch.sh create "Title"                     # Create new Stitch project
#   stitch.sh list                               # List all projects
#   stitch.sh screens [--pid X]                  # List screens in a project
#   stitch.sh generate "prompt" [options]         # Generate a screen
#   stitch.sh edit <screen-id> "prompt" [options] # Edit a screen
#   stitch.sh variants <screen-id> "prompt" [opts] # Generate variants
#   stitch.sh export [options]                    # Export code to files
#   stitch.sh design-system [options]             # Generate DESIGN.md
#
# Exit codes: 0=success, 1=error, 2=prerequisite-missing

set -euo pipefail

STITCH_CONFIG=".stitch.json"
GEMINI_MD="GEMINI.md"
GEMINI_TIMEOUT="${STITCH_TIMEOUT:-180}"

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
    if ! gemini extensions list 2>/dev/null | grep -qi stitch; then
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
        '{projectId: $pid, title: $title}' > "$STITCH_CONFIG"
    echo "Linked project $pid to $STITCH_CONFIG"
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
    timeout "$GEMINI_TIMEOUT" gemini -p "$prompt" --yolo 2>&1
    return $?
}

# --- Argument parsing helpers ---

parse_opts() {
    PID_FLAG=""
    DEVICE="DESKTOP"
    MODEL=""
    COUNT="3"
    RANGE="EXPLORE"
    FORMAT="html"
    OUTPUT_DIR="./stitch-export"
    OUTPUT_FILE="DESIGN.md"

    while [ $# -gt 0 ]; do
        case "$1" in
            --pid)      PID_FLAG="$2"; shift 2 ;;
            --device)   DEVICE="$(echo "$2" | tr '[:lower:]' '[:upper:]')"; shift 2 ;;
            --model)    MODEL="$2"; shift 2 ;;
            --count)    COUNT="$2"; shift 2 ;;
            --range)    RANGE="$(echo "$2" | tr '[:lower:]' '[:upper:]')"; shift 2 ;;
            --format)   FORMAT="$2"; shift 2 ;;
            --dir)      OUTPUT_DIR="$2"; shift 2 ;;
            --output)   OUTPUT_FILE="$2"; shift 2 ;;
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

cmd_list() {
    check_gemini
    run_gemini "Use Stitch to list all my projects. For each project, show: project name, numeric project ID, and number of screens. Format as a table."
}

cmd_screens() {
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini
    run_gemini "Use Stitch to list all screens in project $pid. For each screen, show: screen name or title, screen ID, and device type. Format as a table."
}

cmd_generate() {
    local prompt="${1:-}"
    if [ -z "$prompt" ]; then
        echo "Usage: stitch.sh generate \"prompt\" [--device X] [--model X] [--pid X]" >&2
        exit 1
    fi
    shift
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini

    local model_instruction=""
    if [ -n "$MODEL" ]; then
        model_instruction="Use the $MODEL model."
    fi

    run_gemini "Use Stitch to generate a new screen in project $pid. Device type: $DEVICE. $model_instruction

Screen description: $prompt

After generating, show the screen ID and a brief summary of what was created."
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

cmd_variants() {
    local screen_id="${1:-}"
    local prompt="${2:-}"
    if [ -z "$screen_id" ] || [ -z "$prompt" ]; then
        echo "Usage: stitch.sh variants <screen-id> \"prompt\" [--count N] [--range X] [--pid X]" >&2
        exit 1
    fi
    shift 2
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini

    run_gemini "Use Stitch to generate $COUNT variants of screen $screen_id in project $pid.
Variation range: $RANGE (REFINE=subtle, EXPLORE=moderate, REIMAGINE=dramatic).
Focus on: $prompt

After generating, list each variant's ID and describe the key differences."
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

    run_gemini "Use Stitch to get all screens in project $pid. For each screen:
1. Get the screen code ($FORMAT format)
2. Save each screen as a separate file in the directory: $OUTPUT_DIR/
3. Use the screen name or a descriptive filename

$format_instruction

Create the output directory if it doesn't exist. After exporting, list all files created with their paths."
}

cmd_design_system() {
    parse_opts "$@"
    local pid
    pid=$(require_project_id "$PID_FLAG")
    check_gemini

    run_gemini "Use Stitch to analyze project $pid. Extract the complete design system:
- Color palette (primary, secondary, accent, neutrals — with hex codes)
- Typography (font families, sizes, weights, line heights)
- Spacing scale
- Border radius values
- Shadow definitions
- Component patterns (buttons, cards, inputs, navigation, etc.)

Write a comprehensive $OUTPUT_FILE file documenting the design system. Use markdown format with code examples showing CSS/Tailwind usage for each token."
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
  list                                   List all Stitch projects
  screens [--pid X]                      List screens in linked project
  generate "prompt" [--device X] [--model X] [--pid X]
                                         Generate a screen from text
  edit <screen-id> "prompt" [--pid X]    Edit an existing screen
  variants <screen-id> "prompt" [--count N] [--range X] [--pid X]
                                         Generate design variants
  export [--format html|react] [--dir ./out] [--pid X]
                                         Export screens to local files
  design-system [--output DESIGN.md] [--pid X]
                                         Generate design system documentation

Environment:
  STITCH_TIMEOUT   Gemini command timeout in seconds (default: 180)
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
    list)           cmd_list ;;
    screens)        cmd_screens "$@" ;;
    generate)       cmd_generate "$@" ;;
    edit)           cmd_edit "$@" ;;
    variants)       cmd_variants "$@" ;;
    export)         cmd_export "$@" ;;
    design-system)  cmd_design_system "$@" ;;
    *)
        echo "ERROR: Unknown command '$COMMAND'. Run 'stitch.sh' for usage." >&2
        exit 1
        ;;
esac
