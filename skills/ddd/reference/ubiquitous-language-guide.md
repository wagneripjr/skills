# Ubiquitous Language Guide

How to harvest, define, enforce, and evolve the ubiquitous language — the shared vocabulary between domain experts and developers that forms the foundation of every DDD model.

## Why Ubiquitous Language Matters

The ubiquitous language is the single most important concept in DDD. If the code uses different words than the business, every conversation requires translation. Translation introduces errors, misunderstandings, and drift between what the business thinks the system does and what it actually does.

**The rule:** Code reads like a domain expert would describe the business. Class names, method names, variable names, event names, module names — all use the ubiquitous language.

## Harvesting Techniques

### From Requirements Documents

Read `docs/requirements/` and extract:
- **Nouns**: Candidate entities and value objects (Order, Customer, Policy, Address)
- **Verbs**: Candidate commands and operations (place, approve, cancel, calculate)
- **Adjectives and states**: Candidate enums and state machines (pending, active, expired, premium)
- **Business rules**: Candidate invariants and domain services ("must not exceed", "only when")

### From Domain Expert Conversations

If transcripts or meeting notes exist, look for:
- Terms experts repeat consistently
- Corrections experts make ("We don't call it a 'request', it's a 'claim'")
- Explanations that reveal hidden concepts ("When I say 'qualified', I mean they passed all three checks")
- Disagreements about meaning — these indicate context boundaries

### From Existing Code

Read source code to discover implicit domain terms:
- Class and table names
- Enum values and constants
- Method names on domain objects
- Field names in API contracts
- Comments that explain business meaning

**Warning:** Existing code often uses technical terms instead of domain terms. Don't assume the code is right — validate against requirements and domain research.

### From Domain Research

Use `gemini-web research` to discover:
- Industry-standard terminology (e.g., "underwriting" in insurance, "reconciliation" in accounting)
- Regulatory terms with precise legal definitions
- Terms of art that domain experts assume everyone knows

## Glossary Format

Each term entry in `docs/ddd/ubiquitous-language.md`:

```markdown
### <Term>

**Context:** <Bounded Context Name>

**Definition:** <One precise paragraph. No jargon. No circular definitions.>

**Examples:**
- <Concrete instance 1>
- <Concrete instance 2>

**Not to be confused with:**
- "<Same word>" in <Other Context> — means <different thing>

**Related terms:** <Term A>, <Term B>
```

### Writing Good Definitions

**Rules:**
- One paragraph maximum
- No circular definitions ("An Order is something that is ordered")
- Use simpler words than the term being defined
- Include boundary conditions ("A Policy is active from its effective date until its expiration date, inclusive")
- State what it is NOT when ambiguity exists

**Bad definition:**
> A Shipment is a shipment of goods.

**Good definition:**
> A Shipment is a physical movement of one or more packages from a warehouse to a customer address. It is created when an Order is fulfilled and is tracked independently of the Order — one Order may produce multiple Shipments (e.g., split shipments from different warehouses).

## Ambiguity Detection

Ambiguity is a feature, not a bug. When the same word means different things in different parts of the business, this signals a bounded context boundary.

### Detection Process

1. **Build candidate term list** from all sources (requirements, code, research)
2. **Flag duplicates** — same word appearing in different areas
3. **Compare definitions** — if two uses of "Account" mean different things, document both
4. **Confirm the boundary** — the different definitions live in different bounded contexts

### Documenting Ambiguity

In the glossary, use the "Not to be confused with" field:

```markdown
### Account (Authentication Context)

**Definition:** A set of credentials (username, password, MFA settings) that
identifies a user and controls access to the system.

**Not to be confused with:**
- "Account" in Billing Context — means a financial ledger with balance and payment methods
- "Account" in CRM Context — means a company profile with associated contacts
```

### Conflict Resolution

When a term in requirements has a meaning that contradicts the glossary:

1. Mark the conflict: `[UL CONFLICT] "Account" in requirement REQ-42 uses billing definition but appears in authentication context`
2. Determine which context the requirement belongs to
3. Use the correct context's definition
4. If the requirement genuinely spans contexts, split it into context-specific requirements

## Enforcement Rules

### In Design Artifacts

- All artifact names use UL terms (not technical names)
- Section headers in design docs use UL
- ADR titles reference UL concepts
- Context map labels use UL names for contexts

### In Code (Downstream Guidance)

When implementation begins (via `wagner-skills:atdd` or direct implementation):
- Class names = UL terms (`OrderPlacement`, not `OrderProcessor`)
- Method names = UL verbs (`approveRefund`, not `processRefundRequest`)
- Event names = UL past tense (`PaymentReceived`, not `PaymentEvent`)
- Module/package names = UL context names (`billing`, not `payment-service`)
- Database tables and columns = UL terms (or snake_case equivalent)
- API endpoints = UL resources (`/orders`, not `/data/records`)

### Violations to Flag

| Violation | Example | Fix |
|-----------|---------|-----|
| Technical name instead of domain name | `DataProcessor` | Rename to domain concept (`OrderFulfillment`) |
| Abbreviation not in UL | `CustAcct` | Use full term (`CustomerAccount`) |
| Generic name | `Manager`, `Handler`, `Helper` | Replace with specific domain role |
| Mixing languages across context | `BillingOrder` mixing billing + order concepts | Separate into context-specific terms |
| Synonym used interchangeably | `Client`/`Customer` used as same thing | Pick one, deprecate the other |

## Language Evolution

The ubiquitous language is not static. As understanding deepens, terms will be added, refined, or deprecated.

### When Language Changes

- **New concept discovered**: Add to glossary, update affected design artifacts
- **Term refined**: Update definition, verify all usages still align
- **Term deprecated**: Mark as deprecated with replacement, update code references
- **Term split**: One term becomes two (indicating deeper understanding or a new context boundary)

### Change Protocol

1. Update the glossary entry in `docs/ddd/ubiquitous-language.md`
2. Check all design artifacts for the affected term
3. Update context map if the change reveals a new boundary
4. If the term is already in code, note the rename as a future task
5. Record the change reason (why did the language evolve?)

### Signs of Language Health

**Healthy:**
- Domain experts recognize the terms when reading design docs
- Developers use domain terms in conversations (not just in code)
- New team members learn the domain vocabulary from the glossary
- Terms are precise enough that misunderstandings are rare

**Unhealthy:**
- Developers use different words than domain experts
- The glossary is outdated or ignored
- New terms appear in code without being added to the glossary
- "Everyone knows what it means" is the justification for undefined terms
