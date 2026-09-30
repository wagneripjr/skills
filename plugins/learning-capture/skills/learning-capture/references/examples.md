# Entry Examples

Concrete examples of well-formatted entries with all fields. Every project, file, id, plugin and
review job below is invented for illustration.

An entry is a `## [ID] category` header and everything up to the next such header. Field lines sit
at column 0 as `**Name**: value` or `- Name: value`, and a reader takes the last occurrence of a
field, so the fenced output inside an error entry never carries a field-shaped line. The full
contract is [entry-format.md](entry-format.md).

## Learning: Correction

````markdown
## [LRN-20250115-001] correction

**Logged**: 2025-01-15T10:30:00Z
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
Incorrectly assumed pytest fixtures are scoped to function by default

### Details
When writing test fixtures, I assumed all fixtures were function-scoped.
User corrected that while function scope is the default, the codebase
convention uses module-scoped fixtures for database connections to
improve test performance.

### Suggested Action
When creating fixtures that involve expensive setup (DB, network),
check existing fixtures for scope patterns before defaulting to function scope.

### Metadata
- Source: user_feedback
- Related Files: tests/conftest.py
- Tags: pytest, testing, fixtures

---
````

## Learning: Knowledge Gap (Resolved)

````markdown
## [LRN-20250115-002] knowledge_gap

**Logged**: 2025-01-15T14:22:00Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
Project uses pnpm not npm for package management

### Details
Attempted to run `npm install` but project uses pnpm workspaces.
Lock file is `pnpm-lock.yaml`, not `package-lock.json`.

### Suggested Action
Check for `pnpm-lock.yaml` or `pnpm-workspace.yaml` before assuming npm.
Use `pnpm install` for this project.

### Metadata
- Source: error
- Related Files: pnpm-lock.yaml, pnpm-workspace.yaml
- Tags: package-manager, pnpm, setup

### Resolution
- **Resolved**: 2025-01-15T14:30:00Z
- **Commit/PR**: N/A - knowledge update
- **Notes**: Added to CLAUDE.md for future reference

---
````

## Learning: Promoted to CLAUDE.md

````markdown
## [LRN-20250115-003] best_practice

**Logged**: 2025-01-15T16:00:00Z
**Priority**: high
**Status**: promoted
**Promoted**: CLAUDE.md
**Area**: backend

### Summary
API responses must include correlation ID from request headers

### Details
All API responses should echo back the X-Correlation-ID header from
the request. This is required for distributed tracing. Responses
without this header break the observability pipeline.

### Suggested Action
Always include correlation ID passthrough in API handlers.

### Metadata
- Source: user_feedback
- Related Files: src/middleware/correlation.ts
- Tags: api, observability, tracing
- Confidence: 0.9
- Applications: 4

---
````

The promoted version in CLAUDE.md would be concise:

```markdown
## API Conventions
<!-- source: LRN-20250115-003 | promoted: 2025-01-15 -->
- All responses must echo `X-Correlation-ID` from request headers (required for distributed tracing)
```

The `<!-- source: ... -->` marker is the back-reference: from a rule in CLAUDE.md you can grep the learning ID to recover the full context behind it.

## Learning: Promoted to Auto Memory

````markdown
## [LRN-20250116-001] best_practice

**Logged**: 2025-01-16T09:00:00Z
**Priority**: high
**Status**: promoted
**Promoted**: auto memory (patterns.md)
**Area**: backend

### Summary
Must regenerate API client after OpenAPI spec changes

### Details
When modifying API endpoints, the TypeScript client must be regenerated.
Forgetting this causes type mismatches that only appear at runtime.
The generate script also runs validation.

### Suggested Action
After any API changes, run the client regeneration script.

### Metadata
- Source: error
- Related Files: openapi.yaml, src/client/api.ts
- Tags: api, codegen, typescript
- Confidence: 0.85
- Applications: 3

---
````

The promoted version in `~/.claude/projects/<path>/memory/patterns.md`:

```markdown
## API Client Regeneration
<!-- source: LRN-20250116-001 | promoted: 2025-01-16 -->
After changing API endpoints, always regenerate the TypeScript client.
Type mismatches from stale clients only appear at runtime — the compiler won't catch them.
```

## Error Entry

````markdown
## [ERR-20250115-A3F] docker_build

**Logged**: 2025-01-15T09:15:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Docker build fails on M1 Mac due to platform mismatch

### Error
```
error: failed to solve: python:3.11-slim: no match for platform linux/arm64
```

### Context
- Command: `docker build -t myapp .`
- Dockerfile uses `FROM python:3.11-slim`
- Running on Apple Silicon (M1/M2)

