# ATDD Scaffolding — Per-Stack Mapping

How `doc-this-promote` detects the project's spec runner and where it places `.feature` files, DSL stubs, and protocol driver interfaces.

## Detection algorithm

Scan project root + common subdirectories. First match wins:

| Signal | Stack | Spec Runner |
|--------|-------|-------------|
| `reqnroll.json` exists | C# / .NET | Reqnroll |
| `cucumber.js`, `cucumber.yml`, `.cucumberrc` | Node.js | Cucumber.js |
| `playwright.config.*` + `@playwright/bdd` in package.json | Node.js + Playwright | playwright-bdd |
| `behave.ini` or `[behave]` section in `setup.cfg` / `pyproject.toml` | Python | behave |
| `pytest.ini` + `pytest-bdd` in dependencies | Python | pytest-bdd |
| `*.feature` files in `features/` AND `go.mod` | Go | godog |
| `Cargo.toml` with `cucumber` dependency | Rust | cucumber-rs |
| SpecFlow legacy artifacts (`specflow.json`) | C# / .NET (legacy) | SpecFlow → recommend migration to Reqnroll |

If multiple match (rare): ask the user which to use.

If none match: **halt** and ask the user. Options:
1. Pick a runner to scaffold (Promote can `dotnet add package Reqnroll` etc., but only with explicit user approval — and never on customer projects)
2. Skip `.feature` generation; produce only the `docs/` artifacts; user adds the runner later

## Per-stack placement

### C# / Reqnroll

```
tests/
└── <Project>.Specs/
    ├── Features/
    │   └── <UnitName>.feature              # PascalCase
    ├── Steps/
    │   └── <UnitName>Steps.cs              # partial class with [Given]/[When]/[Then]
    ├── Drivers/                             # protocol driver implementations (dev team writes)
    │   └── (left empty, ADR + interface declared in docs/design/protocol-drivers.md)
    └── <Project>.Specs.csproj
```

DSL stub example:

```csharp
[Binding]
public partial class OrdersSteps
{
    private readonly IOrdersPublicApiDriver _api;
    private readonly IOrdersBrowserDriver _browser;

    public OrdersSteps(IOrdersPublicApiDriver api, IOrdersBrowserDriver browser)
    {
        _api = api;
        _browser = browser;
    }

    [Given(@"a customer with an active subscription")]
    public Task GivenACustomerWithAnActiveSubscription()
        => throw new NotImplementedException("TODO(orders): bridge to protocol driver");

    [When(@"they POST /api/orders with valid items")]
    public Task WhenTheyPostOrders()
        => throw new NotImplementedException("TODO(orders): bridge to IOrdersPublicApiDriver");

    [Then(@"the response is (\d+) with an order ID")]
    public Task ThenTheResponseIsWithAnOrderId(int statusCode)
        => throw new NotImplementedException("TODO(orders): assert HTTP response");
}
```

### Node.js / Cucumber.js

```
features/
├── orders.feature                            # kebab-case
└── step_definitions/
    ├── orders_steps.js                       # CommonJS (or .mjs / .ts depending on project)
    └── world.js                              # World setup with driver injection
```

DSL stub:

```javascript
const { Given, When, Then } = require('@cucumber/cucumber');

Given('a customer with an active subscription', async function () {
  throw new Error('TODO(orders): bridge to protocol driver');
});

When('they POST \\/api\\/orders with valid items', async function () {
  throw new Error('TODO(orders): bridge to IOrdersPublicApiDriver');
});

Then('the response is {int} with an order ID', async function (statusCode) {
  throw new Error('TODO(orders): assert HTTP response');
});
```

### Node.js / playwright-bdd

```
tests/
├── features/
│   └── orders.feature
├── fixtures.ts                               # Playwright + BDD test fixtures with driver DI
└── steps/
    └── orders.steps.ts
```

### Python / behave

```
features/
├── orders.feature
├── steps/
│   └── orders.py                             # @given/@when/@then decorators
└── environment.py                            # before_all, before_scenario hooks
```

### Python / pytest-bdd

```
tests/
├── features/
│   └── orders.feature
└── test_orders.py                            # @scenario(...) decorators
```

