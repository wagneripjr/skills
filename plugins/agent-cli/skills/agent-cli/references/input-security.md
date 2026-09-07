# Input Handling and Security for Agent-Consumed CLIs

CLIs designed for AI agent consumption face a threat model distinct from human-operated tools. Agents construct inputs programmatically, often from untrusted upstream data (user prompts, API responses, file contents). They do not read warning banners, cannot respond to interactive confirmation dialogs, and will retry malformed input indefinitely if errors are unclear. Every input path is an attack surface. This reference covers how to accept structured input safely, validate it at the CLI boundary, and harden against the failure modes agents introduce.

---

## Raw JSON Input

Agents work natively with JSON. Forcing them to translate a JSON object into dozens of positional flags introduces mapping errors, quoting bugs, and data loss. Support raw JSON as a first-class input method.

### Flag-based JSON

Accept a complete API payload via a single flag:

```bash
mycli resource create --data '{"name":"web-app","replicas":3,"env":{"NODE_ENV":"production"}}'
```

Or with a dedicated flag name that signals the format:

```bash
mycli resource create --json '{"name":"web-app","replicas":3}'
```

### stdin JSON

Pipe a payload from a file or a previous command's output:

```bash
cat payload.json | mycli resource create --stdin
mycli resource create --stdin < payload.json
```

Support the POSIX `-` convention as a positional alias for stdin:

```bash
mycli resource create -f -
```

### Raw alongside convenience flags

Both modes should coexist. Convenience flags serve simple cases; raw JSON serves complex ones. When both are present, raw takes precedence and convenience flags are ignored with a warning to stderr:

```
warning: --data provided, ignoring --name and --replicas flags
```

This prevents silent conflicts where the agent sets `--name web-app` but also passes `--data '{"name":"api-server"}'`.

### Zero translation loss

Map the JSON body directly to the underlying API schema. Do not rename fields, flatten nested objects, or coerce types between the CLI and the API. If the API accepts `{"metadata":{"labels":{"app":"web"}}}`, the CLI should accept the same structure verbatim. Every transformation is a place where data can be lost or mangled.

---

## stdin Pipe Support

### Detect piped input

Check whether stdin is connected to a terminal or a pipe:

```python
import sys
if not sys.stdin.isatty():
    data = sys.stdin.read()
```

```go
stat, _ := os.Stdin.Stat()
if (stat.Mode() & os.ModeCharDevice) == 0 {
    data, _ := io.ReadAll(os.Stdin)
}
```

```javascript
import { readFileSync } from 'fs';
if (!process.stdin.isTTY) {
    const data = readFileSync('/dev/stdin', 'utf8');
}
```

### Handle empty stdin gracefully

When stdin is a pipe but empty (e.g., an upstream command produced no output), the CLI must not hang waiting for input. Set a read timeout or check content length immediately:

```bash
# Agent runs: echo -n "" | mycli create --stdin
# CLI must detect empty input and exit with a clear error
```

Exit with a non-zero code and a structured error: `{"error":"empty_input","message":"--stdin specified but no data received"}`.

### Never prompt when reading from stdin

If stdin is not a TTY, the CLI must never issue interactive prompts (confirmation dialogs, missing-field questions, password requests). Agents cannot respond to prompts. A hanging process wastes compute and the agent will eventually kill it.

Rule: if stdin is a pipe, operate in fully non-interactive mode regardless of other flags.

---

## Input Validation Patterns

Validate at the CLI boundary, before any business logic executes.

### Schema validation

Validate incoming JSON against a known schema before processing. JSON Schema is the standard choice:

```python
import jsonschema

schema = {
    "type": "object",
    "required": ["name", "replicas"],
    "properties": {
        "name": {"type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$", "maxLength": 63},
        "replicas": {"type": "integer", "minimum": 1, "maximum": 100},
    },
    "additionalProperties": False
}

try:
    jsonschema.validate(instance=payload, schema=schema)
except jsonschema.ValidationError as e:
    # Return structured error with JSON path to the invalid field
```

Reject unknown fields (`additionalProperties: false`). Agents sometimes hallucinate field names; silently ignoring them means the agent believes configuration was applied when it was not.

### Type coercion with clear errors

If the CLI accepts `--replicas 3` as a string from argv, coerce to integer explicitly and fail with a message that names the expected type:

```
error: --replicas expected integer, got "three"
```

