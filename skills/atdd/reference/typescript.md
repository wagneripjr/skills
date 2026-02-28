# ATDD with Protocol Drivers in TypeScript

## Folder Structure

```
project/
  specs/                       # Executable specifications (business language only)
    login.spec.ts
  dsl/                         # DSL methods — assertion layer
    login-dsl.ts
    driver-setup.ts            # Driver selection via env var
  drivers/                     # Protocol driver implementations
    app-driver.ts              # Interface definition
    http-driver.ts             # HTTP protocol driver (fetch)
    in-memory-driver.ts        # In-memory protocol driver (direct imports)
  src/                         # Production code
    users/
      user-service.ts
      user-repository.ts
  tests/                       # Unit tests (inner TDD loop, vitest)
    users/
      user-service.test.ts
  features/                    # Optional: Cucumber/BDD specs
    login.feature
    steps/
      login.steps.ts
  vitest.config.ts
  cucumber.js
  tsconfig.json
  package.json
```

Use **Vitest** as the primary test runner. Jest works as an alternative — replace `import { expect } from "vitest"` with `expect` from `@jest/globals` and swap `vitest.config.ts` for `jest.config.ts`.

## Test Runner Setup

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "acceptance",
          include: ["specs/**/*.spec.ts"],
          testTimeout: 30_000,
          hookTimeout: 15_000,
        },
      },
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          testTimeout: 5_000,
        },
      },
    ],
  },
});
```

Run acceptance specs and unit tests separately:

```bash
npx vitest --project acceptance    # outer loop — acceptance specs
npx vitest --project unit          # inner loop — unit tests
npx vitest                         # both
```

## Protocol Driver Interface

Define the contract that every driver must fulfill. The interface is protocol-agnostic — it speaks in domain terms.

```typescript
// drivers/app-driver.ts
export interface AppDriver {
  /** Register a new user account. */
  createUser(username: string, password: string): Promise<void>;

  /** Attempt to log in with the given credentials. */
  login(username: string, password: string): Promise<void>;

  /** Retrieve the current page the user sees after login. */
  getCurrentPage(): Promise<{ title: string; welcomeMessage: string }>;

  /** Return the last error produced by the system. */
  getLastError(): { message: string; statusCode: number };

  /** The username of the currently authenticated user. */
  currentUsername: string;
}
```

No assertions, no HTTP codes, no implementation leakage. This interface belongs in `docs/adr/` as a design artifact and is implemented here as code.

## HTTP Protocol Driver

Talks to the running application over HTTP using Node 18+ native `fetch`.

```typescript
// drivers/http-driver.ts
import type { AppDriver } from "./app-driver.js";

export class HttpAppDriver implements AppDriver {
  currentUsername = "";
  private lastError: { message: string; statusCode: number } = {
    message: "",
    statusCode: 0,
  };
  private authToken = "";

  constructor(private baseUrl: string) {}

