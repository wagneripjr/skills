# Context Mapping Integration Patterns

Nine patterns that describe how bounded contexts relate to each other. Each pattern reflects a combination of team dynamics, power structures, and technical needs.

## Partnership

Two bounded contexts with mutual dependency. Both teams plan together, coordinate releases, and evolve their interfaces jointly.

**Characteristics:**
- Bidirectional dependency — both contexts need each other
- Joint planning and release cadence
- Neither team dominates — decisions are collaborative
- High coordination cost — both teams must agree on changes

**When to use:**
- Two teams building features that span both contexts simultaneously
- Neither team can succeed without the other
- Both teams are willing and able to coordinate closely

**Risks:**
- Coordination overhead grows with team size
- One team's delay blocks the other
- Degrades into Customer-Supplier when power becomes unequal

**Diagram:** `[Context A]<---P--->[Context B]`

## Shared Kernel

A small, shared subset of the domain model that both contexts use directly. Changes require agreement from both teams.

**Characteristics:**
- Shared code or schema — both contexts import/use it
- Joint ownership — changes require both teams' approval
- Typically small — shared types, events, or interfaces
- Continuous integration between the shared part and both contexts

**When to use:**
- Two contexts need a common set of types or events
- The shared portion is small and stable
- Both teams can agree on and maintain the shared code

**Risks:**
- Shared Kernel tends to grow — guard against scope creep aggressively
- Changes become bottlenecks (need dual approval)
- Tight coupling — changes affect both contexts simultaneously
- Degrades into Big Ball of Mud if boundaries erode

**Rule:** Keep the kernel as small as possible. If it grows beyond a handful of types, it's a sign the contexts should be restructured.

**Diagram:** `[Context A]---SK---[Context B]`

## Customer-Supplier

Upstream context serves downstream context's needs. The downstream (customer) can negotiate requirements with the upstream (supplier).

**Characteristics:**
- Clear upstream/downstream direction
- Downstream has influence over upstream's API evolution
- Upstream prioritizes downstream's needs (to varying degrees)
- Formalized through automated acceptance tests that downstream defines and upstream must pass

**When to use:**
- One context clearly provides data/services to another
- The downstream team has enough organizational power to influence the upstream team
- Both teams are within the same organization

**Verification mechanism:** The downstream team writes automated tests against the upstream's API. These tests become part of the upstream's CI pipeline — the upstream cannot deploy changes that break the downstream.

**Diagram:** `[Upstream]<---CS--->[Downstream]`

## Conformist

Downstream adopts the upstream's model wholesale. No translation, no adaptation — just consume the upstream's model as-is.

**Characteristics:**
- Downstream has NO influence over upstream's model
- Downstream's model mirrors upstream's structure and terminology
- No translation layer
- Tight coupling to upstream's model

**When to use:**
- Upstream is an external team, third party, or legacy system with no incentive to change
- The upstream's model is acceptable enough to live with
- Building a translation layer is not worth the effort

**When to AVOID:**
- When the upstream's model would distort your domain — use Anticorruption Layer instead
- When the upstream's model changes frequently and unpredictably
- When your context is Core subdomain — never conform to someone else's model for your competitive advantage

**Diagram:** `[Upstream]---CF--->[Downstream]`

## Anticorruption Layer (ACL)

The most defensive pattern. Downstream builds a translation layer that converts the upstream's model into its own ubiquitous language. Protects the downstream model from being polluted by external concepts.

**Three components:**

| Component | Responsibility |
|-----------|---------------|
| **Translator** | Maps data between upstream and downstream models — field renaming, type conversion, restructuring |
| **Facade** | Simplifies the upstream's interface — exposes only what downstream needs, hides complexity |
| **Adapter** | Handles protocol translation — HTTP to domain calls, message format conversion, error mapping |

**When to use (mandatory per Gate G6):**
- Integrating with external systems (payment gateways, shipping providers, legacy APIs)
- Upstream model uses different terminology or structure that would distort your model
- Upstream is a Big Ball of Mud
- Your context is a Core subdomain — always protect Core domain models

