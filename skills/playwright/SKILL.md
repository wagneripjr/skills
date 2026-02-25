---
name: playwright
description: Use when writing end-to-end tests, generating test plans, fixing failing Playwright tests, or performing headless browser automation. Triggers include "write Playwright tests", "generate e2e tests", "create test plan", "fix failing test", "heal broken tests", "run Playwright tests", "record test from interactions", or any headless testing/automation task. NOT for interactive browsing (use Claude-in-Chrome) or quick ad-hoc scraping (use agent-browser or Gemini URL Context).
---

# Playwright: Headless Browser Testing & Automation

Headless end-to-end testing and browser automation using Microsoft Playwright's AI-optimized CLI, Test Agents (Planner, Generator, Healer), and standard test runner.

## Relationship to Other Browser Tools

| Need | Tool | Why |
|------|------|-----|
| Interactive browsing (visible browser) | **Claude-in-Chrome** | User sees browser, real-time interaction |
| Quick ad-hoc automation / scraping | **agent-browser** | Token-efficient Rust CLI, fast for simple tasks |
| Scrape URLs without a browser | **Gemini URL Context** | No browser needed, up to 20 URLs |
| Headless E2E test suites | **Playwright Test Runner** | Full framework: assertions, parallel, reports |
| AI-generated test suites | **Playwright Agents** | Planner/Generator/Healer pipeline |
| Token-efficient headless automation | **Playwright CLI** | AI-optimized, minimal output (~10-50 tokens/action) |
| Record interactions as test code | **Playwright Codegen** | Native recording engine, resilient locators |

**Key distinction**: `agent-browser` (Vercel Labs, Rust) uses `@e1` refs. `playwright-cli` (Microsoft) uses `e1` refs. Both solve similar problems. Prefer `agent-browser` for ad-hoc tasks if installed. Use Playwright for structured testing workflows and the Agents pipeline.

## Before Using This Skill

### Step 1: Check Node.js

```bash
node --version  # Requires 20.x, 22.x, or 24.x
```

### Step 2: Check Playwright Test Framework

```bash
npx playwright --version  # Requires 1.56+ for Agents
```

If not installed:
```bash
npm init playwright@latest
npx playwright install chromium  # Download browser binary
```

### Step 3: Check Playwright CLI (optional, for AI-optimized commands)

```bash
command -v playwright-cli &>/dev/null && echo "CLI available" || echo "Not installed"
```

The AI-optimized `playwright-cli` binary ships with the `@playwright/mcp` package:
```bash
npm install -g @playwright/mcp@latest
playwright-cli --help
```

> **Package naming note**: The OLD `playwright-cli` npm package (2020) is **deprecated**. The NEW AI-optimized CLI ships inside `@playwright/mcp@latest`. Don't confuse the two.

### Step 4: Initialize Playwright Agents (optional, for test generation)

```bash
npx playwright init-agents --loop=claude
```

This creates `.chatmode.md` files, a seed test, and configures the Agents pipeline for Claude Code.

## Decision Matrix

| Approach | When to Use | Token Cost |
|----------|-------------|------------|
| **Playwright CLI** (`playwright-cli`) | Ad-hoc headless automation, screenshots, form filling | ~10-50 tokens/action |
| **Playwright Agents** (Planner/Generator/Healer) | Generating test suites, healing broken tests, coverage for features | Depends on AI usage |
| **Playwright Test Runner** (`npx playwright test`) | Running existing suites, CI/CD, debugging | N/A (no LLM) |
| **Playwright Codegen** (`npx playwright codegen`) | Recording interactions as test code | N/A (no LLM) |

**Flow**: Agents *generate* tests -> Test Runner *runs* them -> Healer *fixes* failures -> repeat.

## Core Patterns: Playwright CLI

### Pattern 1: Navigate and Snapshot

```bash
playwright-cli open https://example.com --headed
playwright-cli snapshot
# Output: e1: "text: Home", e2: "input type=email", e3: "button text=Submit"
```

