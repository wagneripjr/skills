#!/bin/bash
# Test suite for gemini-web.sh wrapper script and redirect-websearch.sh hook
# Run: bash skills/gemini-web/test-gemini-web.sh
#
# Unit tests require no API key. Integration tests require GEMINI_API_KEY.
# Hook tests require config/.claude/hooks/redirect-websearch.sh to exist.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/gemini-web.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK_SCRIPT="$REPO_ROOT/config/.claude/hooks/redirect-websearch.sh"

PASS=0
FAIL=0
SKIP=0

pass() { ((PASS++)); echo "  PASS: $1"; }
fail() { ((FAIL++)); echo "  FAIL: $1 — $2"; }
skip() { ((SKIP++)); echo "  SKIP: $1 — $2"; }

# ==============================================================================
# UNIT TESTS (no API key needed)
# ==============================================================================
echo "=== Unit Tests ==="

# test_missing_mode: no args → exit 1, stderr contains "Usage"
test_missing_mode() {
    local stderr
    stderr=$("$SCRIPT" 2>&1)
    local rc=$?
    if [ $rc -eq 1 ] && echo "$stderr" | grep -qi "usage"; then
        pass "test_missing_mode"
    else
        fail "test_missing_mode" "exit=$rc, expected 1; stderr: $stderr"
    fi
}

# test_invalid_mode: badmode → exit 1, stderr contains "Invalid mode"
test_invalid_mode() {
    local stderr
    stderr=$("$SCRIPT" badmode "some query" 2>&1)
    local rc=$?
    if [ $rc -eq 1 ] && echo "$stderr" | grep -qi "invalid mode"; then
        pass "test_invalid_mode"
    else
        fail "test_invalid_mode" "exit=$rc, expected 1; stderr: $stderr"
    fi
}

# test_missing_query: search with no query → exit 1, stderr contains "Usage"
test_missing_query() {
    local stderr
    stderr=$("$SCRIPT" search 2>&1)
    local rc=$?
    if [ $rc -eq 1 ] && echo "$stderr" | grep -qi "usage"; then
        pass "test_missing_query"
    else
        fail "test_missing_query" "exit=$rc, expected 1; stderr: $stderr"
    fi
}

# test_scrape_no_urls: scrape with prompt but no URLs → exit 1, stderr mentions URL
test_scrape_no_urls() {
    local stderr
    stderr=$("$SCRIPT" scrape "extract title" 2>&1)
    local rc=$?
    if [ $rc -eq 1 ] && echo "$stderr" | grep -qi "url"; then
        pass "test_scrape_no_urls"
    else
        fail "test_scrape_no_urls" "exit=$rc, expected 1; stderr: $stderr"
    fi
}

# test_missing_api_key: unset GEMINI_API_KEY + no secrets file → exit 1, stderr contains "GEMINI_API_KEY"
test_missing_api_key() {
    local stderr
    # Use HOME=/nonexistent to prevent sourcing ~/.claude-secrets.sh
    stderr=$(HOME=/nonexistent GEMINI_API_KEY="" "$SCRIPT" search "test query" 2>&1)
    local rc=$?
    if [ $rc -eq 1 ] && echo "$stderr" | grep -q "GEMINI_API_KEY"; then
        pass "test_missing_api_key"
    else
        fail "test_missing_api_key" "exit=$rc, expected 1; stderr: $(echo "$stderr" | head -1)"
    fi
}

test_missing_mode
test_invalid_mode
test_missing_query
test_scrape_no_urls
test_missing_api_key

# ==============================================================================
# INTEGRATION TESTS (require GEMINI_API_KEY)
# ==============================================================================
echo ""
echo "=== Integration Tests ==="

if [ -z "${GEMINI_API_KEY:-}" ]; then
    echo "  GEMINI_API_KEY not set — skipping integration tests"
    echo "  Set it and re-run to test API calls"
    SKIP=$((SKIP + 5))
else
    # test_search_returns_text: search mode returns non-empty text
    test_search_returns_text() {
        local stdout
        stdout=$("$SCRIPT" search "what is 2+2" 2>/dev/null)
        local rc=$?
        if [ $rc -eq 0 ] && [ -n "$stdout" ]; then
            pass "test_search_returns_text"
        else
            fail "test_search_returns_text" "exit=$rc, stdout length=${#stdout}"
        fi
    }

    # test_search_returns_sources: search output contains sources section
    test_search_returns_sources() {
        local stdout
        stdout=$("$SCRIPT" search "latest Rust programming language version" 2>/dev/null)
        local rc=$?
        if [ $rc -eq 0 ] && echo "$stdout" | grep -q "Sources"; then
            pass "test_search_returns_sources"
        else
            fail "test_search_returns_sources" "exit=$rc, no Sources section in output"
        fi
    }

    # test_research_returns_text: research mode returns non-empty text
    test_research_returns_text() {
        local stdout
        stdout=$("$SCRIPT" research "compare Python vs Go for web services" 2>/dev/null)
        local rc=$?
        if [ $rc -eq 0 ] && [ -n "$stdout" ]; then
            pass "test_research_returns_text"
        else
            fail "test_research_returns_text" "exit=$rc, stdout length=${#stdout}"
        fi
    }

    # test_scrape_returns_text: scrape mode returns non-empty text
    test_scrape_returns_text() {
        local stdout
        stdout=$("$SCRIPT" scrape "extract the page title" "https://example.com" 2>/dev/null)
        local rc=$?
        if [ $rc -eq 0 ] && [ -n "$stdout" ]; then
            pass "test_scrape_returns_text"
        else
            fail "test_scrape_returns_text" "exit=$rc, stdout length=${#stdout}"
        fi
    }

    # test_search_handles_special_chars: query with quotes, dollars, backticks
    test_search_handles_special_chars() {
        local stdout
        stdout=$("$SCRIPT" search 'what is the "best" way to learn $programming?' 2>/dev/null)
        local rc=$?
        if [ $rc -eq 0 ] && [ -n "$stdout" ]; then
            pass "test_search_handles_special_chars"
        else
            fail "test_search_handles_special_chars" "exit=$rc, stdout length=${#stdout}"
        fi
    }

    test_search_returns_text
    test_search_returns_sources
    test_research_returns_text
    test_scrape_returns_text
    test_search_handles_special_chars
fi

# ==============================================================================
# HOOK TESTS (for redirect-websearch.sh)
# ==============================================================================
echo ""
echo "=== Hook Tests ==="

if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "  Hook script not found at $HOOK_SCRIPT — skipping"
    SKIP=$((SKIP + 1))
else
    # test_hook_denies_websearch: hook outputs deny with reason
    test_hook_denies_websearch() {
        local stdout
        stdout=$(echo '{"tool_name":"WebSearch","tool_input":{"query":"test"}}' | bash "$HOOK_SCRIPT" 2>/dev/null)
        local rc=$?
        if echo "$stdout" | grep -q '"deny"' && echo "$stdout" | grep -q "gemini-web"; then
            pass "test_hook_denies_websearch"
        else
            fail "test_hook_denies_websearch" "exit=$rc, stdout: $stdout"
        fi
    }

    test_hook_denies_websearch
fi

# ==============================================================================
# RESULTS
# ==============================================================================
echo ""
echo "=== Results ==="
echo "  $PASS passed, $FAIL failed, $SKIP skipped"
[ $FAIL -eq 0 ] || exit 1
