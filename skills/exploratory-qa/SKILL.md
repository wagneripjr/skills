---
name: exploratory-qa
description: "Use when performing exploratory testing as a QA engineer — verifying, validating, and regression-testing all external observable behavior of a system. Triggers on: 'test this', 'QA this', 'exploratory test', 'manual test', 'verify this works', 'check for regressions', 'test my changes', 'test this PR', 'run QA', 'smoke test', or after completing implementation work. Tests ALL external interfaces: REST/GraphQL APIs (curl), CLIs (direct execution), web UIs (playwright-cli/agent-browser), database state (psql/sqlite3/mongosh), file outputs, log entries, gRPC services (grpcurl), message queues, and webhooks. Supports full-system testing and change-focused testing scoped by git diff. Creates GitHub Issues for findings and saves evidence to docs/. NOT a substitute for TDD/ATDD — complements them by catching what automated tests miss through exploratory, risk-based testing. NOT for writing automated test scripts (use playwright skill). NOT for fixing bugs — reports findings only."
---

# Exploratory QA Testing

Act as a QA engineer performing systematic exploratory testing on external observable behavior. Every test session addresses **verification**, **validation**, and **regression prevention**.

## Scope Detection

Determine scope before doing anything else.

### Change-Focused Scope

Activate when the user mentions changes, a branch, or a PR.

```bash
git diff master...HEAD --stat && git diff master...HEAD --name-only
```

Map changed files to affected interfaces. Test changed interfaces thoroughly, then run lightweight regression checks on adjacent functionality.

### Full-System Scope

Activate when no specific change is referenced. Map the entire surface area. If ambiguous, ask the user.

## Phase 1: Discovery

Identify the project type and every external observable interface. Each interface discovered here becomes a test target.

### Technology Detection

```bash
ls -la
```

Check for project markers (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `*.csproj`, `docker-compose.yml`) and read `README.md`/`CLAUDE.md` if present.

### Interface Inventory

Search the codebase for each interface type. Load `references/interface-testing-checklists.md` via Read for detailed per-type guidance.

- **APIs**: OpenAPI specs, route/controller files → test with `curl`
- **CLIs**: `bin/`, `cmd/`, argparse/click/cobra definitions → test via direct Bash execution
- **Web UIs**: `pages/`, `app/`, HTML templates → test with `playwright-cli` or `agent-browser`
- **Database**: migrations, schema files, ORM models → verify with `psql`/`sqlite3`/`mongosh`
- **File outputs**: write operations, export functions → verify with `ls`/`cat`/`diff`
- **Logs**: logger config, log files → inspect via Bash
- **gRPC**: `.proto` files → test with `grpcurl`
- **Queues/Webhooks**: consumer/producer code, webhook config → project-specific tools or log inspection

For each interface, record its identifier, purpose, and testing tool.

### Environment Setup

If the project needs a running server:

1. Identify the start command from `package.json` scripts, `Makefile`, README, or `docker-compose.yml`
2. Read `.env.example` for required environment variables — never read `.env` directly
3. Install dependencies if needed
4. Start the server in the background
5. Wait for readiness:

```bash
for i in $(seq 1 30); do curl -sf http://localhost:PORT/health > /dev/null 2>&1 && break; sleep 1; done
```

If the system is a CLI tool, library, or batch process, skip server setup entirely — test by direct invocation.

## Phase 2: Test Planning

Create a task (TaskCreate) for each testable interface or journey. Prioritize by risk:

1. **Recently changed** (change-focused mode) — highest risk, test first
2. **User-facing mutations** — actions that write data (create, update, delete)
3. **Authentication and authorization** — access control, protected routes
4. **Edge cases and error paths** — invalid input, missing data, boundary values, unauthorized access
5. **Happy paths on stable features** — lightweight regression checks

Each task includes:
- **subject**: Interface or journey name (e.g., "API: POST /users", "CLI: export --format csv", "Web: login flow")
- **description**: What to test, expected behavior, edge cases to cover, related git changes if change-focused

Create the evidence directory structure:

```bash
mkdir -p docs/qa-evidence/{api,cli,web,db,logs}
```

## Phase 3: Systematic Execution

Process each task. Mark `in_progress` with TaskUpdate before starting, `completed` when done.

### Testing APIs

```bash
# Happy path
curl -sf -X POST http://localhost:PORT/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}' \
  -w "\nHTTP %{http_code}\n" | tee docs/qa-evidence/api/POST-users-201.txt

# Missing required field
curl -sf -X POST http://localhost:PORT/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":""}' \
  -w "\nHTTP %{http_code}\n" | tee docs/qa-evidence/api/POST-users-400-empty-name.txt

# Unauthorized access
curl -sf -X GET http://localhost:PORT/api/admin \
  -w "\nHTTP %{http_code}\n" | tee docs/qa-evidence/api/GET-admin-401-no-auth.txt
```

