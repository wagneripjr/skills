# Common Edge Cases

Input patterns and boundary conditions for exploratory testing. Use these as a reference when constructing test inputs — not every pattern applies to every interface, but scanning this list prevents forgetting common failure modes.

## Strings

| Pattern | Value | What It Catches |
|---------|-------|-----------------|
| Empty | `""` | Missing required-field validation |
| Whitespace only | `"   "` | Trim-then-validate failures |
| Very long | 10,000+ characters | Buffer overflows, DB column truncation, UI overflow |
| Unicode | `"café naïve résumé"` | Encoding mismatches, collation issues |
| Emoji | `"Test 🎉👨‍👩‍👧‍👦"` | Multi-byte character handling, DB charset |
| CJK characters | `"测试テスト테스트"` | Encoding, text width calculations |
| RTL text | `"مرحبا"` | Layout direction handling |
| HTML tags | `"<b>bold</b>"` | XSS if rendered unescaped |
| Script injection | `"<script>alert(1)</script>"` | XSS vulnerability |
| SQL injection | `"'; DROP TABLE users;--"` | SQL injection vulnerability |
| Null byte | `"test\x00hidden"` | Null byte injection, string truncation |
| Newlines | `"line1\nline2"` | Multiline handling in single-line fields |
| Path characters | `"../../../etc/passwd"` | Path traversal |
| Special JSON | `"key\": \"injected"` | JSON injection |

## Numbers

| Pattern | Value | What It Catches |
|---------|-------|-----------------|
| Zero | `0` | Division by zero, falsy-value bugs |
| Negative | `-1` | Missing non-negative validation |
| Very large | `9999999999999999` | Integer overflow, precision loss |
| MAX_INT+1 | `2147483648` (32-bit) | Integer overflow |
| Float precision | `0.1 + 0.2` | Floating point comparison bugs |
| NaN | `NaN` | Type coercion failures |
| Infinity | `Infinity` | Arithmetic edge cases |
| Negative zero | `-0` | Comparison and display bugs |
| Leading zeros | `007` | Octal interpretation, string/number mismatch |
| Scientific notation | `1e10` | Unexpected parsing |

## Dates and Times

| Pattern | Value | What It Catches |
|---------|-------|-----------------|
| Unix epoch zero | `1970-01-01T00:00:00Z` | Default/unset date confusion |
| Far future | `9999-12-31` | Date range validation, display overflow |
| Leap day | `2024-02-29` | Leap year handling |
| Invalid leap day | `2023-02-29` | Date validation |
| DST transition | Spring-forward/fall-back local times | Time ambiguity, off-by-one hour |
| Timezone boundary | `23:59:59Z` vs `00:00:00+01:00` | Day boundary, timezone conversion |
| Negative year | `-0001-01-01` | BC date handling |
| Millisecond precision | `2024-01-01T00:00:00.999Z` | Precision loss in storage or display |

## Collections

| Pattern | Value | What It Catches |
|---------|-------|-----------------|
| Empty array | `[]` | Missing empty-check, "no results" UI |
| Single item | `[x]` | Off-by-one in pagination, plural/singular text |
| Very large | 10,000+ items | Performance, memory, pagination |
| Deeply nested | 10+ levels deep | Stack overflow, recursive processing |
| Duplicates | `[a, a, a]` | Deduplication logic, key conflicts |
| Mixed types | `[1, "two", null]` | Type coercion, serialization |
| Null elements | `[null, null]` | Null handling in iteration |

## Files

| Pattern | Value | What It Catches |
|---------|-------|-----------------|
| Empty file | 0 bytes | Missing empty-check |
| Very large | 100MB+ | Memory issues, timeout, progress UX |
| Wrong encoding | UTF-16 where UTF-8 expected | Encoding detection failures |
| Missing file | Non-existent path | Error message quality, crash prevention |
| Symlink | Points to actual file | Symlink resolution, security |
| Directory | Path to directory instead of file | Type check, error message |
| Binary content | Binary data in text field/file | Encoding errors, corruption |
| No extension | File without `.ext` | MIME detection, type guessing |
| Long filename | 255+ characters | OS path limits |
| Special characters in name | `file (1).txt`, `naïve.md` | URL encoding, shell escaping |

## Network (for testing error handling)

| Pattern | Scenario | What It Catches |
|---------|----------|-----------------|
| Timeout | Slow endpoint or service | Timeout handling, loading UX |
| Connection refused | Service down | Error message, retry logic |
| DNS failure | Invalid hostname | Error differentiation |
| Slow response | 5-10 second delay | Loading states, user patience |
| Malformed response | Invalid JSON, wrong content-type | Parse error handling |
| Empty response | 200 with empty body | Null body handling |
| Partial response | Connection drops mid-transfer | Streaming/chunked handling |
