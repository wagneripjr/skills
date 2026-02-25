# Playwright Agents: Planner, Generator, Healer

Playwright Agents are AI-powered test automation tools that use Claude Code (or other AI clients) to explore applications, generate tests, and fix failures automatically.

## Prerequisites

- **Playwright** >= 1.56: `npm install -D @playwright/test@latest`
- **Chromium browser**: `npx playwright install chromium`
- **Node.js** >= 20

## Setup

```bash
npx playwright init-agents --loop=claude
```

Available `--loop` options:
- `--loop=claude` — For Claude Code
- `--loop=vscode` — For VS Code with GitHub Copilot
- `--loop=opencode` — For Open Code editor

### What Gets Created

```
project/
├── planner.chatmode.md        # Planner agent instructions
├── generator.chatmode.md      # Generator agent instructions
├── healer.chatmode.md         # Healer agent instructions
├── tests/
│   └── seed.spec.ts           # Base test (entry point for agents)
├── specs/                     # Test plans (Planner output)
└── playwright.config.ts       # Test configuration
```

### Regenerate After Updates

Run `init-agents` again after updating Playwright to pick up new agent capabilities:

```bash
npm install -D @playwright/test@latest
npx playwright init-agents --loop=claude
```

## The Three Agents

### Planner Agent

**Purpose**: Explore your application and produce a structured test plan.

**Input**:
- Your app's URL (via seed test or natural language)
- Optional: PRD, user stories, or requirements documents
- Optional: Existing test examples to match style

**Output**: Markdown file in `specs/` describing:
- Test scenarios organized by feature
- Step-by-step user interactions
- Expected results and assertions
- Edge cases to cover

**How it works**:
1. Launches browser via Playwright MCP
2. Navigates the app following links and interactions
3. Identifies features, forms, and user flows
4. Produces comprehensive test plan as Markdown

**Invocation in Claude Code**:
```
"Use the Planner agent to create a test plan for the user registration flow"
"Generate a test plan covering the checkout process, including error cases"
"Plan tests for the admin dashboard based on specs/requirements.md"
```

**Example output** (`specs/registration.md`):
```markdown
# Test Plan: User Registration

## Scenario 1: Successful Registration
1. Navigate to /register
2. Fill name: "Jane Doe"
3. Fill email: "jane@example.com"
4. Fill password: "SecureP@ss123"
5. Click "Create Account"
6. **Expected**: Redirect to /dashboard, welcome message shown

## Scenario 2: Duplicate Email
1. Navigate to /register
2. Fill email with existing account email
3. Click "Create Account"
4. **Expected**: Error "Email already registered"

## Scenario 3: Weak Password
1. Navigate to /register
2. Fill password: "123"
3. Click "Create Account"
4. **Expected**: Validation error about password requirements
```

### Generator Agent

**Purpose**: Convert Markdown plans into executable Playwright test files.

**Input**: Markdown test plan from `specs/`

**Output**: TypeScript test files in `tests/`

**How it works**:
1. Reads the Markdown plan
2. Launches browser to the target app
3. Walks through each scenario step-by-step
4. Verifies selectors work against the live app
5. Generates TypeScript with resilient locators (role-based, text-based)
6. Adds assertions matching expected results

**Invocation in Claude Code**:
```
"Use the Generator to create tests from specs/registration.md"
"Generate Playwright tests for the login plan"
```

**Example output** (`tests/registration.spec.ts`):
```typescript
import { test, expect } from '@playwright/test';

test.describe('User Registration', () => {
  test('successful registration', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill('Jane Doe');
    await page.getByLabel('Email').fill('jane@example.com');
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome')).toBeVisible();
  });

  test('duplicate email shows error', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('existing@example.com');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Email already registered')).toBeVisible();
  });
});
```

### Healer Agent

**Purpose**: Automatically repair failing tests.

**Input**: A failing test file or test name

**Output**: Patched test that passes, or test marked as skipped if the functionality is genuinely broken

**How it works**:
1. Runs the failing test in debug mode
2. Inspects console logs, network requests, and page snapshots at the failure point
3. Identifies root cause:
   - **Moved element**: Updates locator
   - **Timing issue**: Adds appropriate wait
   - **Changed text**: Updates assertion text
   - **Removed feature**: Marks test as skipped with explanation
4. Applies fix and re-runs to verify
5. Repeats until test passes or determines functionality is broken

**Invocation in Claude Code**:
```
"Use the Healer to fix tests/registration.spec.ts"
"Heal the failing test 'should show error on duplicate email'"
"Fix all failing tests in the login suite"
```

## Seed Test

The seed test (`tests/seed.spec.ts`) is the entry point for Agents. It tells the Planner where to start exploring and provides common setup.

**Good seed test characteristics**:
- Navigates to the app's main entry point
- Includes authentication setup if needed
- Sets up any required test data or fixtures
- Provides context about the app's structure

**Example** (see `templates/seed-test.ts` for a ready-to-use version):
```typescript
import { test, expect } from '@playwright/test';

test.describe('App Seed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });

  test('app loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/My App/);
    await expect(page.getByRole('navigation')).toBeVisible();
  });
});
```

## Workflow Patterns

### Pattern A: New Feature Coverage

```
1. Write or update seed test with new feature's entry point
2. Planner: "Create a test plan for [new feature]"
3. Review specs/[feature].md, adjust if needed
4. Generator: "Create tests from specs/[feature].md"
5. Run: npx playwright test tests/[feature].spec.ts
6. Healer: Fix any failures
```

### Pattern B: Regression After Refactor

```
1. Run existing tests: npx playwright test
2. If failures: Healer: "Fix all failing tests"
3. Review healer patches (some may indicate real bugs)
4. If functionality changed: Planner: "Update test plan for [changed area]"
```

### Pattern C: Test Suite from PRD

```
1. Provide PRD or requirements document to Planner
2. Planner: "Create test plans based on docs/requirements.md"
3. Review generated specs/
4. Generator: "Create tests from all plans in specs/"
5. Run and iterate
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Planner can't find app | Seed test URL wrong | Update `tests/seed.spec.ts` with correct URL |
| Generator produces fragile locators | Complex DOM, dynamic IDs | Review and adjust locators to use roles/text |
| Healer loops without fixing | Functionality genuinely broken | Mark test as `.skip()`, investigate the app bug |
| Agents not available | Playwright < 1.56 | `npm install -D @playwright/test@latest` |
| MCP tools not found | Agents need MCP | `init-agents --loop=claude` configures this automatically |
| Tests pass locally, fail in CI | Missing browser binaries | Add `npx playwright install --with-deps` to CI |

## MCP Integration (Under the Hood)

Playwright Agents use the Playwright MCP server internally. When you run `init-agents --loop=claude`, it configures MCP automatically. You do **not** need to manually add Playwright MCP to your `.mcp.json` for Agents to work.

However, if you want Playwright MCP available as standalone tools (outside the Agents workflow), add to `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

This exposes 25+ browser automation tools directly to Claude Code. Note this adds ~4,000-8,000 tokens to context (mitigated by progressive disclosure in Claude Code).

## CI/CD Integration

### GitHub Actions

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Run Playwright Tests
  run: npx playwright test

- name: Upload Report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

### Trace on Failure

In `playwright.config.ts`:
```typescript
export default defineConfig({
  use: {
    trace: 'on-first-retry',
  },
  retries: 1,
});
```

View traces:
```bash
npx playwright show-trace test-results/*/trace.zip
```
