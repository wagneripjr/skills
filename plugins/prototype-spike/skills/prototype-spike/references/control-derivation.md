# Deriving controls from questions

The control panel is the agenda of the review. Each control is a question someone has not answered
yet, made flippable. This is what separates a prototype spike from a demo: a demo shows the happy
path, a spike lets you *take the path apart*.

Two question sources, and a good prototype usually mixes them:

- **acceptance criteria** — the client's questions, phrased as required behavior
- **technical unknowns** — the team's questions, phrased as "does this actually work"

## The matrix

Build it before writing markup. Rows are questions, columns are `control | observable state | caption`.

| Question | Control | Observable | Caption says |
|---|---|---|---|
| feature is off for this user | checkbox carrying the **real flag identifier** | entry routes elsewhere; the menu row disappears | which sites the flag gates |
| failure must not retry itself | failure-simulation checkbox | error state with an explicit retry action | that nothing retries on its own, and why (cost) |
| polling follows the server's pace | *none* — the live loop is the demonstration | successive poll states | what the server answered and the interval it dictated |
| the wait has a ceiling | *none* | timeout state after the real bound | the bound, in the real units |
| refresh must not reuse the cache | in-screen refresh affordance | a new request carrying the real force parameter | that the previous result was discarded |
| content must not reach the session | *none* — the real isolation attribute, verbatim | content renders, isolated | what the sandbox denies |
| leaving cancels the wait | *none* — invisible | nothing | **say it anyway** |
| does this mechanism hold up? | the mechanism runs for real, against real content | the result | what was just proven, and what remains unproven |
| what should the contract be? | live input for the parameter in question, real route wired | a real response | that the route is a **proposal** awaiting confirmation |
| what changes versus today? | the annotation toggle | outlines and "new" tags | the size of the diff |

## Both directions are gated

**Every control traces to a question.** A toggle that exists because it seemed useful is noise the
client has to evaluate.

**Every question reaches an observable state, or is narrated.** Some guarantees are invisible by
nature — cancellation, a request that is *not* sent, a header that is *not* attached. An invisible
guarantee with no caption is unfalsifiable: the client cannot agree or disagree with it, so it is not
really in the review. Say it in the caption and it becomes reviewable.

## Choosing control shape

- **checkbox** — a binary condition someone controls in the real system (a flag, an environment)
- **failure toggle** — an error branch that is expensive or impossible to trigger for real
- **text input** — a parameter the client will genuinely vary, so they can try their own values
- **in-screen affordance** — where the real UI would carry the action; do not lift it into the panel,
  or you have changed the screen you are asking them to review
- **no control** — the behavior happens for real and is narrated. Prefer this whenever the real
  system will actually do the thing; a simulated version of something you could have run for real is
  a weaker piece of evidence.

## The refusal case

If every row's control demonstrates behavior that is already settled, and no row is a technical
unknown, the artifact has nothing to ask. Say so and route the requirement to a scenario walkthrough
— cheaper to produce, and honest about the fact that the decision was already made.

Symptom to watch for: a matrix where every caption describes a feature rather than answering a
question. That is a product tour, and its review yields "looks good" and no deltas.
