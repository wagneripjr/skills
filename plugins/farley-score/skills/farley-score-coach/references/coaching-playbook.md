# Coaching playbook

Teaching patterns, the practice-test catalogue, the command surface, and the intervention and mastery rules the coach applies.

- [Example Session](#example-session) — one full coaching cycle, start to re-score
- [Dave Farley's Test Quality Teaching](#dave-farleys-test-quality-teaching) — six teaching patterns
- [Built-in Practice Tests](#built-in-practice-tests) — the sample suite and which anti-pattern each test plants
- [Commands](#commands)
- [Intervention Counter](#intervention-counter)
- [Success Tracking](#success-tracking) — when to recommend mastery, and when not to
- [Progress Tracking](#progress-tracking)
- [Learning Paths](#learning-paths)
- [Common Learning Patterns](#common-learning-patterns)

## Example Session

```
You: /farley-score-coach help me improve my test quality

Coach: Great! Let's start by looking at your tests. Which test file
       would you like to improve?

You: tests/test_calculator.py

Coach: I've read through your tests. Before I share my analysis,
       let me ask you a question:

       Look at this test:

       def test_calc(self):
           c = Calculator()
           assert c.add(2, 3) == 5
           assert c.subtract(5, 3) == 2
           assert c.multiply(2, 3) == 6

       Which of Dave Farley's 8 Properties do you think this test
       violates? (Hint: think about what happens when it fails)

You: It's testing too many things at once?

Coach: Exactly! You've identified a Granularity issue.

       This test checks three DIFFERENT behaviors (add, subtract,
       multiply) in one test. If multiply fails, the test name
       "test_calc" doesn't tell you what broke.

       Dave Farley says tests should be GRANULAR -- each test verifies
       a single outcome so failures pinpoint the exact issue.

       Can you refactor this into separate tests? Try using the naming
       pattern: test_should_[action]_[condition]

You: [Refactors into three separate tests]

Coach: Excellent! Let me score the improvement:

       Before: Granular = 3.0 (multiple unrelated assertions)
       After:  Granular = 8.5 (single assertion per test, clear names)

       That's a big jump! And notice -- by fixing Granularity, you also
       improved Understandable (better names) and First/TDD (behavior-
       focused structure).

       Properties often improve together. Ready to look at the next
       weakest property?
```

---

## Dave Farley's Test Quality Teaching

### Pattern 1: Property Prediction

**Before scoring any test, I'll ask:**
- "What score would you give this test for Understandable?"
- "Which properties does this test satisfy? Which does it violate?"
- "On a scale of 0-10, how Repeatable is this test?"

**Why this matters:**
Predictions validate your understanding. If your prediction matches the analysis, you're developing test quality intuition. If it doesn't match, that's the most valuable learning moment.

**Coaching dialogue example:**
```
Coach: "Before I analyze this test, what score would you give it for
       Repeatable? Remember, Repeatable means same result every time,
       anywhere, with no external dependencies."

You: "I'd say 8 out of 10 -- it looks pretty clean."

Coach: "Let's check... I see datetime.now() on line 15 and os.path.exists()
       on line 22. Those are environment-dependent. The Repeatable score
       is actually 4.0.

       What would you change to improve it?"

You: "Inject the time and use a temp directory?"

Coach: "Exactly! Dependency injection fixes both. That's Dave Farley's
       I/O testing pattern -- isolate external dependencies and pass them in."
```

---

### Pattern 2: Tautology Theatre Recognition

**When you encounter mock-heavy tests, I'll ask:**
- "Would this test still pass if we deleted all production code?"
- "What is this test actually verifying?"
- "Is the test testing production behavior or the mocking framework?"

**Why this matters:**
Tautology theatre creates false confidence. Tests that only exercise mock machinery provide zero value while inflating coverage numbers.

**Coaching dialogue example:**
```
Coach: "Look at this test:

       mock_service.get_user.return_value = User('Alice')
       result = mock_service.get_user(1)
       assert result.name == 'Alice'

       Here's the key question: Would this test still pass if you
       deleted ALL production code?"

You: "Yes... it would. It's just testing what we told the mock to return."

Coach: "Exactly! This is a Mock Tautology -- logically equivalent to
       x = 5; assert x == 5. It tests Mockito (or unittest.mock),
       not your application.

       The fix: instantiate the REAL service with the mock as a
       dependency, then assert on the real service's output."
```

---

### Pattern 3: Behavior vs Implementation

**When tests are tightly coupled to implementation, I'll ask:**
- "Is this test verifying WHAT the code achieves, or HOW it does it?"
- "Would a behavior-preserving refactoring break this test?"
- "Does this test have more verify() calls than assert calls?"

**Why this matters:**
Tests that verify implementation (HOW) break when you refactor, even if behavior is preserved. Tests that verify behavior (WHAT) survive refactoring and serve as a safety net.

**Coaching dialogue example:**
```
Coach: "I see this test has 5 verify() calls and only 1 assertEquals().
       What does that tell you about what it's testing?"

You: "It's mostly checking method calls, not results?"

Coach: "Right! A high verify-to-assert ratio means the test is checking
       HOW the code works, not WHAT it achieves. This is a Maintainable
       anti-pattern.

       Dave Farley says tests should verify behavior -- the observable
       outputs and side effects -- not the internal method calls."
```

---

### Pattern 4: The 5.0 Question

**When discussing scoring, I'll explain the conservative base:**
- "When we detect NO signals for a property, we default to 5.0 (Fair)"
- "Why not 7.0 or 8.0? Because no evidence means no information, not good quality"
- "A 5.0 is honest uncertainty, not a judgment"

**Why this matters:**
Understanding conservative scoring prevents false confidence. Just because we can't detect problems doesn't mean there aren't any.

**Coaching dialogue example:**
```
Coach: "The static analysis shows no signals for Necessary. What score
       should that get?"

You: "Maybe 7? No problems found means it's good?"

Coach: "This is a common trap! We score it 5.0 -- Fair.

       No-signal means we don't have enough information. Maybe the tests
       are perfectly necessary. Or maybe there are subtle redundancies
       that static analysis can't detect. 5.0 is honest uncertainty.

       That's why we blend with LLM assessment (40%) -- the LLM can
       catch what static analysis misses."
```

---

### Pattern 5: Weight-Driven Priority

**When planning improvements, I'll focus on impact:**
- "U and M both have 1.5x weight -- they're the most impactful properties to improve"
- "Improving U from 5 to 7 adds 0.33 to the Farley Index. Improving F from 5 to 7 adds only 0.17"
- "Focus energy where the weights multiply your effort"

**Coaching dialogue example:**
```
Coach: "Your property scores are:
       U: 5.0, M: 5.0, R: 8.0, A: 7.0, N: 6.0, G: 6.0, F: 9.0, T: 5.0

       If you could improve ONE property by 2 points, which should it be?"

You: "Fast is already high... maybe Understandable?"

Coach: "Smart choice! U has 1.5x weight. Improving U from 5.0 to 7.0
       adds (2 * 1.5) / 9.0 = 0.33 points to your Farley Index.

       If you improved F from 9.0 to 10.0 (already near max), that's
       only (1 * 0.75) / 9.0 = 0.08 points.

       Always invest effort in the highest-weighted, lowest-scoring
       properties first. That's where the leverage is."
```

---

### Pattern 6: Signal Hunting

**To develop signal recognition skills, I'll challenge you:**
- "Can you spot the negative signals in this test?"
- "Which properties do each of these signals affect?"
- "How many positive signals can you identify?"

**Coaching dialogue example:**
```
Coach: "Here's a test. How many signals can you spot?

       @Test
       void test1() throws Exception {
           Field field = MyClass.class.getDeclaredField('secret');
           field.setAccessible(true);
           Thread.sleep(100);
           MyClass obj = new MyClass();
           field.set(obj, 'value');
           assertEquals('value', field.get(obj));
       }

       List the signals and which properties they affect."

You: "Thread.sleep affects Repeatable and Fast.
      getDeclaredField/setAccessible is reflection -- affects Maintainable.
      test1 is a cryptic name -- affects Understandable."

Coach: "Excellent! You found 3 out of 4. You missed one:

       The test is accessing a PRIVATE field via reflection, which means
       it's testing implementation, not behavior. That also affects
       Maintainable AND First/TDD (test-first wouldn't test private fields).

       Your signal-hunting skills are developing nicely!"
```

---

## Built-in Practice Tests

**The plugin includes sample tests with deliberate anti-patterns -- perfect for coaching exercises.**

To locate them, resolve the plugin directory (see Knowledge Base above), then find:
- `<plugin-root>/skills/farley-score/assets/examples/sample-project/tests/test_calculator.py` -- 13 tests (3 good + 10 bad)
- `<plugin-root>/skills/farley-score/assets/examples/sample-project/tests/test_user_service.py` -- 8 tests (4 good + 4 bad)

### How to Use in Coaching

**Quiz Mode:** Show the learner a specific test from the sample files and ask them to identify which properties it violates before revealing the answer.

**Example coaching sequence using sample tests:**

```
Coach: "Let's practice with a real test. Here's one from our sample suite:

       def test_true_is_true(self):
           self.assertTrue(True)

       Before I say anything -- which of the 8 properties does this violate,
       and what kind of anti-pattern is this?"

You: "It doesn't test anything real... Necessary?"

Coach: "Exactly! This is a Trivial Tautology -- it will ALWAYS pass regardless
       of any production code. It violates:
       - Necessary (N): it tests nothing meaningful
       - First/TDD (T): no one writes assertTrue(True) test-first

       Now let's look at a trickier one:

       def test_mock_returns_configured_value(self):
           mock_calc = MagicMock()
           mock_calc.add.return_value = 42
           result = mock_calc.add(1, 2)
           self.assertEqual(result, 42)

       This one is more subtle. What's wrong with it?"

You: "It's testing the mock, not real code?"

Coach: "Yes! This is a Mock Tautology -- logically equivalent to x = 42;
       assert x == 42. No production code is exercised. Compare it with
       a GOOD test from the same suite:

       def test_should_add_two_positive_numbers(self):
           calc = Calculator()
           result = calc.add(2, 3)
           self.assertEqual(result, 5)

       See the difference? Real class, real method, real assertion."
```

**Anti-patterns available in sample tests:**

| Anti-Pattern | Sample Test | Properties Affected |
|---|---|---|
| Trivial tautology | `test_true_is_true`, `test_one_equals_one` | N, T |
| Mock tautology | `test_mock_returns_configured_value` | N, T |
| Mock-only test | `test_mock_only_no_real_code` | N, T |
| Framework test | `test_python_addition`, `test_python_string_methods` | N |
| Mega-test | `test_all_operations` (6 assertions) | G, U |
| Shared mutable state | `test_shared_state_add/history` | R, A |
| `time.sleep()` | `test_add_with_delay` | F, R |
| Private access | `test_history_internal_structure` | M |
| Over-specified mocks | `test_register_calls_everything_in_order` | M |
| Cryptic name | `test_it_works` | U |

**Use these strategically based on coaching mode:**
- **Beginner:** Start with trivial tautologies and mega-tests (easiest to spot)
- **Intermediate:** Move to mock tautologies and shared state (require deeper thinking)
- **Advanced:** Challenge with over-specified mocks and implementation coupling (subtle)

**Comparison exercises:** Ask the learner to compare a good test with its bad counterpart from the same file. For example, compare `test_should_save_user_to_database_on_registration` (good) with `test_mock_only_no_real_code` (bad) and explain why one exercises real behavior while the other is pure tautology.

---

## Commands

### Start a Learning Session
```
/farley-score-coach [target]
/farley-score-coach help me improve test quality in tests/
/farley-score-coach review my test design
/farley-score-coach I want to learn about the 8 properties
```

### Get Feedback on Your Test
```
/farley-score-coach review
# Coach reads your test code and gives property-by-property feedback
```

### Get Unstuck
```
/farley-score-coach show me
# Coach shows an example of improving a specific property
```

### Check Your Progress
```
/farley-score-coach progress
# Shows property improvements over the session
```

### Practice with Built-in Samples
```
/farley-score-coach practice
# Coach uses the bundled sample tests to quiz you on anti-patterns
/farley-score-coach practice tautologies
# Focused practice on tautology detection
```

### Adjust Difficulty
```
/farley-score-coach mode:beginner
/farley-score-coach mode:intermediate
/farley-score-coach mode:advanced
```

---

## Intervention Counter

**Track the number of times you need to step in and correct/guide the learner within a single coaching cycle.**

An "intervention" is when you need to:
- Correct a fundamental misunderstanding of a property
- Show them the right approach after they tried the wrong way
- Explain a concept they should already know at their level
- Guide them away from anti-patterns they should recognize
- Fix significant mistakes in their test refactoring

**Do NOT count as interventions:**
- Minor terminology corrections
- Answering clarifying questions
- Providing examples they requested
- Normal Socratic questioning
- Positive reinforcement and encouragement

### The 4-5 Intervention Threshold

**If you've made 4-5 interventions in a single session or on a single property:**

**PAUSE and say:**

```
+-- Learning Checkpoint -----------------------------------------------+
|                                                                       |
| I've noticed we've needed several course corrections today.          |
| This suggests the concepts might be moving too fast.                 |
|                                                                       |
| Before we continue, I recommend these resources:                     |
|                                                                       |
| 1. Dave Farley's "Properties of Good Tests" article:                 |
|    https://www.linkedin.com/pulse/tdd-properties-good-tests-         |
|    dave-farley-iexge/                                                |
|                                                                       |
| 2. Dave Farley's FREE TDD Tutorial:                                 |
|    https://www.youtube.com/watch?v=KtHQGs3zFAM                      |
|                                                                       |
| These cover the foundations that make coaching more effective.        |
|                                                                       |
| Want to:                                                              |
| 1. Pause and read/watch (recommended)                                |
| 2. Continue coaching (we'll slow down)                               |
| 3. Switch to /farley-score (see autonomous analysis in action)  |
|                                                                       |
+-----------------------------------------------------------------------+
```

**Wait for their choice. Do not proceed until they respond.**

### After Recommendation

**If they choose Option 1 (read/watch):**
```
Take your time with these resources. Pay attention to:
- How Dave defines each property and why they matter
- The relationship between properties (improving one often improves others)
- The difference between testing behavior vs testing implementation

When you're ready, come back and say:
"I've read the article -- let's practice improving test quality"
```

**If they choose Option 2 (continue):**
```
Let's slow down and be more deliberate.

I'll:
- Introduce one property at a time
- Give more examples before asking you to try
- Explain concepts more thoroughly

Your job:
- Ask questions when confused
- Don't rush -- test quality is about understanding, not speed
- Think about WHY each property matters
```

**If they choose Option 3 (switch to autonomous):**
```
Good idea! Watching /farley-score analyze real tests is a great
way to see the methodology in action.

You'll see:
- How signals are detected
- How properties are scored
- What the report looks like
- Where improvements would help most

After watching an analysis, come back to coaching mode and
you'll find these concepts much more concrete.
```

### Reset Counter

**Reset intervention counter to 0 when:**
- Learner completes a successful property improvement cycle
- Learner correctly identifies signals without help
- New property or session starts
- After recommending resources (whether they read or continue)

---

## Success Tracking

### Success Indicators (3-5 consecutive reviews)

- Correctly identifies weakest property without prompting
- Predicts property scores accurately (within 1 point)
- Spots tautology theatre independently
- Recognizes mock anti-patterns
- Refactors tests with measurable score improvement
- Explains property interdependencies
- Asks insightful questions about design trade-offs

### The Mastery Recommendation

**After observing 3-5 consecutive successful improvement cycles:**

```
+-- Outstanding Progress! ---------------------------------------------+
|                                                                       |
| I'm genuinely impressed with your test quality skills!               |
|                                                                       |
| What you've mastered:                                                |
| [check] You identify weak properties accurately                     |
| [check] You predict scores within 1 point                           |
| [check] You spot signals and anti-patterns independently             |
| [check] You refactor with measurable improvement                    |
| [check] You understand property interdependencies                   |
|                                                                       |
| You've outgrown this coaching tool!                                  |
|                                                                       |
| Next steps:                                                          |
|                                                                       |
| 1. Use /farley-score for routine test quality reviews           |
| 2. Apply what you learned test-first, on your next change            |
| 3. Dave Farley's full TDD & BDD course for advanced mastery:        |
|    https://courses.cd.training/courses/tdd-bdd-design-through-testing|
|                                                                       |
| Want to:                                                              |
| 1. Continue practicing (I'm still useful for feedback!)              |
| 2. Switch to /farley-score (autonomous reviews)                |
| 3. Learn about Dave's advanced course                                |
|                                                                       |
+-----------------------------------------------------------------------+
```

**Wait for their response. Do not proceed until they acknowledge.**

### When NOT to Recommend

**Do NOT recommend mastery if:**
- Less than 3 successful cycles completed
- Still needs frequent intervention/correction
- Hasn't demonstrated consistent pattern usage
- Just had one good cycle (could be luck)

**Only recommend when success is CONSISTENT and DEMONSTRATED.**

---

## Progress Tracking

Coach tracks your learning journey:

```
Your Test Quality Journey
+-- [check] Understanding the 8 Properties
+-- [check] Identifying negative signals
+-- [circle] Currently: Improving Maintainable property
+-- [arrow] Next: Tautology Theatre detection

Property Mastery:
- Understandable:   ########-- 80%
- Maintainable:     ######---- 60%
- Repeatable:       #########- 90%
- Atomic:           #######--- 70%
- Necessary:        ######---- 60%
- Granular:         ########-- 80%
- Fast:             #########- 90%
- First (TDD):      #####----- 50%

Session Improvements:
- Granular: 3.0 -> 8.5 (+5.5)
- Understandable: 4.0 -> 7.0 (+3.0)
- Farley Index: 4.8 -> 6.7 (+1.9)

Suggested Focus:
> Improve Maintainable next (1.5x weight, currently at 60%)
```

---

## Learning Paths

### Path 1: Test Quality Beginner

**For developers who write tests but haven't thought about test design quality.**

1. **Learn the 8 Properties** - What each one means with examples
2. **Practice identifying properties** - Look at existing tests, which properties do they satisfy?
3. **Improve Understandable** - Naming, structure, organization (easiest to improve)
4. **Improve Granular** - Single outcome focus (most common violation)
5. **Improve Repeatable** - Remove I/O dependencies (biggest reliability win)

**Practice routine:**
- Pick 3 test files daily, identify weakest property in each
- Refactor one test per day to improve one property
- Track score changes to see measurable progress

### Path 2: Know Testing, New to Farley Score

**For experienced developers who want a systematic quality framework.**

1. **Score existing test suite** - Run `/farley-score` to establish baseline
2. **Focus on weakest high-weight properties** - U (1.5x) and M (1.5x) first
3. **Learn Tautology Theatre detection** - Identify mock tautologies and mock-only tests
4. **Refactor mock-heavy tests** - Shift from implementation to behavior verification
5. **Track improvement** - Re-score after refactoring to measure impact

**Practice routine:**
- Review one test file per day through the lens of all 8 properties
- Focus on verify-to-assert ratio in mock-heavy tests
- Ask "Would this test pass if I deleted the production code?"

### Path 3: Want Mastery

**For developers who want deep expertise in test design quality.**

1. **Full signal detection** - Recognize all signals across all 5 supported languages
2. **Mock Anti-Pattern identification** - Distinguish AP1-AP4 and their severity
3. **Suite-level strategy** - Where to invest effort across a large test suite
4. **Weight optimization** - Strategic property improvement for maximum Farley Index impact
5. **Teaching others** - Explain the methodology to team members

**Practice routine:**
- Analyze competitors' open-source test suites and score them
- Write deliberately bad tests, then fix them property by property
- Practice scoring tests mentally before running the tool

---

## Common Learning Patterns

### "My tests pass, so they're good"

Coach: "Passing tests prove your code works NOW. But do they prove it STILL works after a refactoring? That's what Maintainable measures. And will they pass on a different machine? That's Repeatable. Passing is necessary but not sufficient for quality."

### "I don't know what to look for"

Coach: "Start with the easy ones. Read the test name -- does it describe a behavior? (Understandable). Count the assertions -- is there more than one? (Granular). Look for sleep(), file I/O, datetime.now() -- are there external dependencies? (Repeatable). Three checks and you've covered three properties."

### "Mocks are bad?"

Coach: "Mocks aren't bad -- bad mock USAGE is bad. Using a mock to isolate a dependency is excellent (Atomic). But asserting that a mock returns what you told it to return is a tautology (Necessary). The question is always: 'Is production code being exercised between setup and assertion?'"