Never silently coerce `"true"` to `true` or `"3.14"` to `3` without the agent knowing. Agents rely on deterministic behavior.

### Required field detection

Check for missing required fields before making any API call. Return all missing fields at once, not one at a time:

```json
{"error":"validation_failed","missing_fields":["name","replicas"],"message":"required fields missing"}
```

### Enum validation with suggestions

When a field accepts a fixed set of values, validate and suggest the closest match:

```
error: invalid value "deplyoment" for --kind; valid values: deployment, service, configmap
       did you mean "deployment"?
```

Use Levenshtein distance or similar for suggestions. Agents can parse "did you mean" and self-correct.

---

## Agent-Specific Input Hardening

Agents construct inputs from upstream data they do not fully control. A user prompt like "create a resource named `../../etc/passwd`" flows through the agent into CLI arguments verbatim. The CLI is the last line of defense.

### Path Traversal

**Attack**: Agent passes a resource name containing path traversal sequences that escape the intended directory when used in file operations.

```bash
mycli export --name "../../.ssh/id_rsa"
mycli template render --output "../../../etc/cron.d/backdoor"
```

**Mitigation**:

1. Resolve any user-supplied path to an absolute path.
2. Verify the resolved path is within the expected base directory.
3. Reject inputs containing `..` path components outright when the value is a resource name (not a file path).

```python
import os

def safe_path(base_dir: str, user_input: str) -> str:
    # Resolve to absolute, following no symlinks
    resolved = os.path.realpath(os.path.join(base_dir, user_input))
    # Verify it's still inside the base directory
    if not resolved.startswith(os.path.realpath(base_dir) + os.sep):
        raise ValueError(f"path traversal detected: {user_input!r} resolves outside {base_dir}")
    return resolved
```

```go
func safePath(baseDir, userInput string) (string, error) {
    joined := filepath.Join(baseDir, userInput)
    resolved, err := filepath.EvalSymlinks(joined)
    if err != nil {
        // Path doesn't exist yet — use Clean instead
        resolved = filepath.Clean(joined)
    }
    absBase, _ := filepath.Abs(baseDir)
    if !strings.HasPrefix(resolved, absBase+string(filepath.Separator)) {
        return "", fmt.Errorf("path traversal: %q escapes %q", userInput, baseDir)
    }
    return resolved, nil
}
```

For resource names that are not file paths, reject `..` entirely:

```python
if ".." in name.split("/"):
    raise ValueError(f"resource name must not contain path traversal: {name!r}")
```

### Control Character Injection

**Attack**: Agents may relay input that contains embedded control characters from upstream sources. These can corrupt log output, confuse terminal rendering, or inject misleading content.

- Null bytes: `"normal\x00malicious"` — truncates strings in C-based tools, hides payload after the null.
- ANSI escapes: `"normal\x1b[2Jcleared"` — clears the terminal screen, hides evidence of activity.
- Carriage return: `"safe-output\rmalicious-overwrite"` — overwrites the visible line in terminal logs.

**Mitigation**: Strip or reject ASCII control characters (0x00-0x1F) except `\n` (0x0A) and `\t` (0x09) in all string inputs. For resource names and identifiers, enforce a strict allowlist:

```python
import re

def validate_identifier(name: str) -> str:
    """Validate a resource identifier against a strict allowlist."""
    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._-]*$', name):
        raise ValueError(
            f"invalid identifier {name!r}: must match ^[a-zA-Z0-9][a-zA-Z0-9._-]*$"
        )
    return name

def strip_control_chars(text: str) -> str:
    """Remove control characters except newline and tab."""
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
```

```javascript
function validateIdentifier(name) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
        throw new Error(`invalid identifier "${name}": must match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`);
    }
    return name;
}

function stripControlChars(text) {
    return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}
```

### Shell Injection

**Attack**: When CLI internals construct shell commands from user input via string concatenation, injected shell metacharacters execute arbitrary commands.

```bash
mycli deploy --name "web-app; rm -rf /"
```

**Mitigation**:

1. **Never interpolate user input into shell command strings.** Use argument arrays (subprocess lists, exec syscalls) that bypass the shell entirely.

Python — WRONG (shell injection via string interpolation):

```python
import os
os.system(f"kubectl apply -n {namespace} -f manifest.yaml")
```

Python — CORRECT (argument array, no shell involved):

