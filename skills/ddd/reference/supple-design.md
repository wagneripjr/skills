# Supple Design Patterns

Evans' six patterns for making domain models flexible, expressive, and easy to work with. A supple design communicates its intent clearly and makes client code read like a natural extension of the ubiquitous language.

## Intention-Revealing Interfaces

Name classes, methods, and parameters using the ubiquitous language so that developers can understand what they do without reading the implementation.

**Principle:** The interface (method signature + name) should tell you everything you need to know about what the operation does — not how it does it.

**Before (implementation-revealing):**
```
process(data, flag1, flag2)
handleRequest(type, payload)
doStuff(order)
```

**After (intention-revealing):**
```
calculateShippingCost(order, destination)
approveRefund(refundRequest)
reserveInventory(productId, quantity)
```

**Rules:**
- Names come from the ubiquitous language — not from technical patterns
- Method names describe the domain operation, not the implementation mechanism
- Parameter names are meaningful domain concepts
- Return types express domain results, not infrastructure artifacts
- No abbreviations unless they're part of the ubiquitous language

**Test:** Read the method signature to a domain expert. If they understand what it does without explanation, the interface reveals its intention.

## Side-Effect-Free Functions

Operations that return results without modifying observable state. Safe to call, compose, and test because they produce no surprises.

**Two categories of operations:**
- **Queries** (side-effect-free): Return a value, modify nothing — `calculateTotal()`, `isEligible()`, `formatAddress()`
- **Commands** (state-changing): Modify state, ideally return nothing — `placeOrder()`, `approvePayment()`, `cancelReservation()`

**Design guidelines:**
- Maximize the number of side-effect-free functions
- Value Objects should have ONLY side-effect-free methods (they're immutable)
- Complex computation should be in side-effect-free functions, even if the result is used by a command
- Separate the computation from the state change

**Example:**
```
// ❌ Mixed: computes AND modifies state
applyDiscount(order):
  discount = computeDiscount(order.total, order.customerTier)
  order.total -= discount          // side effect
  order.discountApplied = discount // side effect
  return order.total               // returns result too

// ✅ Separated: computation is side-effect-free
computeDiscount(total, tier) -> Money:    // pure function
  ...

applyDiscount(order, discount):           // command, no return
  order.applyDiscount(discount)
```

**Benefit:** Side-effect-free functions are trivially testable, composable, and cacheable. They can be called in any order without risk.

## Assertions

Make the rules explicit. Pre-conditions, post-conditions, and invariants that the code enforces should be documented and ideally programmatically checked.

**Types:**

| Type | When Checked | What It Guarantees |
|------|-------------|-------------------|
| **Pre-condition** | Before operation | Input is valid for this operation |
| **Post-condition** | After operation | Operation produced the expected result |
| **Invariant** | Always (before and after) | The object is always in a valid state |

**Application to DDD:**
- **Aggregate invariants** are assertions: "Order total always equals sum of line items"
- **Value Object construction** enforces pre-conditions: "Email address must contain @"
- **Factory post-conditions**: "Created order has at least one line item"

**Design guidance:**
- State invariants on classes explicitly (in comments, documentation, or assertion code)
- When pre-conditions are violated, throw domain exceptions (not generic errors) named in ubiquitous language
- Aggregate roots are responsible for asserting invariants after every state change

## Standalone Classes

Reduce coupling by designing classes with minimal dependencies. The fewer concepts a class depends on, the easier it is to understand, test, and reuse.

**Goal:** Maximize the number of classes that can be understood in isolation — without needing to understand their collaborators.

**Techniques:**
- Value Objects are naturally standalone — they depend only on primitive types and other Value Objects
- Extract computations into Value Objects (e.g., `Money` operations instead of inline arithmetic)
- Domain events carry data, not references to other domain objects
- Method parameters should be primitive types or Value Objects when possible

**Coupling reduction:**
- If class A depends on B, C, D, E — can any of those dependencies be replaced with a simpler type?
- If a method takes an Aggregate as a parameter but only uses two fields, pass the two fields instead
- If a class depends on an interface with 10 methods but only uses 2, create a narrower interface (Interface Segregation)

**The ideal:** A class that imports nothing from the domain except Value Objects — understandable in complete isolation.

## Closure of Operations

An operation whose return type is the same as the type of its arguments. Enables natural composition and chaining.

**Examples:**
```
Money + Money → Money
DateRange.intersection(DateRange) → DateRange
Specification AND Specification → Specification
Color.blend(Color) → Color
```

**Why this matters:**
- Creates a natural algebra for the domain concept
- Operations can be chained: `price.add(tax).subtract(discount)`
- Reduces the need for helper methods and utility classes
- Value Objects are the natural home for closure of operations

**Design guidance:**
- When designing Value Object methods, ask: "Can this operation return the same type?"
- Mathematical and logical domains naturally support closure (money, quantities, specifications)
- Set operations (union, intersection, difference) on domain collections
- String-like operations on domain-specific text types

## Conceptual Contours

Align the boundaries of classes and methods with natural divisions in the domain — the "joints" of the domain knowledge.

**Principle:** Good decomposition follows the domain's conceptual structure, not arbitrary technical concerns. When boundaries align with domain concepts, changes tend to be localized (low coupling, high cohesion).

**Symptoms of wrong contours:**
- A change in one business rule requires modifying many classes
- A class handles two unrelated domain concepts
- A method does "half" of a domain operation and another method does the other half
- A refactoring keeps oscillating between two structures (granularity pendulum)

**Finding the right contours:**
- Listen to the ubiquitous language — domain experts naturally group and separate concepts
- Operations that always change together belong together
- Operations that change for different reasons belong apart
- If a concept has a name in the ubiquitous language, it deserves its own class or method

**Relationship to other patterns:**
- Intention-Revealing Interfaces name the contours
- Standalone Classes minimize dependencies between contours
- Side-Effect-Free Functions make contours safe to compose
- Closure of Operations creates a natural algebra within contours
- Assertions enforce the rules at contour boundaries

Together, these six patterns create a design that is supple — it communicates its intent, is safe to modify, and evolves naturally as domain understanding deepens.