### Go / godog

```
features/
└── orders.feature
internal/specs/
└── orders_test.go                            # godog Init / step registration
```

### Rust / cucumber-rs

```
tests/
├── features/
│   └── orders.feature
└── world.rs                                  # World + step #[given]/#[when]/#[then]
```

## Protocol driver interface placement

Regardless of stack, the interfaces are declared in `docs/design/protocol-drivers.md` (project-wide). Implementations belong to the dev team; their location is per-stack:

- C#: `tests/<Project>.Specs/Drivers/<Driver>Impl.cs`
- Node: `tests/drivers/<driver>.ts`
- Python: `tests/drivers/<driver>.py`
- Go: `internal/specs/drivers/<driver>.go`
- Rust: `tests/drivers/<driver>.rs`

`docs/design/protocol-drivers.md` lists each interface with implementation guidance and which `.feature` file uses it (per-skill section in the file).

### Declaration format (appended per surface)

```markdown
## IOrdersPublicApiDriver

Bridges @api scenarios for the Orders public API to the system under test.

```csharp
public interface IOrdersPublicApiDriver
{
    Task<HttpResponseMessage> PlaceOrder(PlaceOrderRequest request);
    Task<Order> GetOrder(string orderId);
}
```

**Implementation notes**:
- Production driver: real HttpClient against the running API
- Test fixture driver: same client against a `WebApplicationFactory` instance

**Used by**: `tests/Acme.Specs/Features/Orders.feature`
```

For external-DB scenarios (when `database_ownership ∈ {external, mixed}`), declare an `I<Unit>DatabaseContractDriver`:

```markdown
## IInvoiceDatabaseContractDriver

Bridges @database scenarios for the externally-owned billing DB to the test infrastructure.

```csharp
public interface IInvoiceDatabaseContractDriver
{
    Task ExecuteCalculateInvoiceTotal(int orderId, decimal subtotal);
    Task<int> ReadInvoiceTotal(int orderId);
}
```

**Implementation notes**:
- Tests must run against a real (anonymized) snapshot of the external DB, not a mock
- Snapshot location: see ADR-NNN
**Used by**: `tests/Acme.Specs/Features/Invoice.feature`
```

**Source the driver interfaces from the external entry point, not the internal trace.** Each unit's `requirements.md` Realization map has two columns: an *external entry point* (page/endpoint) and an *internal realization* (service → proc → tables). Protocol-driver methods come from the **entry-point column only** — a driver bridges to the SUT's external interface (`IOrdersPublicApiDriver.PlaceOrder` → `POST /api/orders`). Never lift an internal-realization name into a driver method: `SaveDispatch` and `P_ADJUST_*` are SUT internals, not driver surface. This keeps the three-way separation intact: scenario = observable *what*, Realization map = internal *how*, protocol driver = external *bridge*.

## Cross-layer coverage per stack

**This plugin ships no cross-layer coverage gate.** Some projects run one of their own at commit time; the tagging below is what such a gate conventionally expects, and emitting it costs nothing in a project that has none.

The convention: in a UI-bearing project — a `.feature` file already containing `@browser`, or UI-stack indicators such as `playwright.config.*` or Vue/React/Svelte/Next/Nuxt in `package.json` — every `@api` scenario has a paired `@browser` (or `@browser-exempt`) in the same file.

Promote's job is to emit the right tags. Enforcing them, if anyone does, is the target project's. Promote-generated output satisfies the convention by default.

## When the project has NO spec runner yet

Two options:
1. **Wait**: Promote stages only `docs/requirements/`, `docs/adr/`, `docs/TRACEABILITY.md`, `docs/design/protocol-drivers.md`, `docs/okf.yaml`, and the generated `index.md` files (per `references/okf-conformance.md` — omit the `specs:` frontmatter key since no `.feature` exists yet). The dev team adds a spec runner later, then runs Promote in a `--features-only` mode (future enhancement) to generate the `.feature` files.
2. **Scaffold the runner**: Promote suggests the appropriate add-package command. The user approves explicitly. Then proceeds with full generation.

For CUSTOMER projects — any project outside your own or your organization's namespace — default is option 1: never modify the build configuration of customer code.
