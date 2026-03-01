# Aggregate Design Rules

Vernon's four rules for effective aggregate design, plus practical guidance on consistency boundaries, sizing, and eventual consistency.

## Rule 1: Protect Business Invariants Within Aggregate Boundaries

The primary reason aggregates exist is to enforce business rules that span multiple objects. Every invariant that must hold true must be enforceable within a single aggregate.

**Identifying invariants:**
- "Must not exceed" — limits and thresholds
- "Only if" — preconditions
- "Always" — universal rules
- "Never" — prohibitions
- "Together" — multi-object consistency

**Example:**
- "An order's total must equal the sum of its line items" → Order and OrderLines belong in the same aggregate
- "A customer's credit limit must not be exceeded across all orders" → This invariant spans Order and Customer — do NOT put them in the same aggregate. Use a Domain Service or eventual consistency.

**Litmus test:** If two objects must be consistent within the same transaction, they belong in the same aggregate. If eventual consistency is acceptable, they belong in different aggregates.

## Rule 2: Design Small Aggregates

Prefer aggregates with the root entity and a minimal number of internal objects. Smaller aggregates mean:
- Less memory loaded per operation
- Less contention (fewer concurrent modifications conflict)
- Faster transactions
- Simpler mental model

**Start with single-entity aggregates.** Only add internal entities when Rule 1 demands it — when invariants genuinely require transactional consistency between them.

**Counter-pressure: Don't go too small.** If breaking an aggregate into smaller pieces means you can no longer enforce a business invariant within a single transaction, you've gone too small. The invariant dictates the minimum aggregate size.

## Rule 3: Reference Other Aggregates by Identity Only

Never hold direct object references from one aggregate to another. Use the target aggregate's identity (typically a typed ID like `CustomerId`, `OrderId`).

**Why:**
- Direct references create hidden coupling
- Loading one aggregate would cascade-load others (performance trap)
- Transactional boundaries become ambiguous
- Makes it impossible to place aggregates in different bounded contexts or services

**Instead of:**
```
class Order {
  customer: Customer  // ❌ Direct reference
}
```

**Use:**
```
class Order {
  customerId: CustomerId  // ✅ Identity reference
}
```

When the Order needs Customer data, the application service (or domain service) loads it through the CustomerRepository.

## Rule 4: Use Eventual Consistency Outside the Boundary

Operations that span multiple aggregates should use eventual consistency rather than forcing them into a single transaction.

**Mechanism:** Aggregate A completes its operation and emits a Domain Event. A handler (in the same or different bounded context) reacts to the event and updates Aggregate B.

**Example:**
1. `Order` aggregate accepts a new order → emits `OrderPlaced` event
2. Event handler receives `OrderPlaced` → loads `Inventory` aggregate → reserves stock
3. If stock reservation fails → emits `StockReservationFailed` → compensating action on Order

**When eventual consistency is acceptable:**
- Business users already tolerate a delay (e.g., "order confirmation may take a few seconds")
- The domain naturally operates asynchronously (batch processing, nightly reconciliation)
- The cost of forcing immediate consistency (large aggregates, distributed transactions) exceeds the cost of temporary inconsistency

**When eventual consistency is NOT acceptable:**
- Regulatory requirements mandate immediate consistency
- Financial transactions where partial state is illegal
- The business rule cannot tolerate even momentary inconsistency

In these cases, the affected objects MUST be in the same aggregate (Rule 1 overrides Rule 2).

## Consistency Boundary Design Methodology

### Step 1: List All Invariants

For each business rule in the requirements, express it as an invariant:
```
INV-01: Order total = sum of line item totals
INV-02: Line item quantity > 0
INV-03: Order cannot be modified after shipment
INV-04: Customer credit limit not exceeded across active orders
```

### Step 2: Classify Invariants

| Invariant | Immediate Consistency Required? | Objects Involved |
|-----------|-------------------------------|-----------------|
| INV-01 | Yes (financial accuracy) | Order, OrderLine |
| INV-02 | Yes (data integrity) | OrderLine |
| INV-03 | Yes (state machine) | Order |
| INV-04 | No (eventual OK — check at placement) | Order, Customer |

### Step 3: Group by Transaction Boundary

Objects that share immediate-consistency invariants go in the same aggregate:
- `Order` + `OrderLine` → **Order Aggregate** (INV-01, INV-02, INV-03)
- `Customer` → **Customer Aggregate** (INV-04 checked via domain service at order placement, eventual consistency acceptable)

### Step 4: Verify Rules 2-4

- Small enough? Order aggregate has root + lines — acceptable size
- Identity references? Order references Customer by `CustomerId` only
- Cross-aggregate consistency? INV-04 uses eventual consistency (check at placement, compensate if breached)

## Aggregate Sizing Anti-Patterns

### Too Large: "God Aggregate"

**Symptom:** One aggregate contains most of the domain model. Loading it requires joining many tables. Concurrent users frequently conflict.

**Cause:** Putting everything in one aggregate to "ensure consistency" without analyzing which invariants actually require immediate consistency.

**Fix:** Apply the methodology above. Most invariants tolerate eventual consistency.

### Too Small: "Anemic Aggregates"

**Symptom:** Every entity is its own aggregate. Business rules that should be enforced transactionally are scattered across eventually-consistent handlers. Data integrity issues appear.

**Cause:** Over-applying Rule 2 without checking Rule 1.

**Fix:** Identify which invariants require immediate consistency and group the objects accordingly.

### Wrong Boundary: "Convenience Aggregate"

**Symptom:** Objects grouped because they're "related" rather than because they share invariants. The aggregate root doesn't actually enforce any cross-object business rules.

**Cause:** Modeling based on data relationships (like ER diagrams) instead of behavioral invariants.

**Fix:** Ask "what business rule breaks if I separate these into different aggregates?" If the answer is "none," separate them.

## Common Aggregate Design Questions

**Q: Should I include the full collection of child entities?**
A: Only if invariants require it. If an Order has millions of line items but the invariant only checks the most recent 10, consider a different model.

**Q: Can one aggregate create another?**
A: Yes — a Factory on the aggregate root can create and return a new aggregate (which is then persisted via its own repository). The creating aggregate references the new one by identity.

**Q: Can an aggregate hold a reference to a domain service?**
A: No. Aggregates are pure domain objects. If an aggregate needs external information to enforce an invariant, the application service or domain service provides it as a parameter to the aggregate's method.

**Q: How do I handle aggregates that need data from other aggregates?**
A: The application service loads both aggregates, passes the needed data as parameters to the method, and persists both. Or use a domain service that coordinates the operation.