  async createUser(username: string, password: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json();
      this.lastError = { message: body.error, statusCode: res.status };
      throw new Error(`createUser failed: ${res.status} ${body.error}`);
    }
  }

  async login(username: string, password: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const body = await res.json();

    if (!res.ok) {
      this.lastError = { message: body.error, statusCode: res.status };
      this.currentUsername = "";
      return; // Do not throw — DSL asserts the error
    }

    this.authToken = body.token;
    this.currentUsername = username;
    this.lastError = { message: "", statusCode: 0 };
  }

  async getCurrentPage(): Promise<{ title: string; welcomeMessage: string }> {
    const res = await fetch(`${this.baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });

    if (!res.ok) {
      const body = await res.json();
      this.lastError = { message: body.error, statusCode: res.status };
      return { title: "", welcomeMessage: "" };
    }

    const body = await res.json();
    return { title: body.title, welcomeMessage: body.welcomeMessage };
  }

  getLastError(): { message: string; statusCode: number } {
    return this.lastError;
  }
}
```

Key design decisions: `login` does not throw on auth failure — it stores the error for the DSL to assert. The driver translates HTTP mechanics into domain-relevant data. No assertions here (Gate G5).

## In-Memory Protocol Driver

Calls domain modules directly. No network, no serialization. Provides fast feedback (~1ms vs ~100ms for HTTP).

```typescript
// drivers/in-memory-driver.ts
import type { AppDriver } from "./app-driver.js";
import { UserService } from "../../src/users/user-service.js";
import { InMemoryUserRepository } from "../../src/users/user-repository.js";

export class InMemoryAppDriver implements AppDriver {
  currentUsername = "";
  private lastError: { message: string; statusCode: number } = {
    message: "",
    statusCode: 0,
  };
  private userService: UserService;

  constructor() {
    const repo = new InMemoryUserRepository();
    this.userService = new UserService(repo);
  }

  async createUser(username: string, password: string): Promise<void> {
    await this.userService.register(username, password);
  }

  async login(username: string, password: string): Promise<void> {
    try {
      await this.userService.authenticate(username, password);
      this.currentUsername = username;
      this.lastError = { message: "", statusCode: 0 };
    } catch (err: unknown) {
      const error = err as Error;
      this.currentUsername = "";
      this.lastError = { message: error.message, statusCode: 401 };
    }
  }

  async getCurrentPage(): Promise<{ title: string; welcomeMessage: string }> {
    return {
      title: "Home",
      welcomeMessage: `Welcome back, ${this.currentUsername}`,
    };
  }

  getLastError(): { message: string; statusCode: number } {
    return this.lastError;
  }
}
```

The in-memory driver imports production code from `src/` and wires it with in-memory implementations of repository interfaces. Use this driver during the inner TDD loop for sub-second feedback. The HTTP driver validates the full stack including serialization and routing.

## DSL Module

The DSL is the single place where assertions live. Specs call these functions — never the driver directly.

```typescript
// dsl/login-dsl.ts
import { expect } from "vitest";
import { driver } from "./driver-setup.js";

export async function givenRegisteredUser(
  username: string,
  password: string,
): Promise<void> {
  await driver.createUser(username, password);
}

export async function whenUserLogsIn(
  username: string,
  password: string,
): Promise<void> {
  await driver.login(username, password);
}

export async function thenUserSeesHomePage(): Promise<void> {
  const page = await driver.getCurrentPage();
  expect(page.title).toContain("Home");
  expect(page.welcomeMessage).toContain(driver.currentUsername);
}

export async function thenLoginIsRejectedWith(message: string): Promise<void> {
  const error = driver.getLastError();
  expect(error.message).toBe(message);
  expect(error.statusCode).toBeGreaterThanOrEqual(400);
}
```

## Executable Specification Example

Specs read like requirements. No URLs, HTTP codes, selectors, or method names — only business language (Gate G6).

```typescript
// specs/login.spec.ts
import { beforeAll, afterAll, describe, it } from "vitest";
import {
  givenRegisteredUser,
  whenUserLogsIn,
  thenUserSeesHomePage,
  thenLoginIsRejectedWith,
} from "../dsl/login-dsl.js";
import { setupDriver, teardownDriver } from "../dsl/driver-setup.js";

describe("User Login", () => {
  beforeAll(async () => {
    await setupDriver();
  });

  afterAll(async () => {
    await teardownDriver();
  });

  it("registered user can log in with valid credentials", async () => {
    await givenRegisteredUser("alice", "s3cret");
    await whenUserLogsIn("alice", "s3cret");
    await thenUserSeesHomePage();
  });

  it("rejects login with wrong password", async () => {
    await givenRegisteredUser("bob", "correct-password");
    await whenUserLogsIn("bob", "wrong-password");
    await thenLoginIsRejectedWith("Invalid credentials");
  });
});
```

## Driver Selection Configuration

Switch between HTTP and in-memory drivers via the `DRIVER` environment variable.

```typescript
// dsl/driver-setup.ts
import type { AppDriver } from "../drivers/app-driver.js";
import { HttpAppDriver } from "../drivers/http-driver.js";
import { InMemoryAppDriver } from "../drivers/in-memory-driver.js";

export let driver: AppDriver;

export async function setupDriver(): Promise<void> {
  const driverType = process.env.DRIVER ?? "memory";

  switch (driverType) {
    case "http":
      driver = new HttpAppDriver(process.env.BASE_URL ?? "http://localhost:3000");
      break;
    case "memory":
      driver = new InMemoryAppDriver();
      break;
    default:
      throw new Error(`Unknown driver type: ${driverType}`);
  }
}

export async function teardownDriver(): Promise<void> {
  // Clean up resources: close connections, stop servers, etc.
}
```

Run specs with either driver:

```bash
# Fast feedback — no server required
DRIVER=memory npx vitest --project acceptance

# Full integration — requires running server
DRIVER=http BASE_URL=http://localhost:3000 npx vitest --project acceptance
```

Both commands must produce the same pass/fail results. If they diverge, either the protocol driver has a bug or the in-memory driver is not faithful to the real system.

## Cucumber/BDD Integration

For teams that prefer Gherkin `.feature` files. The DSL and drivers remain identical — only the spec format changes.

### Feature File

```gherkin
# features/login.feature
Feature: User Login

  Scenario: Registered user logs in with valid credentials
    Given a registered user "alice" with password "s3cret"
    When the user logs in as "alice" with password "s3cret"
    Then the user sees the home page

  Scenario: Login rejected with wrong password
    Given a registered user "bob" with password "correct-password"
    When the user logs in as "bob" with password "wrong-password"
    Then login is rejected with "Invalid credentials"
```

### Step Definitions

```typescript
// features/steps/login.steps.ts
import { Given, When, Then, Before, After } from "@cucumber/cucumber";
import {
  givenRegisteredUser,
  whenUserLogsIn,
  thenUserSeesHomePage,
  thenLoginIsRejectedWith,
} from "../../dsl/login-dsl.js";
import { setupDriver, teardownDriver } from "../../dsl/driver-setup.js";

Before(async function () {
  await setupDriver();
});

After(async function () {
  await teardownDriver();
});

Given(
  "a registered user {string} with password {string}",
  async function (username: string, password: string) {
    await givenRegisteredUser(username, password);
  },
);

When(
  "the user logs in as {string} with password {string}",
  async function (username: string, password: string) {
    await whenUserLogsIn(username, password);
  },
);

Then("the user sees the home page", async function () {
  await thenUserSeesHomePage();
});

Then(
  "login is rejected with {string}",
  async function (message: string) {
    await thenLoginIsRejectedWith(message);
  },
);
```

### Cucumber Configuration

```javascript
// cucumber.js
export default {
  default: {
    requireModule: ["tsx"],
    require: ["features/steps/**/*.ts"],
    paths: ["features/**/*.feature"],
    format: ["progress-bar", "html:reports/cucumber.html"],
  },
};
```

### Package Scripts

```jsonc
// package.json (relevant scripts)
{
  "scripts": {
    "test:acceptance": "vitest --project acceptance",
    "test:unit": "vitest --project unit",
    "test:cucumber": "cucumber-js",
    "test": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "@cucumber/cucumber": "^11.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

Run Cucumber specs with the same driver selection:

```bash
DRIVER=memory npx cucumber-js
DRIVER=http BASE_URL=http://localhost:3000 npx cucumber-js
```

Step definitions call the same DSL functions as vitest specs. The protocol drivers are shared. Switching from vitest specs to Cucumber (or using both) requires zero changes to the DSL or driver layers.
