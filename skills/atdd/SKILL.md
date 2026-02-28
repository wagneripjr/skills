---
name: atdd
description: "Use when implementing any feature using Acceptance Test-Driven Development — writes executable specifications with Given/When/Then DSL methods, builds protocol drivers as hexagonal adapters that bridge specs to the system-under-test via its real external protocol (HTTP, CLI, gRPC, message queue, browser), enforces the double-loop TDD cycle (outer ATDD acceptance loop + inner unit TDD loop), and gates every phase: no production code without a failing acceptance test, no protocol driver without a DSL method, no DSL method without a specification. Triggers on: 'ATDD', 'acceptance test', 'protocol driver', 'write specs first', 'outside-in TDD', 'double loop', 'executable specification'. Delegates inner unit TDD to superpowers:test-driven-development. NOT for exploratory/manual QA (use exploratory-qa). NOT for writing Playwright e2e tests directly (use playwright skill)."
---

# ATDD with Protocol Drivers

Implement features using Dave Farley's 4-layer acceptance testing architecture: Test Cases (executable specifications) call a DSL (domain-specific language) that delegates to Protocol Drivers (hexagonal adapters), which interact with the System Under Test via its actual external protocol. Every feature begins with a failing acceptance test. No exceptions.

## The 4-Layer Architecture

| Layer | Responsibility | Must NOT Contain |
|-------|---------------|-----------------|
| **Test Case** (Executable Specification) | Express business requirement in domain language | URLs, selectors, SQL, HTTP codes, method names |
| **DSL** (Domain-Specific Language) | Translate business concepts to driver calls; hold all assertions | Protocol details (URLs, headers, selectors) |
| **Protocol Driver** (Hexagonal Adapter) | Speak the SUT's protocol; return domain-relevant data | Assertions, business logic, test setup |
| **SUT** (System Under Test) | Run the application | Test-specific modifications |

Each layer only talks to the one directly below it.

## Hard Gates

Violation of any gate halts progress. No workaround. No exceptions.

| Gate | Rule |
|------|------|
| **G1** | Do NOT write production code until an acceptance test fails (RED observed) |
| **G2** | Do NOT create a protocol driver method without a DSL method that calls it |
| **G3** | Do NOT create a DSL method without a specification that uses it |
| **G4** | Tests NEVER call internal functions directly — all paths go Test → DSL → Driver → SUT |
| **G5** | Protocol drivers contain ZERO assertions — assertions live only in the DSL |
| **G6** | Specifications contain ZERO implementation details — no URLs, SQL, selectors, method names |

If the user explicitly says "skip ATDD for this" (e.g., for hotfixes, spikes, prototypes), comply but note the skip.

## Interface Detection

Identify how the SUT is accessed. Each interface type maps to a protocol driver type.

| SUT Interface | Protocol Driver Type | Primary Tool |
|---------------|---------------------|-------------|
| REST/GraphQL API | HTTP client | Language HTTP lib (`fetch`, `HttpClient`, `reqwest`, `net/http`) |
| CLI | Process spawner | Child process / exec |
| Web UI (browser) | Browser automation | Playwright — invoke `wagner-skills:playwright` |
| gRPC | gRPC client | Language gRPC lib |
| Message Queue | Queue publisher/consumer | SQS, RabbitMQ, Kafka client |
| Database (direct) | DB client | Language DB driver |

If the SUT exposes multiple interfaces (e.g., API + Web UI), create one protocol driver per interface. The DSL selects which driver to use. Specs must pass regardless of which driver is active — this is the "robot shopper" principle: tests work whether a human clicks the UI or a robot calls the API.

## Phase 1: Write Executable Specifications

Start from requirements in `docs/requirements/`. Each acceptance criterion becomes a specification. Specs are the test cases — they call DSL methods using business language only.

```typescript
// specs/login.spec.ts
describe("User Login", () => {
  it("registered user can log in with valid credentials", async () => {
    await givenRegisteredUser("alice", "s3cret");
    await whenUserLogsIn("alice", "s3cret");
    await thenUserSeesHomePage();
  });

  it("rejects login with wrong password", async () => {
    await givenRegisteredUser("alice", "s3cret");
    await whenUserLogsIn("alice", "wrong");
    await thenLoginIsRejectedWith("Invalid credentials");
  });
});
```

**Rules for specs:**
- Business language only: "registered user", "logs in", "sees home page"
- One behavior per spec — not a sequence of features
- No implementation details — no URLs, selectors, or SQL
- Spec file names match requirement identifiers where possible

## Phase 2: Define DSL Methods

The DSL is the assertion layer. Define methods that the specs call. Each DSL method orchestrates driver calls and asserts outcomes. The DSL knows WHAT to verify but not HOW to talk to the system.

```typescript
// dsl/login-dsl.ts
import { expect } from "vitest";
import { driver } from "./driver-setup";

export async function givenRegisteredUser(username: string, password: string) {
  await driver.createUser(username, password);
}

export async function whenUserLogsIn(username: string, password: string) {
  await driver.login(username, password);
}

export async function thenUserSeesHomePage() {
  const page = await driver.getCurrentPage();
  expect(page.title).toContain("Home");
  expect(page.welcomeMessage).toContain(driver.currentUsername);
}

export async function thenLoginIsRejectedWith(message: string) {
  const error = driver.getLastError();
  expect(error.message).toBe(message);
}
```

Assertions live in the DSL. Not in the test case, not in the driver.

## Phase 3: Build Protocol Driver

Define a driver interface, then implement it for each protocol the SUT supports.

