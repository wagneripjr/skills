#!/usr/bin/env bash
# Headless form filling with playwright-cli
# Usage: ./cli-form-automation.sh <url>
set -euo pipefail

URL="${1:?Usage: $0 <url>}"

echo "=== Playwright CLI Form Automation ==="
echo "URL: $URL"
echo ""

# Check playwright-cli is available
if ! command -v playwright-cli &>/dev/null; then
    echo "ERROR: playwright-cli not found"
    echo "Install: npm install -g @playwright/mcp@latest"
    exit 1
fi

# Step 1: Navigate to the form
echo "--- Navigating ---"
playwright-cli open "$URL"

# Step 2: Take initial snapshot to discover form elements
echo ""
echo "--- Snapshot (interactive elements) ---"
playwright-cli snapshot
echo ""
echo "Use the refs above (e1, e2, ...) to fill the form:"
echo ""
echo "  playwright-cli fill e1 \"value\"      # Fill input"
echo "  playwright-cli select e2 \"option\"   # Select dropdown"
echo "  playwright-cli check e3              # Check checkbox"
echo "  playwright-cli click e4              # Click button"
echo ""
echo "After interaction, re-snapshot to verify:"
echo "  playwright-cli snapshot"
echo ""
echo "Take a screenshot for evidence:"
echo "  playwright-cli screenshot --filename=form-result.png"
echo ""
echo "Close when done:"
echo "  playwright-cli close"
