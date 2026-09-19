# Jev signal judge (optional)

`scripts/jev_judge.py` asks TypeSafe's Jev model eight yes/no questions about each test method. It turns the answers into signal counts in code. This replaces the part of Phase 2 that is otherwise a by-eye tally: tautology theatre, mock anti-patterns, behaviour-named tests, and single-outcome assertions. It feeds **only the static leg**. The semantic 40% leg stays with you, so the two legs remain independent.

## When it runs

All three conditions must hold. If any one fails, do Phase 2 exactly as written in SKILL.md and record `Signal judge: host model` in the report.

1. `TYPESAFE_API_KEY` is set in the environment.
2. `uv` is on PATH. The script declares its dependency (`typesafe-sdk`) inline, and uv installs it into its own cached environment, never into the project. The first run downloads the SDK.
3. **The user consents on this run.** Ask: "Send the test source to api.typesafe.ai for per-method signal detection?" Do not treat an API key found in the environment as consent. The key may be global, and the code may belong to a client.

## Running it

After Phase 2 step 1 (method boundaries), write a JSON list of methods to a temporary file outside the project. Each entry looks like this:

```json
{"file": "tests/test_orders.py", "line": 42, "name": "test_rejects_expired_card",
 "framework": "pytest", "source": "<the method's full text>",
 "setup": "<fixtures, setUp/beforeEach and helpers it uses, or \"\" if none>",
 "imports": "<the file's import lines>"}
```

```bash
uv run "<skill-dir>/scripts/jev_judge.py" /tmp/farley-methods.json
```

| Exit | Meaning | What to do |
|---|---|---|
| 0 | Judged | Use the output below |
| 77 | No key | Fall back to the host-model read |
| 1 | Service failure | Fall back, and name the error in Methodology Notes |
| 2 | Bad input | Fix the methods file and rerun |

Send `setup` even when it is empty. A method without the key is escalated, because judging "mock-only" without seeing the fixtures would be a guess.

## Using the output

- `counts[P].neg_count` and `counts[P].pos_count` add to your code-detected counts for property P. Examples of code-detected signals: sleeps, I/O, clock and random calls, trivial `assertTrue(true)`, reflection. Pass the totals to `full-pipeline`.
- `methods[].fired` names each signal that hit a method, with `file` and `line`. Build the Tautology Theatre tables and the worst-offender list from these:
  - `mock_tautology` goes in the Mock Tautologies table.
  - `mock_only` goes in the Mock-Only Tests table.
  - `framework_test` goes in the Framework Tests table.
  - `production_code_not_exercised` on its own, without a more specific label, is still tautology theatre: the test would pass with the production code doing nothing. Say so under the closest table.
- `methods[].escalated` marks methods Jev was unsure about: some answer fell in [0.35, 0.65], or setup was missing. These methods are **not** in the counts. Read them yourself, apply the same eight checks, and add what you find to the counts.
- Methodology Notes: `Signal judge: jev-1.13.0 (<escalated_methods> of <total_methods> methods escalated to the host model)`.

A property gains at most one Jev negative and one Jev positive per method. So a test that is simultaneously a mock tautology, mock-only, and exercises nothing real costs N one signal, not three.

## What it deliberately does not judge

- **Trivial tautologies.** These are literal (`assertTrue(true)`, `assertEquals(1, 1)`), so a pattern match finds them.
- **Redundancy (N).** This is a suite-wide comparison, and one method in isolation cannot establish it.
- **Test-first chronology (T).** This is not in the source text.
- **Repeatable, Atomic, Fast.** These need cross-file reasoning: does this helper touch the disk?
- **Any 0-10 score.** Jev's Score answers are ordinal, and the model's own documentation warns against reading magnitudes between their levels.

## Known ceilings

- Every threshold is a starting point, not a calibrated value: 0.5 to count a signal, and [0.35, 0.65] to escalate. Confidence measures how concentrated Jev's answer is, not whether the answer is right.
- The model is pinned to `jev-1.13.0` rather than the `jev-latest` alias. An alias move would silently change the counts.
- Jev reads text literally, and English is its strongest language. Test names and comments in other languages may escalate more often.
