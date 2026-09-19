---
name: farley-score
description: "Score test-suite quality with Dave Farley's 8 Properties of Good Tests (Understandable, Maintainable, Repeatable, Atomic, Necessary, Granular, Fast, First/TDD) and produce a weighted 0-10 Farley Index with per-property evidence, tautology-theatre and mock anti-pattern detection, the five worst tests, and prioritised recommendations. Read-only: it never edits code. Supports Java/JUnit, Python/pytest/unittest, JS/TS Jest/Vitest, Go testing, and C# NUnit/xUnit. Use whenever someone asks how good their tests are, not just how many: 'score my tests', 'farley score', 'farley index', 'review test quality', 'are these tests any good', 'find useless tests', 'tests that pass no matter what', 'too many mocks', 'test smells', or before trusting a suite's coverage number. NOT for measuring coverage or running tests. NOT for writing or fixing tests - it reports; the fixing is separate work. For learning to spot the problems yourself, use farley-score-coach."
---

# Farley Score: test design review

Measure test *quality*, not coverage. Read the suite, detect signals per test method, score each of the eight properties twice (once from static signals, once from semantic judgment), blend the two, and let the bundled calculator do all the arithmetic. The result is a Farley Index from 0 to 10 whose every number points to evidence in the code.

Start by reading [host-runtime.md](references/host-runtime.md). It covers path resolution and the Claude Code/Codex differences.

**Read-only.** Analyse only. Do not create, edit, rename or delete files in the project. The one exception is writing the report to `farley-score-report.md` at the project root, and only if the user asks for a file. If the user asks for fixes, point at the recommendations and say to apply them test-first. The value of the review depends on the reviewer not also being the author of the change.

## Entry point

**Invoked with a target** (a path, or "the whole project"): go straight to the workflow.

**Invoked bare**: ask with a menu, not a numbered list in prose. Question: "Welcome to Farley Score! What would you like to do?", header "Farley Score". Options:

1. **What is this?** Explain that the Farley Index measures test quality against the 8 properties and runs 0-10. Understandable and Maintainable weigh 1.5×, because tests that read like specifications and survive refactoring deliver the most long-term value. Fast weighs 0.75×, because a slow, well-designed test beats a fast, poorly designed one. The tool never modifies code. Show the rating scale from [report-format.md](references/report-format.md), then offer the menu again.
2. **Show me a demo.** Read `<skill-dir>/assets/examples/sample-project/farley-score-report.md` and present it. The bundled sample scores **5.7, Fair**, from 21 test methods: 7 well designed, 14 deliberately flawed. Walk through its highlights:
   - Understandable (4.9) and Maintainable (4.5) are the biggest opportunities, because they carry the most weight.
   - Fast scores 8.3, because the tests are almost all pure computation.
   - Six tautology-theatre tests would still pass with the production code deleted, `assert True` among them.
   - The worst offender is a test in which every object is a mock.

   Then offer to analyse the user's own tests.
3. **Analyse my tests.** Ask where the tests are, then run the workflow.
4. **Coach me.** Hand off to `farley-score-coach` (see host-runtime).

## The 8 properties

| Code | Property | Weight | What it measures |
|---|---|---|---|
| U | Understandable | 1.50× | Tests read like specifications: behaviour-driven names, clear organisation |
| M | Maintainable | 1.50× | They verify behaviour, not implementation, so they survive refactoring |
| R | Repeatable | 1.25× | Deterministic, with no time, filesystem, network or unseeded random dependency |
| A | Atomic | 1.00× | Isolated, with no shared mutable state, so they can run in parallel |
| N | Necessary | 1.00× | Each adds unique value, with no redundancy or trivial assertions |
| G | Granular | 1.00× | One outcome per test, so a failure pinpoints the issue |
| F | Fast | 0.75× | Pure computation, with no I/O or sleeps |
| T | First (TDD) | 1.00× | Evidence the tests drove the design |

## Principles, and why each holds

1. **Two independent legs.** Score each property from static signal density first (deterministic), then from a semantic read against the rubric. Blend them 60/40. The static leg keeps the score reproducible. The semantic leg catches what patterns cannot: a misleading name, an assertion that checks nothing.
2. **Per-method granularity.** Collect signals per test method, so that a single mega-test cannot hide inside a file average.
3. **Evidence or it did not happen.** Every signal carries a `file:line`, and every property score cites its signals. A score with no evidence is a guess.
4. **No signal means 5.0.** When nothing was detected for a property, its quality is unknown. It has not been shown to be good.
5. **Effort proportional to size.** Under 50 test files, analyse all of them. Over 50, take a deterministic sample: every file whose SHA-256 filename hash falls in the lowest 30%, plus every file with more than 100 test methods. Say in the report that you sampled.
6. **Language-aware detection.** Identify the test and mocking frameworks from imports before scanning. Java patterns applied to Python produce noise.
7. **The calculator does the math.** Never compute a normalized score, a blend or the index in prose. Run [the calculator](references/calculator.md).

## Workflow

### Phase 1: Discovery

