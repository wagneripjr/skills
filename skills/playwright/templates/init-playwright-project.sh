#!/usr/bin/env bash
# Initialize a Playwright project with Agents support for Claude Code
# Usage: ./init-playwright-project.sh [project-dir]
set -euo pipefail

PROJECT_DIR="${1:-.}"

echo "=== Playwright Project Setup ==="
echo "Directory: $PROJECT_DIR"
echo ""

# Step 1: Check Node.js
echo "--- Checking Node.js ---"
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js not found. Install via volta: volta install node"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "Node.js: $NODE_VERSION"

# Step 2: Check npm
echo ""
echo "--- Checking npm ---"
if ! command -v npm &>/dev/null; then
    echo "ERROR: npm not found"
    exit 1
fi
echo "npm: $(npm --version)"

# Step 3: Initialize Playwright (if not already set up)
echo ""
echo "--- Setting up Playwright ---"
cd "$PROJECT_DIR"

if [ ! -f "playwright.config.ts" ] && [ ! -f "playwright.config.js" ]; then
    echo "No playwright config found. Initializing..."
    npm init playwright@latest -- --yes
else
    echo "Playwright config already exists. Updating..."
    npm install -D @playwright/test@latest
fi

# Step 4: Install browser binaries
echo ""
echo "--- Installing Chromium ---"
npx playwright install chromium

# Step 5: Install AI-optimized CLI (optional)
echo ""
echo "--- Installing Playwright CLI ---"
if ! command -v playwright-cli &>/dev/null; then
    npm install -g @playwright/mcp@latest
    echo "playwright-cli installed"
else
    echo "playwright-cli already installed: $(playwright-cli --version 2>/dev/null || echo 'ok')"
fi

# Step 6: Initialize Playwright Agents for Claude Code
echo ""
echo "--- Initializing Playwright Agents ---"
PW_VERSION=$(npx playwright --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
PW_MAJOR=$(echo "$PW_VERSION" | cut -d. -f1)
PW_MINOR=$(echo "$PW_VERSION" | cut -d. -f2)

if [ "$PW_MAJOR" -gt 1 ] || { [ "$PW_MAJOR" -eq 1 ] && [ "$PW_MINOR" -ge 56 ]; }; then
    npx playwright init-agents --loop=claude
    echo "Agents initialized for Claude Code"
else
    echo "WARNING: Playwright $PW_VERSION < 1.56 - Agents not available"
    echo "Agents require Playwright 1.56+. Run: npm install -D @playwright/test@latest"
fi

# Step 7: Create seed test if not exists
echo ""
echo "--- Checking seed test ---"
if [ ! -f "tests/seed.spec.ts" ]; then
    mkdir -p tests
    cat > tests/seed.spec.ts << 'SEED'
import { test, expect } from '@playwright/test';

test.describe('App Seed', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Update with your app's URL
    await page.goto('http://localhost:3000');
  });

  test('app loads successfully', async ({ page }) => {
    // TODO: Update with your app's expected title
    await expect(page).toHaveTitle(/.+/);
  });
});
SEED
    echo "Created tests/seed.spec.ts (update with your app's URL and title)"
else
    echo "Seed test already exists"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Update tests/seed.spec.ts with your app's URL"
echo "  2. Start your app (e.g., npm run dev)"
echo "  3. In Claude Code:"
echo "     - 'Use the Planner to create a test plan for [feature]'"
echo "     - 'Use the Generator to create tests from specs/[plan].md'"
echo "     - 'npx playwright test' to run tests"
echo "     - 'Use the Healer to fix [failing test]'"