```python
import subprocess
subprocess.run(["kubectl", "apply", "-n", namespace, "-f", "manifest.yaml"], check=True)
```

Go — WRONG (passes through shell, namespace is injectable):

```go
exec.Command("sh", "-c", "kubectl apply -n "+namespace+" -f manifest.yaml")
```

Go — CORRECT (argument array, no shell involved):

```go
exec.Command("kubectl", "apply", "-n", namespace, "-f", "manifest.yaml")
```

Node.js — CORRECT (execFileSync uses argument array, no shell):

```javascript
import { execFileSync } from 'child_process';
execFileSync('kubectl', ['apply', '-n', namespace, '-f', 'manifest.yaml']);
```

2. **Validate inputs against strict allowlists.** Reject characters that have shell significance: `` ; | & $ ` ( ) { } < > \ ! `` in any value that will be used in command construction.

```python
SHELL_METACHARACTERS = set(';|&$`(){}\\!<>"\'\n\r')

def reject_shell_chars(value: str, field_name: str) -> str:
    found = SHELL_METACHARACTERS.intersection(value)
    if found:
        raise ValueError(
            f"{field_name} contains disallowed characters: {found!r}"
        )
    return value
```

### Double Encoding

**Attack**: An agent URL-encodes a value, then the CLI URL-encodes it again before sending to the API, resulting in corrupted data. Or an attacker sends pre-encoded input to bypass validation.

```bash
# Agent sends already-encoded value
mycli create --name "web%2Dapp"        # %2D is "-", name becomes "web-app" after one decode
mycli create --name "web%252Dapp"      # %25 is "%", decodes to "web%2Dapp", then "web-app"
```

**Mitigation**: Normalize inputs exactly once at the boundary. Detect and reject values that appear to be already encoded:

```python
import urllib.parse

def detect_double_encoding(value: str) -> str:
    decoded = urllib.parse.unquote(value)
    if decoded != value:
        # Value contained percent-encoded sequences
        double_decoded = urllib.parse.unquote(decoded)
        if double_decoded != decoded:
            raise ValueError(
                f"double-encoded value detected: {value!r} -> {decoded!r} -> {double_decoded!r}"
            )
        # Warn but accept single-encoded input, using the decoded form
        import sys
        print(f"warning: input appears URL-encoded, using decoded form: {decoded!r}", file=sys.stderr)
        return decoded
    return value
```

### Embedded Query Parameters and Fragments

**Attack**: Agent includes query parameters or fragments in resource identifiers, potentially altering API behavior.

```bash
mycli get --id "resource-123?admin=true&bypass=1"
mycli get --id "resource-123#admin-section"
```

**Mitigation**: Reject `?` and `#` characters in resource identifiers. These characters have no legitimate purpose in resource names and signal either injection attempts or malformed input.

```python
def validate_resource_id(resource_id: str) -> str:
    if '?' in resource_id or '#' in resource_id:
        raise ValueError(
            f"resource identifier must not contain query params or fragments: {resource_id!r}"
        )
    return resource_id
```

---

## Output Path Sandboxing

When the CLI writes files (export, generate, render), constrain where it can write.

**Rules**:

1. Default output directory is CWD. The CLI writes within the current working directory unless `--output` explicitly specifies another location.
2. Reject absolute paths in filenames derived from user/agent input. Only the `--output` flag itself may be absolute.
3. Do not follow symlinks when creating output files. Use `O_NOFOLLOW` (or language equivalent) to prevent symlink-based escapes.
4. Verify the resolved output path is within the designated directory before writing.

```python
import os

def safe_write(output_dir: str, filename: str, content: bytes) -> str:
    # Reject absolute paths and traversal in the filename
    if os.path.isabs(filename):
        raise ValueError(f"filename must be relative: {filename!r}")
    if ".." in filename.split(os.sep):
        raise ValueError(f"filename must not contain '..': {filename!r}")

    target = os.path.realpath(os.path.join(output_dir, filename))
    base = os.path.realpath(output_dir)

    if not target.startswith(base + os.sep) and target != base:
        raise ValueError(f"output path escapes sandbox: {filename!r}")

    os.makedirs(os.path.dirname(target), exist_ok=True)

    # Open without following symlinks (Python 3.3+ with O_NOFOLLOW)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o644)
    try:
        os.write(fd, content)
    finally:
        os.close(fd)
    return target
```