### Pattern 2: Form Submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot
playwright-cli fill e2 "user@example.com"
playwright-cli fill e4 "password123"
playwright-cli click e6
playwright-cli snapshot  # Re-snapshot after navigation
```

### Pattern 3: Screenshot Capture

```bash
playwright-cli open https://example.com
playwright-cli screenshot
playwright-cli screenshot --filename=evidence.png
```

### Pattern 4: JavaScript Evaluation

```bash
playwright-cli eval "document.title"
playwright-cli eval "el => el.textContent" e5
```

### Pattern 5: Dialog Handling

```bash
playwright-cli dialog-accept
playwright-cli dialog-accept "confirmation text"
playwright-cli dialog-dismiss
```

### Pattern 6: Viewport Resize

```bash
playwright-cli resize 1920 1080    # Desktop
playwright-cli resize 375 812      # Mobile (iPhone viewport)
```

## Core Patterns: Playwright Agents

### Pattern 1: Full Pipeline

```bash
# One-time setup
npm install -D @playwright/test@latest
npx playwright install chromium
npx playwright init-agents --loop=claude

# Workflow (via Claude Code natural language):
# 1. "Use the Planner to create a test plan for the login flow"
#    -> Planner explores app, creates specs/login-flow.md
#
# 2. "Use the Generator to create tests from specs/login-flow.md"
#    -> Generator produces tests/login/*.spec.ts
#
# 3. Run tests
npx playwright test

# 4. If failures: "Use the Healer to fix tests/login/invalid-creds.spec.ts"
#    -> Healer inspects failure, updates locators, re-runs
```

### Pattern 2: Planner

- **Input**: App URL + seed test + optional PRD/requirements
- **Output**: Markdown test plan in `specs/` folder
- **How**: Uses Playwright MCP under the hood to explore the app in a real browser
- **Invoke**: Ask Claude "Use the Planner agent to generate a test plan for [feature]"

### Pattern 3: Generator

- **Input**: Markdown plan from `specs/`
- **Output**: TypeScript test files in `tests/`
- **How**: Reads plan, navigates app, verifies selectors live, generates code
- **Invoke**: Ask Claude "Use the Generator agent to create tests from specs/[plan].md"

### Pattern 4: Healer

- **Input**: Failing test name or test file
- **Output**: Patched test that passes (or skipped if functionality is truly broken)
- **How**: Replays failing steps, inspects current UI, suggests locator/timing patches
- **Invoke**: Ask Claude "Use the Healer agent to fix tests/[failing-test].spec.ts"

## Core Patterns: Test Runner

### Run All Tests

```bash
npx playwright test
```

### Run Specific Test

```bash
npx playwright test tests/login.spec.ts
npx playwright test -g "should display error on invalid password"
```

### Debug Mode

```bash
npx playwright test --debug       # Step through with Inspector
npx playwright test --headed      # See the browser
npx playwright test --ui          # Interactive UI mode
```

### Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox --project=webkit
```

### View Reports

```bash
npx playwright show-report
```

### Record Interactions (Codegen)

```bash
npx playwright codegen https://example.com
npx playwright codegen --device="iPhone 13" https://example.com
npx playwright codegen --color-scheme=dark https://example.com
```

## Essential CLI Commands

```bash
# Navigation
playwright-cli open <url>              # Navigate to URL
playwright-cli open <url> --headed     # With visible browser
playwright-cli close                   # Close browser

# Snapshot
playwright-cli snapshot                # Get element refs (e1, e2...)

# Interaction (use refs from snapshot)
playwright-cli click e3                # Click element
playwright-cli fill e5 "text"          # Fill input field
playwright-cli type "text"             # Type into focused element
playwright-cli press Enter             # Press keyboard key
playwright-cli select e9 "value"       # Select dropdown option
playwright-cli check e12               # Check checkbox
playwright-cli uncheck e12             # Uncheck checkbox
playwright-cli hover e4                # Hover over element
playwright-cli drag e2 e8              # Drag and drop
playwright-cli upload ./file.pdf       # Upload file

# Information
playwright-cli screenshot              # Take screenshot
playwright-cli eval "js expression"    # Execute JavaScript

# Dialogs
playwright-cli dialog-accept           # Accept dialog
playwright-cli dialog-dismiss          # Dismiss dialog

# Browser
playwright-cli resize W H             # Resize viewport
playwright-cli install-browser         # Install browser binaries
```

## Ref Lifecycle

Refs (`e1`, `e2`, etc.) are invalidated when the page changes. Always re-snapshot after:

- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (modals, SPAs)

```bash
playwright-cli click e5              # Navigates to new page
playwright-cli snapshot              # MUST re-snapshot
playwright-cli click e1              # Use new refs
```

**Notation difference**: `playwright-cli` uses `e1` (no prefix). `agent-browser` uses `@e1` (with `@` prefix).

## Project Directory Structure

After running `npx playwright init-agents --loop=claude`:

```
project/
├── playwright.config.ts           # Test configuration
├── planner.chatmode.md            # Planner agent instructions
├── generator.chatmode.md          # Generator agent instructions
├── healer.chatmode.md             # Healer agent instructions
├── tests/
│   ├── seed.spec.ts               # Entry point for Agents
│   ├── login.spec.ts              # Generated or hand-written tests
│   └── ...
├── specs/
│   └── login-flow.md              # Planner output (test plans)
├── test-results/                  # Screenshots, traces, videos
└── playwright-report/             # HTML test reports
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `playwright-cli: command not found` | Not installed | `npm install -g @playwright/mcp@latest` |
| `Browser not found` | Missing binaries | `npx playwright install chromium` or `playwright-cli install-browser` |
| `Execution context destroyed` | Page navigated during action | Re-snapshot and retry with new refs |
| `Element not found: e5` | Stale ref after page change | Re-snapshot to get fresh refs |
| `Timeout` | Element not visible/ready | Check selector, verify page loaded |
| `init-agents failed` | Playwright < 1.56 | `npm install -D @playwright/test@latest` |
| `No seed test found` | Planner can't bootstrap | Create `tests/seed.spec.ts` (see templates) |

## Complete Workflow Example

```bash
# === Phase 1: Project Setup ===
npm init playwright@latest
npm install -g @playwright/mcp@latest
npx playwright install chromium
npx playwright init-agents --loop=claude

# === Phase 2: Explore with CLI (ad-hoc) ===
playwright-cli open http://localhost:3000
playwright-cli snapshot
# e1: "input placeholder=Email", e2: "input placeholder=Password", e3: "button text=Login"
playwright-cli fill e1 "test@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot       # Verify login succeeded
playwright-cli screenshot     # Capture evidence

# === Phase 3: Generate Tests with Agents ===
# Ask Claude: "Use the Planner to generate a test plan for the login flow"
#   -> Creates specs/login-flow.md
# Ask Claude: "Use the Generator to create tests from specs/login-flow.md"
#   -> Creates tests/login.spec.ts

# === Phase 4: Run and Heal ===
npx playwright test
# If failures:
# Ask Claude: "Use the Healer to fix the failing login tests"
npx playwright test           # Re-run to verify
npx playwright show-report    # View results
```

## Tips

1. **Ref notation**: `playwright-cli` uses `e1`. `agent-browser` uses `@e1`. Don't mix them.
2. **Prefer agent-browser for quick tasks**: If installed, use it for ad-hoc automation. Use Playwright for structured testing.
3. **Seed tests matter**: Planner quality depends on a good seed test. Include app-specific setup and fixtures.
4. **Regenerate on update**: Run `npx playwright init-agents --loop=claude` after updating Playwright.
5. **Use --headed for debugging**: When tests fail and you need to see the browser.
6. **Codegen for baselines**: Use `npx playwright codegen` to record a quick baseline, then refine by hand or with Agents.

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/cli-commands.md](references/cli-commands.md) | Full CLI command reference with all flags and options |
| [references/agents-workflow.md](references/agents-workflow.md) | Detailed Agents pipeline: seed tests, planner prompts, healer behavior |

## Ready-to-Use Templates

| Template | Description |
|----------|-------------|
| [templates/init-playwright-project.sh](templates/init-playwright-project.sh) | Full project setup (prereqs + install + agents) |
| [templates/cli-form-automation.sh](templates/cli-form-automation.sh) | Headless form filling guide with playwright-cli |
| [templates/seed-test.ts](templates/seed-test.ts) | Starter seed test for Playwright Agents |

```bash
./templates/init-playwright-project.sh              # Setup new project
./templates/cli-form-automation.sh https://example.com/form  # Form automation
cp templates/seed-test.ts tests/seed.spec.ts         # Copy seed test
```
