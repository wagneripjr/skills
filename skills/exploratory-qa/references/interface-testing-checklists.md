# Interface Testing Checklists

Detailed per-interface-type checklists for systematic exploratory QA. Load this file when testing a specific interface type to ensure thorough coverage.

## REST/GraphQL API

### Per-Endpoint Checks

- **Status codes by method**: GET (200, 404), POST (201, 400, 409 conflict), PUT (200, 404, 422), PATCH (200, 404), DELETE (200/204, 404)
- **Response body**: correct shape, all expected fields present, no extra sensitive fields leaked (password hashes, internal IDs)
- **Content-Type header**: matches expected format (application/json, etc.)
- **Pagination**: first page, last page, out-of-range page, page size 0, negative page
- **Filtering/sorting**: valid filter, invalid filter field, SQL injection in filter value, sort by non-existent column
- **Rate limiting**: if configured, verify 429 response after threshold
- **CORS**: OPTIONS preflight returns correct headers for allowed origins
- **Authentication**: valid token, expired token, missing token, malformed token, token for wrong user
- **Authorization**: user accessing own resource (200), user accessing another's resource (403), admin-only endpoints with non-admin token
- **Idempotency**: POST same unique data twice — expect 409 or duplicate prevention, not silent duplicate creation
- **Content negotiation**: Accept header variations, unsupported content type in request body

### GraphQL-Specific

- **Query depth**: deeply nested query to check depth limiting
- **Introspection**: verify disabled in production or appropriately restricted
- **N+1 queries**: request list with nested relations, check response time and DB query count if observable
- **Mutation error paths**: partial failure in batch mutations, transaction rollback behavior

## CLI

### Per-Command Checks

- **Help text**: `--help` flag shows all subcommands, flags, and descriptions; matches actual behavior
- **Version flag**: `--version` outputs a parseable version string
- **No arguments**: running with no args shows usage or help, not a crash
- **Exit codes**: 0 for success, non-zero for errors (1 for general, 2 for usage, specific codes if documented)
- **Invalid flags**: unrecognized flag produces clear error, not a stack trace
- **Missing required flags**: clear error message naming the missing flag
- **Piping/stdin**: accepts piped input if documented, handles empty stdin gracefully
- **Signal handling**: Ctrl+C (SIGINT) exits cleanly without corrupt output files
- **Environment variables**: documented env vars are respected, override order is correct (flag > env > config file)
- **Config file**: loads from expected path, handles missing config gracefully, validates config values
- **Output formats**: `--json`, `--csv`, `--table` (if supported) produce valid format with all fields
- **File output**: `--output` flag creates file, handles existing file (overwrite? error?), creates parent dirs or errors clearly
- **Verbose/quiet**: `--verbose` adds detail, `--quiet` suppresses non-essential output
- **Large input**: process a large file (if applicable) — check memory usage, progress indication, timeout behavior

## Web UI

### Per-Page Checks

- **Page load**: no console errors, no failed network requests (check browser devtools/console)
- **Visual correctness**: layout matches design intent, no overlapping elements, text readable
- **Responsive viewports**: mobile (375x812), tablet (768x1024), desktop (1440x900)
- **Form validation**: submit empty form, submit with invalid email/phone/date formats, boundary-length inputs
- **Form submission**: success feedback visible, error feedback visible, loading state shown during submission
- **Navigation**: all links resolve, back button works, breadcrumbs accurate
- **Interactive elements**: dropdowns open/close, modals open/close/escape-key, toggles reflect state, tabs switch content
- **Loading states**: visible spinner or skeleton during async operations, no flash of unstyled content
- **Error states**: API failure shows user-friendly message (not raw error), network offline behavior
- **Accessibility**: tab order logical, focus indicators visible, images have alt text, ARIA labels on interactive elements, color contrast sufficient
- **Authentication flows**: login with valid credentials, login with wrong credentials (error message), session expiry behavior, logout clears state
- **URL state**: refreshing preserves page state, sharing URL loads same view, query params reflected in UI

### playwright-cli vs agent-browser

| Capability | playwright-cli | agent-browser |
|------------|---------------|---------------|
| Setup requirement | Playwright already in project | Standalone CLI install |
| State persistence | Fresh context per session | Persists auth/cookies across sessions |
| Parallel sessions | Single browser context | Multiple concurrent sessions |
| iOS simulator | No | Yes |
| Semantic locators | CSS/XPath/text selectors | AI-powered semantic selectors |
| Video recording | Via Playwright config | Built-in recording |
| PDF generation | Via Playwright API | Built-in |
| Local file testing | Yes | Yes |
| Test suite generation | Codegen mode | AI-driven test generation |

**Decision summary**: Use `playwright-cli` when the project already has Playwright configured — it's lighter and avoids adding a dependency. Use `agent-browser` for exploratory QA sessions that benefit from persistent auth state, parallel browser contexts, iOS testing, or AI-powered element discovery. For most exploratory QA, `agent-browser` is the better fit because it handles the dynamic, session-based nature of manual testing.

## Database

### Post-Mutation Checks

- **Record creation**: all columns populated correctly, defaults applied, auto-increment IDs sequential
- **Record update**: only specified fields changed, timestamps updated (updated_at), version/revision incremented if applicable
- **Record deletion**: soft delete sets flag (if applicable), hard delete removes row, cascade deletes remove dependents
- **Referential integrity**: foreign keys point to existing records, no orphaned child records after parent deletion
- **Unique constraints**: inserting duplicate unique values produces clear error, not silent overwrite
- **Check constraints**: values outside allowed range rejected at DB level
- **Transaction behavior**: partial failure rolls back all changes (no half-written state)
- **Index usage**: for critical queries, verify the query plan uses expected indexes (EXPLAIN ANALYZE)
- **Migration state**: schema matches the latest migration, no pending migrations

## Security

### Injection Vectors

- **SQL injection**: `'; DROP TABLE users; --` in text fields, `1 OR 1=1` in numeric fields
- **XSS**: `<script>alert('xss')</script>` in text inputs, reflected in page source without escaping
- **Command injection**: `; ls /` or `$(whoami)` in fields that might reach shell commands
- **Path traversal**: `../../etc/passwd` in file path parameters
- **SSRF**: internal URLs (`http://localhost`, `http://169.254.169.254`) in URL input fields

### Auth/Access

- **Broken access control**: change resource ID in URL to another user's resource
- **Missing auth on API endpoints**: call each endpoint without authentication
- **Privilege escalation**: non-admin user calling admin-only endpoints
- **Session management**: session invalidated after password change, concurrent session limits (if applicable)

### Data Exposure

- **Sensitive data in responses**: passwords, tokens, internal IDs, PII not needed by the client
- **Sensitive data in logs**: search logs for passwords, tokens, credit card numbers
- **Error messages**: stack traces exposed to client, internal paths revealed
- **Debug endpoints**: `/debug`, `/metrics`, `/health` exposing internal state in production