**Implementation guidance:**
- ACL code lives in the downstream context's infrastructure layer
- ACL translates upstream's types into downstream's domain types at the boundary
- No upstream types leak into the downstream domain model
- Domain events that cross the boundary are translated (same event, different shape per context)

**Example (conceptual):**
```
Upstream (PaymentGateway): ChargeResult { txn_id, status_code, amt_cents }
ACL translates to:
Downstream (Billing):      PaymentConfirmation { paymentId, outcome: Paid|Declined, amount: Money }
```

**Diagram:** `[Upstream]---ACL--->[Downstream]`

## Open Host Service (OHS)

Upstream defines a well-documented, stable protocol (API) for consumers. Instead of building custom integrations per consumer, the upstream provides a single, general-purpose service.

**Characteristics:**
- The upstream defines the protocol
- Multiple downstream consumers use the same API
- Protocol is versioned and stable
- Documentation and contracts are formalized

**When to use:**
- The upstream context serves many consumers
- A clean, stable API benefits multiple teams
- The upstream team has capacity to maintain a well-defined API

**Best paired with Published Language** — the API contract uses a shared, documented schema format.

**Diagram:** `[Upstream]---OHS--->[Consumer 1], [Consumer 2], ...`

## Published Language (PL)

A well-documented, shared data exchange format that bounded contexts use to communicate. The format is independent of any single context's internal model.

**Examples:**
- JSON Schema for API contracts
- Protocol Buffers / Protobuf for high-performance RPC
- Apache Avro for event streaming
- OpenAPI specification for REST APIs
- XML Schema (in legacy domains)

**Characteristics:**
- Formally defined and versioned
- Documented independently of any context
- Multiple contexts can produce/consume
- Schema evolution rules are explicit (backward/forward compatibility)

**When to use:**
- Contexts need a stable interchange format
- Multiple consumers need to understand the same data
- Contracts must be versioned and evolvable

**Schema evolution guidance:**
- Additive changes (new optional fields) are backward-compatible
- Renaming or removing fields breaks consumers — use deprecation periods
- Version the schema explicitly (v1, v2) for breaking changes
- Published Language is NOT the internal model of any context — it's a shared contract

**Diagram:** `[Context A]---OHS/PL--->[Context B]`

## Separate Ways

Two contexts have no integration. They operate independently even if they deal with overlapping domain concepts.

**When to use:**
- The cost of integration exceeds the benefit
- The contexts share some concepts but never need to exchange data
- Duplicate data/logic is acceptable because the contexts are truly independent
- Teams have no coordination capacity

**Risks:**
- Data duplication and potential inconsistency
- Users may need to perform same action in multiple systems

**Diagram:** `[Context A]    [Context B]` (no connection)

## Big Ball of Mud

Not a design choice — a recognition that a system has no clear boundaries. Code and data are entangled with no coherent model.

**How to handle:**
- Draw a boundary around the Big Ball of Mud — treat it as a single bounded context
- Do NOT try to model its internals — the point is to isolate it
- Other contexts interact with it through an Anticorruption Layer
- Gradually extract well-defined bounded contexts from the edges

**Diagram:** `[Big Ball of Mud]---ACL--->[Your Clean Context]`

## Pattern Decision Matrix

Use this matrix when deciding which pattern fits a context relationship:

| Factor | Partnership | Customer-Supplier | Conformist | ACL | OHS/PL | Shared Kernel | Separate Ways |
|--------|-------------|------------------|-----------|-----|--------|--------------|---------------|
| **Downstream has influence?** | Equal | Yes | No | N/A | No | Equal | N/A |
| **Model translation needed?** | Minimal | Negotiated | None | Full | Partial | None | None |
| **Teams coordinate?** | Tightly | Moderately | Loosely | Independently | Loosely | Tightly | Not at all |
| **Upstream external/legacy?** | No | Rarely | Often | Always | Often | No | Any |
| **Core subdomain protection?** | Medium | Good | Poor | Excellent | Good | Medium | N/A |
| **Integration cost?** | High (coordination) | Medium | Low | High (technical) | Medium | Medium | Zero |
| **Recommended for Core?** | If necessary | Good | Never | Always for external | Good for providing | Cautiously | If truly independent |
