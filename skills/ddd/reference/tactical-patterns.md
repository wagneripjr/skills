# Tactical DDD Patterns

Building blocks for domain models inside a bounded context. Each pattern has a specific role — misusing one (e.g., Entity where a Value Object fits) weakens the model.

## Aggregate

A cluster of domain objects treated as a single unit for data changes. The Aggregate Root is the single entry point — all external access goes through it.

**Purpose**: Protect business invariants. A transaction boundary — everything inside the aggregate is consistent after each operation.

**Design principles** (see `reference/aggregate-design-rules.md` for Vernon's four rules):
- One aggregate root per aggregate
- External objects reference the aggregate by its root's identity only — never hold direct references to internal entities
- The root enforces all invariants for the entire aggregate
- Delete the root → delete everything inside

**When to create an aggregate:**
- A cluster of objects with invariants that must be enforced together
- A consistency boundary — these objects must always be in a valid state together
- A natural transaction boundary

**When NOT to use:**
- Don't make everything an aggregate — isolated entities or value objects that don't protect invariants are not aggregates
- Don't make one giant aggregate containing half the domain — it creates contention and performance problems

**Example (conceptual):**
```
Aggregate: Order
  Root: Order (identity: OrderId)
  Internal entity: OrderLine (no independent identity outside Order)
  Value objects: Money, Quantity, ShippingAddress
  Invariants: total must equal sum of lines, cannot add lines to shipped order
  Events emitted: OrderPlaced, OrderShipped, OrderCancelled
```

## Entity

An object defined by its identity rather than its attributes. Two entities are the same if they have the same identity, even if all other attributes differ.

**Characteristics:**
- Has a unique identity that persists through state changes
- Has a lifecycle (created, modified, possibly deleted)
- Mutable — state changes over time
- Equality based on identity, not attribute values

**Identity design:**
- UUIDs: No coordination needed, globally unique, no sequential information leakage
- Natural keys: Domain-meaningful (ISBN, SSN, email) — use when the domain has a natural identifier
- Database sequences: Simple but couples identity to persistence

**When to use Entity:**
- The object must be tracked through time (a Customer, an Order, a Flight)
- Two instances with identical attributes are different things (two John Smiths are different customers)

**When to prefer Value Object instead:**
- No need to track identity over time
- Equality is determined by attribute values
- The object describes a characteristic, not a thing

## Value Object

An object defined entirely by its attributes. No identity. Immutable. Two value objects with the same attributes are interchangeable.

**Characteristics:**
- No identity — equality by attribute comparison
- Immutable — create a new one instead of modifying
- Side-effect-free — methods return new values, don't mutate state
- Self-validating — invalid state is impossible to construct

**Examples:**
- `Money(amount: 100, currency: "USD")` — $100 is $100 regardless of which instance
- `Address(street, city, state, zip)` — an address describes a location, not a tracked entity
- `DateRange(start, end)` — a period of time with built-in validation (start < end)
- `EmailAddress(value)` — validates format at construction, immutable thereafter

**Design preference: Favor value objects over entities.** They're simpler, safer (immutable), easier to test, and cheaper to create. Only use entities when identity tracking is genuinely needed.

**Entity vs Value Object decision:**

| Question | Entity | Value Object |
|----------|--------|-------------|
| Need to track over time? | Yes | No |
| Two identical instances are the same thing? | No (different identity) | Yes (same value) |
| State changes over its lifetime? | Yes | No (create new) |
| Needs a unique identifier? | Yes | No |

## Domain Event

Something that happened in the domain that domain experts care about. Named in past tense using ubiquitous language.

**Naming convention:** `<Subject><PastTenseVerb>` — `OrderPlaced`, `PaymentReceived`, `InventoryDepleted`, `CustomerUpgraded`

**Characteristics:**
- Immutable — what happened cannot be changed
- Named in past tense — it already occurred
- Carries sufficient data for consumers to react without querying back
- Timestamped — when it happened

**Payload design:**
- Include the aggregate identity that emitted the event
- Include the data that changed (not the entire aggregate state)
- Include enough context for consumers to process independently
- Do NOT include data from other aggregates — consumers fetch what they need

**When events cross bounded context boundaries**, they must be translated — the event's shape in the emitting context differs from how the consuming context interprets it. This translation is the Anticorruption Layer's job.

**Intra-aggregate vs inter-aggregate:**
- Intra: Used to enforce invariants within the aggregate (can be synchronous)
- Inter: Used for eventual consistency between aggregates (must be asynchronous or via messaging)

## Domain Service

A stateless operation that belongs to the domain but doesn't naturally fit in any Entity or Value Object.

**Characteristics:**
- Stateless — no instance variables, no lifecycle
- Named using ubiquitous language
- Operates on domain objects (entities, value objects, aggregates)
- Contains business logic — not infrastructure concerns

**When to use:**
- The operation involves multiple aggregates and doesn't belong to any one of them
- Forcing the operation into an entity would distort its meaning
- The operation represents a domain concept (e.g., "transfer funds between accounts")

**When NOT to use:**
- Don't create a domain service for every operation — most logic belongs in entities and value objects
- Don't confuse with Application Services (which orchestrate use cases but contain no business logic)
- Don't confuse with Infrastructure Services (which handle technical concerns like email sending, file storage)

**Service layer distinction:**

| Layer | Contains | Example |
|-------|----------|---------|
| Domain Service | Business rules involving multiple aggregates | `FundsTransferService.transfer(from, to, amount)` |
| Application Service | Use case orchestration, transaction management | `TransferFundsUseCase.execute(command)` |
| Infrastructure Service | Technical concerns | `EmailService.send(message)` |

Gate G5 applies: business logic lives in the domain layer (entities, VOs, domain services), never in application services.

## Repository

Provides collection-like access to aggregates. One repository per aggregate root.

**Interface design principles:**
- Looks like a collection: `add`, `remove`, `findById`, `findByCriteria`
- No query language leakage — the interface speaks domain language, not SQL
- Returns fully reconstituted aggregates, not raw data
- Defined in the domain layer, implemented in infrastructure

**Interface, not implementation:** The repository interface belongs to the domain. The implementation (Postgres adapter, MongoDB adapter, in-memory for tests) belongs to infrastructure. This separation supports testability and the ability to swap persistence technology.

**One per aggregate root:** Never create repositories for internal entities — access internal entities through the aggregate root's repository.

**Example interface (language-agnostic):**
```
OrderRepository:
  save(order: Order): void
  findById(id: OrderId): Order | null
  findByCustomer(customerId: CustomerId): Order[]
  remove(order: Order): void
```

## Factory

Encapsulates complex object or aggregate creation. Enforces invariants at birth.

**When to use:**
- Creation logic is complex (multiple steps, conditional logic)
- The object needs to be valid from the moment of creation
- Creating the object requires knowledge that shouldn't belong to the caller
- Multiple types could be created based on input parameters

**When NOT to use:**
- Simple construction — a constructor is sufficient
- No invariants to enforce at creation time
- Creation logic is straightforward and belongs to the object itself

**Types:**
- **Factory Method**: On the aggregate root or entity itself — `Order.create(customer, items)`
- **Standalone Factory**: Separate class when creation involves external concerns — `OrderFactory.createFromQuote(quote)`
- **Abstract Factory**: When the family of objects varies — `DriverFactory.forProtocol(protocol)`

**Invariant enforcement:** The factory is responsible for ensuring the created object is valid. If creation would violate business rules, the factory throws/returns an error — never creates an invalid object.

## Specification Pattern

Encapsulates a business rule as a composable, reusable predicate.

**Purpose:** Extract complex query criteria or validation rules into named, combinable objects.

**Example (conceptual):**
```
DelinquentCustomer = HasOverduePayments AND (DaysPastDue > 30)
EligibleForDiscount = IsPreferred AND (OrderTotal > 500)

# Compose:
TargetForCollection = DelinquentCustomer AND NOT InLegalDispute
```

**When to use:**
- The same business rule is used for querying AND validation
- Rules are complex and need to be combined (AND, OR, NOT)
- Rule names carry domain meaning ("DelinquentCustomer" vs inline conditional logic)