- Locate test files by convention: `test/`, `tests/`, `*_test.*`, `*Test.*`, `*.spec.*`, `*.test.*`.
- Identify the language, test framework and mocking framework from imports and annotations.
- Count test files, test methods and lines of code. Apply the sampling rule if the suite has more than 50 files.
- **Gate:** language and framework are identified, the mocking framework is identified if one is present, and the inventory is complete.

### Phase 2: Signal collection

Read [signal-detection-patterns.md](references/signal-detection-patterns.md) now, not before. For each test method:

1. Find the method's boundaries, using the framework's markers.
2. Look for negative signals: sleep, reflection, shared state, ordering dependencies, I/O, magic numbers, cryptic names, trivial assertions, mega-tests.
3. Look for **tautology theatre**, meaning tests whose outcome is fixed by their own setup. Check setup and fixtures before flagging one.
   - **Mock tautology:** the test configures a mock's return value, then asserts on that same value with no production code in between. Affects N and M.
   - **Mock-only:** every object is a mock, and no real class under test is constructed. Affects N, M and T.
   - **Trivial tautology:** an assertion that is always true, such as `assertTrue(true)` or `assertEquals(1, 1)`. Affects N.
   - **Framework test:** the test verifies language or library behaviour, not application code. Affects N.
4. If a mocking framework is present, look for the mock anti-patterns. AP3 affects M, and A secondarily. AP4 affects M, and U secondarily.
   - **AP3, over-specified interactions:** exact call counts, call ordering, or `verifyNoMoreInteractions`.
   - **AP4, testing internal details:** deep inspection of captured arguments, or `never()` verifications that mirror the code's branches.
   - A plain `verify(mock).method()` confirming a side effect is legitimate. Do not flag it. An exact count (`times(1)`, `assert_called_once*`, `call_count ==`) is an AP3 signal, unless the count is itself the requirement, for example "charge the card exactly once". Say which reading you took.
5. Look for positive signals: behaviour names, nested organisation, parameterised tests, arrange-act-assert structure, builders, parallel markers. A method with no I/O, no real clock or randomness, and no sleep counts once as **pure computation**, a positive signal for both R and F. Without it, R has only negative signals, and one `sleep` would sink a suite that is otherwise deterministic.
6. Count assertions, and record `file:line` for everything.

A signal that bears on several properties counts toward each of them: `sleep` affects both R and F. **Gate:** the signal inventory covers all eight properties, and every signal has a location.

**Optional Jev judge.** Steps 3-5 are judgment calls made method by method. When `TYPESAFE_API_KEY` is set, `uv` is available and the user agrees to send test source to TypeSafe on this run, the bundled judge can make those calls instead. It returns calibrated per-method answers, and code turns them into counts. It never touches the semantic leg. Follow [jev-judge.md](references/jev-judge.md) exactly, including which methods come back to you. Without all three conditions, skip this and continue.

### Phase 3: Scoring

Read [farley-properties-and-scoring.md](references/farley-properties-and-scoring.md) for the rubrics.

- **Static leg.** Per property, total the negative and positive signal counts, then run `full-pipeline` with those counts and `total_methods`.
- **Semantic leg.** Score each property 0-10 against its rubric, with a one-line justification each. Focus on what patterns miss: naming quality, whether assertions are appropriate, influence on design, tautology theatre.
- **T is the exception.** Static evidence for test-first development is indirect, so lean on the semantic leg for T and say so in the methodology notes.
- **Blend.** Feed both legs to `full-pipeline` through `llm_scores`. It returns the static, blended and index values together with the rating.
- **Gate:** all eight properties are scored on both legs, and the index and rating come from the calculator.

### Phase 4: Report

Produce the report exactly as laid out in [report-format.md](references/report-format.md). It needs:

- the property breakdown;
- the signal summary;
- the tautology theatre analysis, with all four subsections even when one says "None detected.";
- the top 5 worst offenders;
- 3-5 recommendations;
- methodology notes, including sampling and the model used;
- the dimensions not measured.

Rank worst offenders by severity, not by a per-method index: tautology theatre and AP1/AP2 (Critical) first, then High signals, then by signal count. A per-method index would rank a test that asserts nothing above a useful but flawed one, because the six properties it does not touch still score the 5.0 base. Rank recommendations by weight × shortfall, so that fixing Understandable or Maintainable comes before fixing Fast when both are low. **Gate:** every required section is present.

## Supported languages

| Language | Test framework | Mocking |
|---|---|---|
| Java | JUnit 5, JUnit 4 | Mockito |
| Python | pytest, unittest | unittest.mock, pytest-mock |
| JavaScript/TypeScript | Jest, Vitest | Jest mocks, Sinon |
| Go | testing | testify/mock, gomock |
| C# | NUnit, xUnit | Moq, NSubstitute |

For any other stack, detect what you can and name the gap in the methodology notes rather than applying the nearest language's patterns.

## Attribution

This skill ports Bernard McCarty's MIT-licensed [Farley Score plugin](https://github.com/cd-training-courses/farley_score_plugin). The framework is Dave Farley's [Properties of Good Tests](https://www.linkedin.com/pulse/tdd-properties-good-tests-dave-farley-iexge/). The scoring system and signal detection are Andrea Laforgia's [test-design-reviewer](https://github.com/andlaf-ak/claude-code-agents/tree/main/test-design-reviewer), used with permission.
