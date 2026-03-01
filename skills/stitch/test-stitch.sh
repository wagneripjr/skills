#!/bin/bash
# test-stitch.sh — Unit tests for stitch.sh (no external calls)
#
# Usage: bash test-stitch.sh
#
# Unit tests mock external commands. Integration tests require gemini CLI + stitch.
# Run integration tests in /tmp to avoid polluting project dirs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STITCH="$SCRIPT_DIR/stitch.sh"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }

assert_exit_code() {
    local description="$1"
    local expected="$2"
    shift 2
    local actual
    set +e
    "$@" >/dev/null 2>&1
    actual=$?
    set -e
    if [ "$actual" -eq "$expected" ]; then
        green "PASS: $description (exit $actual)"
        PASS=$((PASS + 1))
    else
        red "FAIL: $description (expected exit $expected, got $actual)"
        FAIL=$((FAIL + 1))
    fi
}

assert_output_contains() {
    local description="$1"
    local expected="$2"
    shift 2
    local output
    set +e
    output=$("$@" 2>&1)
    set -e
    if echo "$output" | grep -qF "$expected"; then
        green "PASS: $description"
        PASS=$((PASS + 1))
    else
        red "FAIL: $description (expected output to contain '$expected')"
        red "  Got: $(echo "$output" | head -3)"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Unit Tests (no external calls) ==="
echo ""

# Test 1: No arguments shows usage
assert_exit_code "No arguments exits with 1" 1 bash "$STITCH"
assert_output_contains "No arguments shows usage" "Usage:" bash "$STITCH"

# Test 2: Invalid command
assert_exit_code "Invalid command exits with 1" 1 bash "$STITCH" invalid-command

# Test 3: Create without title
assert_output_contains "Create without title shows usage" "Usage:" bash "$STITCH" create

# Test 4: Edit without args
assert_output_contains "Edit without args shows usage" "Usage:" bash "$STITCH" edit

# Test 5: Generate without prompt
assert_output_contains "Generate without prompt shows usage" "Usage:" bash "$STITCH" generate

# Test 6: Link without project ID
assert_output_contains "Link without pid shows usage" "Usage:" bash "$STITCH" link

# Test 8: Unlink when no config exists
assert_output_contains "Unlink with no config says not found" "No .stitch.json found" bash "$STITCH" unlink

# Test 9: Link creates .stitch.json
TMPDIR_TEST=$(mktemp -d)
(
    cd "$TMPDIR_TEST"
    bash "$STITCH" link 12345 "Test Project" >/dev/null 2>&1
    if [ -f ".stitch.json" ] && grep -q "12345" .stitch.json; then
        green "PASS: Link creates .stitch.json with project ID"
        echo "PASS" > "$TMPDIR_TEST/_result"
    else
        red "FAIL: Link did not create .stitch.json correctly"
        echo "FAIL" > "$TMPDIR_TEST/_result"
    fi
)
if [ "$(cat "$TMPDIR_TEST/_result" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Test 10: Link appends GEMINI.md
(
    cd "$TMPDIR_TEST"
    if [ -f "GEMINI.md" ] && grep -q "Stitch Design System" GEMINI.md; then
        green "PASS: Link appends Stitch section to GEMINI.md"
        echo "PASS" > "$TMPDIR_TEST/_result2"
    else
        red "FAIL: Link did not append to GEMINI.md"
        echo "FAIL" > "$TMPDIR_TEST/_result2"
    fi
)
if [ "$(cat "$TMPDIR_TEST/_result2" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Test 11: Unlink removes .stitch.json
(
    cd "$TMPDIR_TEST"
    bash "$STITCH" unlink >/dev/null 2>&1
    if [ ! -f ".stitch.json" ]; then
        green "PASS: Unlink removes .stitch.json"
        echo "PASS" > "$TMPDIR_TEST/_result3"
    else
        red "FAIL: Unlink did not remove .stitch.json"
        echo "FAIL" > "$TMPDIR_TEST/_result3"
    fi
)
if [ "$(cat "$TMPDIR_TEST/_result3" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

rm -rf "$TMPDIR_TEST"

# --- Screen ID tracking tests ---
echo ""
echo "=== Screen ID Tracking Tests ==="
echo ""

# Test 12: Link creates .stitch.json with screens array
TMPDIR_TEST2=$(mktemp -d)
(
    cd "$TMPDIR_TEST2"
    bash "$STITCH" link 99999 "Screen Test" >/dev/null 2>&1
    if jq -e '.screens | type == "array"' .stitch.json >/dev/null 2>&1; then
        green "PASS: Link creates .stitch.json with screens array"
        echo "PASS" > "$TMPDIR_TEST2/_result"
    else
        red "FAIL: .stitch.json missing screens array"
        echo "FAIL" > "$TMPDIR_TEST2/_result"
    fi
)
if [ "$(cat "$TMPDIR_TEST2/_result" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Helper: run add_screen_id or read_screen_ids via a temporary script
# (avoids fragile sed-based function extraction)
run_stitch_fn() {
    local fn_name="$1"
    shift
    local args=("$@")
    # Extract everything from STITCH_CONFIG= through the helper functions (before cmd_ functions)
    bash -c "
        set -euo pipefail
        STITCH_CONFIG='.stitch.json'
        $(sed -n '/^add_screen_id()/,/^}$/p' "$STITCH")
        $(sed -n '/^read_screen_ids()/,/^}$/p' "$STITCH")
        $fn_name ${args[*]:-}
    "
}

# Test 13: add_screen_id appends to screens array
(
    cd "$TMPDIR_TEST2"
    run_stitch_fn add_screen_id "abc1234"
    if jq -e '.screens | index("abc1234")' .stitch.json >/dev/null 2>&1; then
        green "PASS: add_screen_id appends screen ID"
        echo "PASS" > "$TMPDIR_TEST2/_result2"
    else
        red "FAIL: add_screen_id did not append screen ID"
        echo "FAIL" > "$TMPDIR_TEST2/_result2"
    fi
)
if [ "$(cat "$TMPDIR_TEST2/_result2" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Test 14: add_screen_id deduplicates
(
    cd "$TMPDIR_TEST2"
    run_stitch_fn add_screen_id "abc1234"  # already added in test 13
    count=$(jq '[.screens[] | select(. == "abc1234")] | length' .stitch.json)
    if [ "$count" -eq 1 ]; then
        green "PASS: add_screen_id deduplicates"
        echo "PASS" > "$TMPDIR_TEST2/_result3"
    else
        red "FAIL: add_screen_id duplicated (count=$count)"
        echo "FAIL" > "$TMPDIR_TEST2/_result3"
    fi
)
if [ "$(cat "$TMPDIR_TEST2/_result3" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Test 15: add_screen_id adds multiple distinct IDs
(
    cd "$TMPDIR_TEST2"
    run_stitch_fn add_screen_id "def5678"
    count=$(jq '.screens | length' .stitch.json)
    if [ "$count" -eq 2 ]; then
        green "PASS: add_screen_id stores multiple distinct IDs"
        echo "PASS" > "$TMPDIR_TEST2/_result4"
    else
        red "FAIL: expected 2 screens, got $count"
        echo "FAIL" > "$TMPDIR_TEST2/_result4"
    fi
)
if [ "$(cat "$TMPDIR_TEST2/_result4" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Test 16: read_screen_ids returns stored IDs
(
    cd "$TMPDIR_TEST2"
    ids=$(run_stitch_fn read_screen_ids)
    if echo "$ids" | grep -q "abc1234" && echo "$ids" | grep -q "def5678"; then
        green "PASS: read_screen_ids returns stored IDs"
        echo "PASS" > "$TMPDIR_TEST2/_result5"
    else
        red "FAIL: read_screen_ids did not return expected IDs"
        echo "FAIL" > "$TMPDIR_TEST2/_result5"
    fi
)
if [ "$(cat "$TMPDIR_TEST2/_result5" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

# Test 17: add_screen_id handles legacy .stitch.json without screens field
(
    cd "$TMPDIR_TEST2"
    echo '{"projectId":"11111","title":"Legacy"}' > .stitch.json
    run_stitch_fn add_screen_id "legacy01"
    if jq -e '.screens | index("legacy01")' .stitch.json >/dev/null 2>&1; then
        green "PASS: add_screen_id handles legacy config without screens"
        echo "PASS" > "$TMPDIR_TEST2/_result6"
    else
        red "FAIL: add_screen_id failed on legacy config"
        echo "FAIL" > "$TMPDIR_TEST2/_result6"
    fi
)
if [ "$(cat "$TMPDIR_TEST2/_result6" 2>/dev/null)" = "PASS" ]; then
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
fi

rm -rf "$TMPDIR_TEST2"

echo ""
echo "=== Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