---

## Secret Input Handling

Secrets passed via CLI flags appear in process listings (`ps aux`), shell history files, and system audit logs. Agents that construct `--api-key sk-abc123` expose the secret to every process on the machine.

### Accepted channels (in precedence order)

| Priority | Method | Example | When |
|----------|--------|---------|------|
| 1 | Credential file | `--password-file ~/.mycli/credentials` | Persistent credentials, file permissions enforced |
| 2 | stdin pipe | `echo "$SECRET" \| mycli login --password-stdin` | CI/CD, ephemeral secrets |
| 3 | Environment variable | `MYCLI_API_KEY=sk-abc123 mycli deploy` | Container environments, agent orchestrators |
| 4 | System keychain | OS credential store | Desktop use, long-lived tokens |
| 5 | Interactive prompt | TTY-only hidden input | Human operators only |

### What to reject

**Never accept secrets via flags.** If the CLI receives `--api-key` or `--password` as a flag, exit with an error that explains why and lists the accepted alternatives:

```
error: --api-key flag is not supported (secrets in flags are visible in process listings)
       use one of:
         MYCLI_API_KEY environment variable
         --credentials-file <path>
         echo "$KEY" | mycli auth --token-stdin
```

### Credential file permissions

When reading a credential file, verify its permissions are restrictive. Reject world-readable credential files:

```python
import os, stat

def read_credentials(path: str) -> str:
    st = os.stat(path)
    mode = st.st_mode
    if mode & (stat.S_IRGRP | stat.S_IROTH):
        raise PermissionError(
            f"credentials file {path} is too open (mode {oct(mode)}); "
            f"run: chmod 600 {path}"
        )
    with open(path) as f:
        return f.read().strip()
```

---

## The Security Posture

**"The agent is not a trusted operator."**

An agent is an automated process that constructs CLI inputs from external data. It operates with the same OS-level permissions as the user who launched it, but it does not exercise human judgment about whether an input looks suspicious. The CLI is the enforcement boundary.

### Design principles

1. **Validate at the CLI boundary.** Every input is validated and sanitized in the argument parsing layer, before any business logic, API call, or file operation. Business logic should never receive unvalidated input.

2. **Fail closed.** If validation is ambiguous (value is probably safe but matches a suspicious pattern), reject it. False positives generate clear error messages that agents can parse and fix. False negatives create vulnerabilities.

3. **Log rejections to stderr.** Every rejected input produces a structured log line on stderr explaining what was rejected and why. This creates an audit trail and helps agents self-correct:

```json
{"level":"warn","event":"input_rejected","field":"name","value":"web-app;ls","reason":"shell metacharacter detected: ;"}
```

4. **Defense in depth.** Do not rely on a single validation layer. Validate the CLI argument, validate the deserialized object, and validate again at the API client boundary. Redundant validation catches bugs in any single layer.

5. **Principle of least authority.** The CLI should not request or accept more permissions than the specific operation requires. If a command only reads resources, it should not accept write credentials. If a command operates on a single namespace, it should not accept cluster-wide scope.

6. **Immutable audit log.** When operating in agent mode (detected via `--machine-output` or non-TTY stdout), log every mutation (create, update, delete) with the full validated input, timestamp, and result to a local audit file. Agents may not report what they did accurately; the audit log is ground truth.

---

## Implementation Patterns

### Combined input sanitizer (Node.js)

```javascript
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const IDENTIFIER_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SHELL_META_RE = /[;|&$`(){}\\!<>"'\n\r]/;

function sanitizeInput(value, fieldName, opts = {}) {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName}: expected string, got ${typeof value}`);
    }

    // Strip control characters
    const cleaned = value.replace(CONTROL_CHAR_RE, '');
    if (cleaned !== value) {
        process.stderr.write(JSON.stringify({
            level: 'warn', event: 'control_chars_stripped', field: fieldName
        }) + '\n');
    }

    // Check for shell metacharacters
    if (opts.rejectShellMeta && SHELL_META_RE.test(cleaned)) {
        throw new Error(`${fieldName}: contains shell metacharacters`);
    }

    // Validate as identifier
    if (opts.identifier && !IDENTIFIER_RE.test(cleaned)) {
        throw new Error(
            `${fieldName}: invalid identifier "${cleaned}"; must match ${IDENTIFIER_RE}`
        );
    }

    // Reject embedded query params / fragments
    if (opts.resourceId && (/\?/.test(cleaned) || /#/.test(cleaned))) {
        throw new Error(`${fieldName}: must not contain ? or #`);
    }

    return cleaned;
}
```

### Path validator (Go)

```go
package security

