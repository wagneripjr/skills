#!/bin/bash
# gemini-web.sh — Gemini API wrapper for web search, research, and URL scraping
# Co-located with SKILL.md, runs via ${CLAUDE_PLUGIN_ROOT}
#
# Usage:
#   gemini-web.sh search "query"                    # Quick search (~9s)
#   gemini-web.sh research "query"                  # Deep research (~45-60s)
#   gemini-web.sh scrape "prompt" url1 [url2 ...]   # URL scraping (~5-30s)
#
# Exit codes: 0=success, 1=error, 2=rate-limit-exhausted

set -euo pipefail

TMPFILE="/tmp/gemini-req-$$.json"
trap 'rm -f "$TMPFILE"' EXIT

# Source secrets if API key not already in environment
if [ -z "${GEMINI_API_KEY:-}" ] && [ -f "$HOME/.claude-secrets.sh" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.claude-secrets.sh"
fi

# Validate API key
if [ -z "${GEMINI_API_KEY:-}" ]; then
    echo "ERROR: GEMINI_API_KEY not set. Configure via AWS SSM or export directly." >&2
    exit 1
fi

# Validate arguments
if [ $# -lt 1 ]; then
    echo "Usage: gemini-web.sh <search|research|scrape> <query> [url1 url2 ...]" >&2
    exit 1
fi

MODE="$1"
shift

if [ $# -lt 1 ]; then
    echo "Usage: gemini-web.sh <search|research|scrape> <query> [url1 url2 ...]" >&2
    exit 1
fi

QUERY="$1"
shift

# Mode → model and tools mapping
case "$MODE" in
    search)
        MODEL="gemini-3-flash-preview"
        TEMP="0.1"
        TOOLS='[{"google_search": {}}]'
        ;;
    research)
        MODEL="gemini-3.1-pro-preview"
        TEMP="0.2"
        TOOLS='[{"google_search": {}}]'
        ;;
    scrape)
        if [ $# -lt 1 ]; then
            echo "ERROR: scrape mode requires at least one URL after the prompt." >&2
            echo "Usage: gemini-web.sh scrape \"prompt\" url1 [url2 ...]" >&2
            exit 1
        fi
        MODEL="gemini-3-flash-preview"
        TEMP="0.1"
        # Build URL list with real newlines (jq --arg handles JSON escaping)
        URL_LIST=""
        for url in "$@"; do
            URL_LIST="${URL_LIST}
- ${url}"
        done
        QUERY="${QUERY}

URLs:${URL_LIST}"
        TOOLS='[{"url_context": {}}, {"google_search": {}}]'
        ;;
    *)
        echo "ERROR: Invalid mode '$MODE'. Use: search, research, or scrape." >&2
        exit 1
        ;;
esac

# Build JSON payload safely via jq (handles all special chars in query)
jq -n \
    --arg query "$QUERY" \
    --argjson tools "$TOOLS" \
    --argjson temp "$TEMP" \
    '{
        contents: [{parts: [{text: $query}]}],
        tools: $tools,
        generationConfig: {temperature: $temp}
    }' > "$TMPFILE"

API_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}"

# Retry loop with exponential backoff
MAX_RETRIES=3
for attempt in $(seq 1 $MAX_RETRIES); do
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d @"$TMPFILE")

    # Split response body and HTTP status code
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    # Check for HTTP-level errors
    if [ "$http_code" = "429" ]; then
        wait_time=$((attempt * 5))
        if [ "$attempt" -lt "$MAX_RETRIES" ]; then
            echo "Rate limited (429), waiting ${wait_time}s... (attempt $attempt/$MAX_RETRIES)" >&2
            sleep "$wait_time"
            continue
        else
            echo "ERROR: Rate limit exhausted after $MAX_RETRIES attempts." >&2
            exit 2
        fi
    fi

    if [ "$http_code" != "200" ]; then
        error_msg=$(echo "$body" | jq -r '.error.message // "Unknown error"' 2>/dev/null)
        echo "ERROR: HTTP $http_code — $error_msg" >&2
        exit 1
    fi

    # Check for API-level errors in response body
    if echo "$body" | jq -e '.error' > /dev/null 2>&1; then
        error_msg=$(echo "$body" | jq -r '.error.message // "Unknown error"')
        echo "ERROR: API error — $error_msg" >&2
        exit 1
    fi

    # Extract response text (select only text parts, skip grounding parts)
    text=$(echo "$body" | jq -r '.candidates[].content.parts[] | select(.text) | .text' 2>/dev/null)

    if [ -z "$text" ]; then
        echo "ERROR: No text in API response." >&2
        exit 1
    fi

    # Output response text
    echo "$text"

    # Extract and output source citations
    sources=$(echo "$body" | jq -r '.candidates[].groundingMetadata.groundingChunks[]?.web | "- \(.title // "Source"): \(.uri)"' 2>/dev/null)
    if [ -n "$sources" ]; then
        echo ""
        echo "--- Sources ---"
        echo "$sources"
    fi

    exit 0
done
