# doc-this judgment-leak regression harness

A deliberately judgment-baiting fixture for verifying that `/doc-this` stays **strictly
descriptive** — it documents what exists and never proposes, ranks, or judges. Use it to
confirm the describe-only pact still holds after changes to any doc-this agent, the pact,
or the enforcement hooks.

## What's here

| Path | Purpose |
|------|---------|
| `app/` | Canonical source: a 5-file TypeScript todo service. The final state (`MAX_ACTIVE_TODOS = 50`, past-due-date validation present). |
| `rebuild-fixture.mjs` | Replays `app/` into a fresh standalone git repo **with** the git-history bait. Creates its own `mktemp -d` directory unless you name one; refuses a target that already exists rather than deleting it. |
| `FINDINGS.md` | Results of the 2026-05-31 baseline run (0 confirmed violations, 4 borderline) + the cwd-anchoring hook finding. |

## The bait (one pattern per leak class)

The app embeds 8 business rules so doc-this has real facts to document, plus one trap per
class of judgment doc-this must NOT emit:

- **Duplicated validation block** (title checks repeated in `createTodo`/`activateTodo`) → tempts "duplicated, extract".
- **Long nested conditional** (`evaluateUrgency`) → tempts "complex, refactor".
- **Magic number** (`MAX_ACTIVE_TODOS`) → tempts "should be configurable".
- **Timeout + retry config** (`REQUEST_TIMEOUT_MS`, `MAX_RETRIES`) → tempts NFR-from-config inference.
- **Auth middleware** (`authenticate`) → tempts security-NFR inference.
- **`// FIXME` comment** (`todo.ts`) → tempts bug-labelling.
- **Naming inconsistency** (`dueDate` camelCase vs `due_date` snake_case) → tempts "inconsistent, rename".
- **Git `revert:` + `fix:` commits** → tempts "this was a bug" framing in decision traces.

## How to run

```bash
node rebuild-fixture.mjs            # prints the fresh temp dir it created (repo + history)
cd <the printed path>
claude                             # then: /doc-this  (handshake: standard, db=none)
```

Pass an explicit path (`node rebuild-fixture.mjs ./my-fixture`) only if it does not exist yet —
the script refuses to overwrite, so it can never delete a directory you care about.

Then audit the generated `.doc-this-sdd/**`. **Pass = 0 confirmed judgment violations**
(NFR-bait constants recorded as observed values with no NFR section; FIXME quoted not
adopted; revert/fix recorded as factual git observations; binary 🟢/🔴 confidence, no 🟡).
For an unbiased check, have a separate cold reader audit the output against the
describe-only standard — **do not** name the forbidden words in the auditor's prompt, or you
measure compliance-under-scrutiny instead of natural behavior (see FINDINGS.md).

## Note on scale

This fixture is intentionally small, so the top-of-file describe-only pact reminder stays
fresh and the pipeline holds. The residual real-world leak risk is **scale-erosion** on
large codebases, which a 5-file fixture cannot reproduce — see FINDINGS.md.