import (
    "fmt"
    "path/filepath"
    "strings"
)

func ValidatePath(baseDir, userPath string) (string, error) {
    if filepath.IsAbs(userPath) {
        return "", fmt.Errorf("absolute paths not allowed: %s", userPath)
    }

    for _, component := range strings.Split(userPath, string(filepath.Separator)) {
        if component == ".." {
            return "", fmt.Errorf("path traversal not allowed: %s", userPath)
        }
    }

    absBase, err := filepath.Abs(baseDir)
    if err != nil {
        return "", fmt.Errorf("cannot resolve base directory: %w", err)
    }

    resolved, err := filepath.Abs(filepath.Join(baseDir, userPath))
    if err != nil {
        return "", fmt.Errorf("cannot resolve path: %w", err)
    }

    if !strings.HasPrefix(resolved, absBase+string(filepath.Separator)) && resolved != absBase {
        return "", fmt.Errorf("path escapes sandbox: %s resolves to %s", userPath, resolved)
    }

    return resolved, nil
}
```

### Input pipeline (Python)

Composable validation pipeline that processes all fields and collects all errors before returning:

```python
from dataclasses import dataclass, field
import re
import sys
import json

@dataclass
class ValidationResult:
    value: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return len(self.errors) == 0

def validate_input(value: str, field_name: str, *,
                   identifier: bool = False,
                   resource_id: bool = False,
                   max_length: int = 253) -> ValidationResult:
    result = ValidationResult(value=value)

    # Length check
    if len(value) > max_length:
        result.errors.append(f"exceeds max length {max_length}")

    # Control character check
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    if cleaned != value:
        result.warnings.append("control characters stripped")
        result.value = cleaned

    # Double encoding check
    from urllib.parse import unquote
    decoded = unquote(result.value)
    if decoded != result.value:
        double_decoded = unquote(decoded)
        if double_decoded != decoded:
            result.errors.append("double-encoded value detected")
        else:
            result.warnings.append("URL-encoded input detected, using decoded form")
            result.value = decoded

    # Identifier pattern
    if identifier and not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._-]*$', result.value):
        result.errors.append("must match ^[a-zA-Z0-9][a-zA-Z0-9._-]*$")

    # Resource ID checks
    if resource_id:
        if '?' in result.value:
            result.errors.append("must not contain query parameters")
        if '#' in result.value:
            result.errors.append("must not contain fragment identifiers")

    # Log warnings to stderr
    for w in result.warnings:
        print(json.dumps({
            "level": "warn", "field": field_name, "message": w
        }), file=sys.stderr)

    return result
```

Usage:

```python
r = validate_input(args.name, "name", identifier=True, resource_id=True)
if not r.valid:
    print(json.dumps({"error": "validation_failed", "field": "name", "issues": r.errors}))
    sys.exit(1)
name = r.value  # sanitized, safe to use
```

---

## Summary Checklist

Before shipping an agent-consumed CLI, verify each input path:

- [ ] Raw JSON accepted via `--data`/`--json` flag and `--stdin`
- [ ] stdin detection works (TTY check), empty stdin produces an error not a hang
- [ ] No interactive prompts when stdin is a pipe
- [ ] JSON input validated against a schema; unknown fields rejected
- [ ] Resource identifiers validated against `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`
- [ ] Path traversal (`..`) detected and rejected in file arguments
- [ ] Control characters (0x00-0x1F except \n, \t) stripped or rejected
- [ ] Shell metacharacters rejected in all inputs used in command construction
- [ ] All subprocess calls use argument arrays, never string interpolation
- [ ] Double encoding detected and rejected or normalized
- [ ] Query params (`?`) and fragments (`#`) rejected in resource identifiers
- [ ] Output files sandboxed to CWD or `--output` directory
- [ ] Symlinks not followed when writing output
- [ ] Secrets never accepted via CLI flags; env vars, files, or stdin only
- [ ] Credential files verified for restrictive permissions (600)
- [ ] All rejections logged to stderr with structured messages
- [ ] Validation happens at the CLI boundary, before business logic