### Suggested Fix
Add platform flag: `docker build --platform linux/amd64 -t myapp .`
Or update Dockerfile: `FROM --platform=linux/amd64 python:3.11-slim`

### Metadata
- Reproducible: yes
- Related Files: Dockerfile

---
````

## Error Entry: Recurring Issue

````markdown
## [ERR-20250120-B2C] api_timeout

**Logged**: 2025-01-20T11:30:00Z
**Priority**: critical
**Status**: pending
**Area**: backend

### Summary
Third-party payment API timeout during checkout

### Error
```
TimeoutError: Request to payments.example.com timed out after 30000ms
```

### Context
- Command: POST /api/checkout
- Timeout set to 30s
- Occurs during peak hours (lunch, evening)

### Suggested Fix
Implement retry with exponential backoff. Consider circuit breaker pattern.

### Metadata
- Reproducible: yes (during peak hours)
- Related Files: src/services/payment.ts
- See Also: ERR-20250115-X1Y, ERR-20250118-Z3W

---
````

## Feature Request

````markdown
## [FEAT-20250115-001] export_to_csv

**Logged**: 2025-01-15T16:45:00Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Requested Capability
Export analysis results to CSV format

### User Context
User runs weekly reports and needs to share results with non-technical
stakeholders in Excel. Currently copies output manually.

### Complexity Estimate
simple

### Suggested Implementation
Add `--output csv` flag to the analyze command. Use standard csv module.
Could extend existing `--output json` pattern.

### Metadata
- Frequency: recurring
- Related Features: analyze command, json output

---
````

## Feature Request: Resolved

````markdown
## [FEAT-20250110-002] dark_mode

**Logged**: 2025-01-10T14:00:00Z
**Priority**: low
**Status**: resolved
**Area**: frontend

### Requested Capability
Dark mode support for the dashboard

### User Context
User works late hours and finds the bright interface straining.
Several other users have mentioned this informally.

### Complexity Estimate
medium

### Suggested Implementation
Use CSS variables for colors. Add toggle in user settings.
Consider system preference detection.

### Metadata
- Frequency: recurring
- Related Features: user settings, theme system

### Resolution
- **Resolved**: 2025-01-18T16:00:00Z
- **Commit/PR**: #142
- **Notes**: Implemented with system preference detection and manual toggle

---
````

## Learning: Promoted to Skill

````markdown
## [LRN-20250118-001] best_practice

**Logged**: 2025-01-18T11:00:00Z
**Priority**: high
**Status**: promoted_to_skill
**Skill-Path**: skills/docker-m1-fixes
**Area**: infra

### Summary
Docker build fails on Apple Silicon due to platform mismatch

### Details
When building Docker images on M1/M2 Macs, the build fails because
the base image doesn't have an ARM64 variant. This is a common issue
that affects many developers.

### Suggested Action
Add `--platform linux/amd64` to docker build command, or use
`FROM --platform=linux/amd64` in Dockerfile.

### Metadata
- Source: error
- Related Files: Dockerfile
- Tags: docker, arm64, m1, apple-silicon
- See Also: ERR-20250115-A3F, ERR-20250117-B2D
- Confidence: 0.95
- Applications: 3

---
````

## Learning: Review Finding (Attributed)

Filed in the same turn as the fix, by the session that applied the adversarial review's finding.
`**Skill**` names the skill whose text should have prevented it; `**Fix-type**` says what closes it.

````markdown
## [LRN-20250121-001] review_finding

**Logged**: 2025-01-21T15:10:00Z
**Priority**: high
**Status**: resolved
**Area**: tests
**Skill**: example-plugin:example-skill
**Fix-type**: skill
**Review**: review-job-0001

### Summary
Acceptance test asserted on a mock's call count instead of the observable result

### Details
The adversarial review flagged that the new checkout test passed with the
production handler deleted: it verified that a mocked repository was called
once, never that the order was persisted. The skill's guidance on writing
acceptance tests says nothing about asserting through the public interface,
so the same shape will recur.

### Suggested Action
Add a rule to the skill: an acceptance assertion reads state through the
system's public interface, never through a test double.

### Metadata
- Source: review
- Related Files: tests/acceptance/checkout.test.ts
- Tags: testing, mocks, acceptance
- Applications: 1

### Resolution
- **Resolved**: 2025-01-21T15:40:00Z
- **Commit/PR**: #57
- **Notes**: Test rewritten to read the order back; skill text change pending

---
````

A finding that more than one review raised lists every job id, separated by commas or whitespace:
`**Review**: review-job-0001, review-job-0002`.