```typescript
// drivers/app-driver.ts (interface)
export interface AppDriver {
  createUser(username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<void>;
  getCurrentPage(): Promise<{ title: string; welcomeMessage: string }>;
  getLastError(): { message: string };
  currentUsername: string;
}

// drivers/http-driver.ts — talks to the running API
export class HttpAppDriver implements AppDriver { /* HTTP calls */ }

// drivers/in-memory-driver.ts — calls domain directly (no network)
export class InMemoryAppDriver implements AppDriver { /* domain imports */ }
```

The DSL selects the driver via configuration. All specs pass with either driver. Load `reference/<language>.md` for complete implementations.

## Phase 4: RED (Outer Loop)

Run the acceptance test. It MUST fail. The failure must be for the RIGHT reason — the feature does not exist yet.

```bash
# Run acceptance tests — expect failure
npx vitest specs/              # TypeScript
pytest specs/                  # Python
dotnet test --filter Specs     # C#
go test ./specs/...            # Go
cargo test --test acceptance   # Rust
./vendor/bin/phpunit specs/    # PHP
```

If the error is about infrastructure (connection refused, missing dependency), fix that first — it is NOT a valid RED state. A valid RED shows the feature is absent, not that the test harness is broken.

## Phase 5: GREEN (Double Loop)

Implement the minimum production code to pass the acceptance test. Delegate the inner loop to `superpowers:test-driven-development`.

```
OUTER LOOP (this skill — ATDD)
  Failing acceptance test (RED)
    │
    │  INNER LOOP (superpowers:test-driven-development)
    │  ┌─ Write failing unit test
    │  ├─ Write minimum code to pass
    │  ├─ Refactor
    │  └─ Repeat until acceptance test passes
    │
  Acceptance test passes (GREEN)
```

The outer loop observes only acceptance test results. The inner loop drives internal design through unit tests.

**"The acceptance test tells you WHEN you are done. The unit tests tell you HOW to get there."**

## Phase 6: REFACTOR

With both acceptance and unit tests green:

- Refactor production code — unit tests guard correctness
- Refactor test infrastructure (DSL, drivers) for clarity and expressiveness
- Look for driver code shared across implementations — extract a base
- Run both acceptance and unit suites after every refactor

## Phase 7: Iterate

Pick the next acceptance criterion. Return to Phase 1. The cycle continues until all requirements in `docs/requirements/` are covered.

After all acceptance criteria are green, invoke `wagner-skills:exploratory-qa` for manual verification — ATDD proves the system meets specifications; exploratory QA discovers what specifications missed (edge cases, UX issues, cross-feature interactions).

## Cucumber/BDD Integration (Optional)

For teams that prefer natural-language `.feature` files over programmatic specs:

| Language | BDD Framework | Step Definitions |
|----------|--------------|-----------------|
| TypeScript | `cucumber-js` | `features/steps/*.ts` |
| C# | SpecFlow / Reqnroll | `StepDefinitions/*.cs` |
| Python | `behave` / `pytest-bdd` | `features/steps/*.py` |
| Go | `godog` | `*_test.go` |
| Rust | `cucumber-rs` | `tests/cucumber/*.rs` |
| PHP | Behat | `features/bootstrap/*.php` |

Cucumber adds a Gherkin parsing layer between specs and DSL. Step definitions call DSL methods — the DSL and drivers remain identical. Use Cucumber when non-developers need to read/write specs. Skip it when the team is all developers — programmatic specs are more maintainable and refactorable.

## Folder Structure Convention

```
project/
  docs/requirements/     # Acceptance criteria → input to Phase 1
  docs/adr/              # Protocol driver design decisions
  specs/                 # Executable specifications (Phase 1)
    login.spec.*
  dsl/                   # DSL methods (Phase 2)
    login-dsl.*
  drivers/               # Protocol driver implementations (Phase 3)
    app-driver.*         # Interface definition
    http-driver.*        # HTTP protocol driver
    in-memory-driver.*   # In-memory protocol driver
  src/                   # Production code (Phase 5)
  tests/                 # Unit tests (inner TDD loop)
```

Each language reference file adapts this structure to its ecosystem's conventions.

## Quick Reference

| Language | Reference | When to Load |
|----------|-----------|-------------|
| TypeScript (Jest/Vitest, fetch, Playwright) | [reference/typescript.md](reference/typescript.md) | Project uses TypeScript |
| Python (pytest, httpx, behave) | [reference/python.md](reference/python.md) | Project uses Python |
| C# (xUnit, HttpClient, WebApplicationFactory) | [reference/csharp.md](reference/csharp.md) | Project uses C# |
| Go (testing, net/http, httptest, godog) | [reference/go.md](reference/go.md) | Project uses Go |
| Rust (cargo test, reqwest, cucumber-rs) | [reference/rust.md](reference/rust.md) | Project uses Rust |
| PHP (PHPUnit, Guzzle, Behat) | [reference/php.md](reference/php.md) | Project uses PHP |

## Rules

1. **Robot shopper principle** — specs pass regardless of which driver is active. If swapping the driver breaks a spec, the abstraction leaks.
2. **Stub only what you don't own** — third-party services get stub drivers; your own services get real drivers.
3. **Delegate inner TDD** — invoke `superpowers:test-driven-development` for unit RED/GREEN/REFACTOR inside Phase 5.
4. **After ATDD, run QA** — invoke `wagner-skills:exploratory-qa` when all acceptance criteria are green.
5. **Driver interfaces in design docs** — define in `docs/adr/` or `docs/plans/`, implement in test code alongside `specs/`.
