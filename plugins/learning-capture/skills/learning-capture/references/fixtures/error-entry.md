# Errors

**Statuses**: pending | in_progress | resolved | wont_fix | promoted

---

## [ERR-20250120-001] docker_build

**Logged**: 2025-01-20T09:15:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Image build fails on an arm64 workstation because the base image has no arm64 variant.

### Error
```
error: failed to solve: python:3.11-slim: no match for platform linux/arm64
```

### Context
- Command: `docker build -t myapp .`
- Reproducible: yes

### Suggested Fix
Pass `--platform linux/amd64`, or pin the platform in the Dockerfile.

### Metadata
- Reproducible: yes
- Related Files: Dockerfile

---
