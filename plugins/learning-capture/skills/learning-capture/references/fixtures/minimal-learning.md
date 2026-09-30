# Learnings

---

## [LRN-20250115-001] correction

**Logged**: 2025-01-15T10:30:00Z
**Priority**: high
**Status**: pending
**Area**: tests

### Summary
Assumed test fixtures are function-scoped; this codebase scopes database fixtures per module.

### Details
The project convention uses module-scoped fixtures for expensive setup.

### Suggested Action
Check existing fixtures for scope patterns before defaulting to function scope.

### Metadata
- Source: user_feedback
- Related Files: tests/conftest.py
- Tags: pytest, fixtures

---
