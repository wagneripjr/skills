# Report format

The structure every Farley Score report follows. Every section is required; the Tautology Theatre
Analysis keeps all four subsections even when empty, writing "None detected." so a reader can tell
"looked and found nothing" from "never looked".

```
# Test Design Review

## Farley Index: X.X / 10.0 (Rating)

### Property Breakdown

| Property | Static | LLM | Blended | Weight | Weighted | Key Evidence |
|---|---|---|---|---|---|---|
| Understandable | X.X | X.X | X.X | 1.50x | X.XX | ... |
| Maintainable | X.X | X.X | X.X | 1.50x | X.XX | ... |
| Repeatable | X.X | X.X | X.X | 1.25x | X.XX | ... |
| Atomic | X.X | X.X | X.X | 1.00x | X.XX | ... |
| Necessary | X.X | X.X | X.X | 1.00x | X.XX | ... |
| Granular | X.X | X.X | X.X | 1.00x | X.XX | ... |
| Fast | X.X | X.X | X.X | 0.75x | X.XX | ... |
| First (TDD) | X.X | X.X | X.X | 1.00x | X.XX | ... |

### Signal Summary

| Signal | Count | Affects | Severity |
|---|---|---|---|
| {signal_name} | {count} | {properties} | {High/Medium/Low} |

### Tautology Theatre Analysis

Tests whose outcome is predetermined by their own setup, independent of production code. The defining test: "Would this test still pass if all production code were deleted?" If yes, it is tautology theatre.

#### Mock Tautologies

Configures a mock return value, then asserts that the mock returns it, with no production code in between.

| # | Test Method | Line | Mock Setup | Assertion |
|---|---|---|---|---|
| 1 | {method_name} | {line} | {mock setup} | {assertion} |

> If none detected: "None detected."

#### Mock-Only Tests

Every object in the test is a mock; no real class is instantiated or invoked.

| # | Test Method | Line | Evidence |
|---|---|---|---|
| 1 | {method_name} | {line} | {evidence} |

> If none detected: "None detected."

#### Trivial Tautologies

Assertions that are always true regardless of any code: `assertTrue(true)`, `assertEquals(1, 1)`.

| # | Test Method | Line | Assertion |
|---|---|---|---|
| 1 | {method_name} | {line} | {assertion} |

> If none detected: "None detected."

#### Framework Tests

Tests that verify language or framework behavior, not application code.

| # | Test Method | Line | Assertion | What It Actually Tests |
|---|---|---|---|---|
| 1 | {method_name} | {line} | {assertion} | {explanation} |

> If none detected: "None detected."

#### Tautology Theatre Summary

**{total}** tautology theatre instances across **{affected_methods}** of **{total_test_methods}** test methods: {count} mock tautologies, {count} mock-only tests, {count} trivial tautologies, {count} framework tests.

### Top 5 Worst Offenders

1. {file}:{line} {method} -- {severity} -- {signals and key issues}
2. ...

### Recommendations

1. {highest-impact improvement targeting weakest high-weight property}
2. ...
3. ...

### Methodology Notes

- Static/LLM blend: 60/40
- LLM model: {model_id}
- Files analyzed: {count} ({sampling_note})
- Test methods analyzed: {count}
- Language: {language}
- Framework: {framework}

### Dimensions Not Measured

Predictive, Inspiring, Composable, Writable (from Beck's Test Desiderata -- require runtime or team context)

### Reference

Based on Dave Farley's Properties of Good Tests:
https://www.linkedin.com/pulse/tdd-properties-good-tests-dave-farley-iexge/

Scoring methodology by Andrea Laforgia:
https://github.com/andlaf-ak/claude-code-agents/tree/main/test-design-reviewer
```

---

## Rating Scale

| Farley Index | Rating | Interpretation |
|---|---|---|
| 9.0 - 10.0 | Exemplary | Model for the industry; tests serve as living documentation |
| 7.5 - 8.9 | Excellent | High quality with minor improvement opportunities |
| 6.0 - 7.4 | Good | Solid foundation with clear areas for improvement |
| 4.5 - 5.9 | Fair | Functional but needs significant attention to test design |
| 3.0 - 4.4 | Poor | Tests provide limited value; major refactoring needed |
| 0.0 - 2.9 | Critical | Tests may be harmful; consider rewriting from scratch |