Test: correct input, missing required fields, invalid types, boundary values, auth, idempotency. Load `references/common-edge-cases.md` for input patterns.

### Testing CLIs

```bash
./my-tool --help 2>&1 | tee docs/qa-evidence/cli/help.txt
./my-tool --version 2>&1 | tee docs/qa-evidence/cli/version.txt

# Happy path
./my-tool process --input data.csv --output result.json 2>&1 | tee docs/qa-evidence/cli/process-happy.txt
echo "exit: $?" >> docs/qa-evidence/cli/process-happy.txt

# Missing file
./my-tool process --input nonexistent.csv 2>&1 | tee docs/qa-evidence/cli/process-missing-input.txt
echo "exit: $?" >> docs/qa-evidence/cli/process-missing-input.txt
```

Test: help text accuracy, output format, error messages, exit codes, file output correctness.

### Testing Web UIs

Use `playwright-cli` when Playwright is already in the project; `agent-browser` when you need auth state persistence, iOS simulator, parallel sessions, or semantic locators. Load `references/interface-testing-checklists.md` for the full comparison.

```bash
playwright-cli open http://localhost:PORT
playwright-cli snapshot
playwright-cli screenshot --filename=docs/qa-evidence/web/home.png
```

Test: page load without console errors, interactive elements, form validation, navigation, visual layout at multiple viewports. Re-snapshot after every navigation or DOM change. Read screenshots to visually verify.

### Verifying Database State

After any mutation (API call, form submit, CLI command that writes data):

```bash
psql "$DATABASE_URL" -c "SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT 1"
```

Check: correct records, matching field values, referential integrity, no orphans/duplicates. Use `.env.example` for the connection variable name.

### Checking Logs and Side Effects

```bash
# Errors or warnings during the test session
grep -iE "error|warn|exception|fatal" logs/app.log | tail -20 | tee docs/qa-evidence/logs/errors-during-test.txt

# Expected log entries after operations
grep "user.created" logs/app.log | tail -5 | tee docs/qa-evidence/logs/user-created-events.txt
```

### Evidence Rules

Every test produces an artifact saved to `docs/qa-evidence/`. Name files descriptively: `{METHOD}-{path}-{status}.txt` for APIs, `{command}-{scenario}.txt` for CLIs, `{page}-{state}.png` for web UIs.

## Phase 4: Report & Issues

After all tasks are complete, produce the report and create issues for findings.

### Summary Format

```
## Exploratory QA Report

**Scope**: [Full system | Changes in branch X | PR #N]
**Interfaces Tested**: [count] ([count] API, [count] CLI, [count] Web, [count] DB)
**Tests Executed**: [count]
**Passed**: [count] | **Failed**: [count] | **Warnings**: [count]

### Findings

#### [FAIL] [Interface]: [Brief description]
- **Expected**: [what should happen]
- **Actual**: [what happened]
- **Evidence**: docs/qa-evidence/[path]
- **Severity**: critical | high | medium | low
- **Affected files**: [file:line if identifiable]

#### [WARN] [Interface]: [Brief description]
- **Observation**: [what was noticed]
- **Risk**: [potential impact]

### Regression Status
- [PASS/FAIL] [Existing feature checked]
```

### Save Report to docs/

Write the full report to `docs/qa-reports/YYYY-MM-DD-qa-report.md` with per-interface breakdowns, all evidence references, and database validation results.

### Create GitHub Issues

When the project is on GitHub, create a GitHub Issue for each finding with severity >= medium:

```bash
gh issue create --title "[QA] Brief description" --body "$(cat <<'EOF'
## QA Finding

**Severity**: [level]
**Interface**: [type and identifier]

### Expected
[what should happen]

### Actual
[what happened]

### Evidence
[path to evidence file]

### Steps to Reproduce
[numbered steps]
EOF
)"
```

Group low-severity cosmetic findings into a single issue to avoid noise.

## Cleanup

After testing completes:

1. Stop any background server processes started during setup
2. Close any browser sessions (`playwright-cli close` or `agent-browser close`)
3. Leave `docs/qa-evidence/` and `docs/qa-reports/` intact for review

## Rules

1. **Never read `.env`** — use `.env.example` for variable names, ask the user for values if needed
2. **Never modify application code** — QA observes and reports, never fixes
3. **Always save evidence** — every test produces a verifiable artifact in `docs/qa-evidence/`
4. **All output to `docs/`** — reports to `docs/qa-reports/`, evidence to `docs/qa-evidence/`
5. **Create GitHub Issues** — for findings with severity >= medium, when the project is on GitHub
6. **Re-snapshot after DOM changes** — browser element refs become stale after navigation or dynamic updates
7. **Test edge cases** — invalid input, missing data, unauthorized access, boundary values; load `references/common-edge-cases.md` for patterns
8. **Check side effects** — database state, log entries, file outputs, not just direct responses
9. **Prioritize by risk** — recently changed code first, then user-facing mutations, then stable features
