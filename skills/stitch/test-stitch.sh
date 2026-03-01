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

echo ""
echo "=== Results ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
