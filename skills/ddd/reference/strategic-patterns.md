# Strategic DDD Patterns

## Subdomains

Every business domain decomposes into subdomains — areas of knowledge and activity that serve different strategic roles.

### Core Subdomain

The reason the business exists. This is where custom software creates competitive advantage.

**Identification heuristics:**
- Would the business lose its competitive edge without this capability?
- Does this require deep domain expertise that competitors lack?
- Does this change frequently as the business strategy evolves?
- Would you never buy a generic off-the-shelf solution for this?

**Investment**: Best developers, continuous refinement, rich domain model, maximum test coverage. Never outsource.

### Supporting Subdomain

Necessary for the business to operate but not a differentiator. The business needs it, but it's not what makes the product unique.

**Identification heuristics:**
- Important but not the reason customers choose this product
- Simpler model acceptable — doesn't need the richest design
- Could theoretically be outsourced without losing competitive edge
- Changes less frequently than Core

**Investment**: Adequate design, may use simpler patterns (Transaction Script or Active Record acceptable), can assign less experienced developers.

### Generic Subdomain

Solved problems with well-known solutions. Authentication, email sending, payment processing, PDF generation.

**Identification heuristics:**
- Many businesses need this same capability
- Off-the-shelf or open-source solutions exist
- No competitive advantage in building it custom
- Domain knowledge is widely available

**Investment**: Buy, adopt SaaS, or use open-source. Custom-building a Generic subdomain is waste — the effort yields no competitive differentiation.

### Classification Decision Matrix

| Question | Core | Supporting | Generic |
|----------|------|-----------|---------|
| Competitive advantage? | Yes | No | No |
| Off-the-shelf exists? | No | Maybe | Yes |
| Requires domain expertise? | Deep | Moderate | Commodity |
| Change frequency? | High | Medium | Low |
| Build vs buy? | Always build | Consider both | Always buy/adopt |
| Developer investment? | Senior, domain experts | Mid-level | Minimal (integration only) |

## Bounded Contexts

A Bounded Context is an explicit boundary within which a domain model is defined and applicable. Inside the boundary, every term has a precise, unambiguous meaning. Outside, the same term may mean something entirely different.

### Why Bounded Contexts Exist

The dream of a single unified enterprise model always fails. Different parts of the business use the same words to mean different things:
- "Account" in authentication = credentials + permissions
- "Account" in billing = payment methods + invoices + balance
- "Account" in CRM = company profile + contacts + interactions

Forcing these into one model creates a tangled, bloated object that serves no one well. Bounded contexts embrace this reality — each context gets its own model with its own ubiquitous language.

### Identification Heuristics

| Signal | Indicates |
|--------|----------|
| Same word, different meaning | Context boundary between the two usages |
| Different teams owning different parts | Likely different contexts |
| Different data stores or services | Often different contexts |
| Different rates of change | Strong candidate for separation |
| Different consistency requirements | Should be separate contexts |
| Different external regulations | Regulatory boundary = context boundary |

### Bounded Context Properties

Each bounded context has:
- **Name**: From the ubiquitous language (e.g., "Catalog Context", "Fulfillment Context")
- **Responsibility**: One sentence describing what this context owns
- **Key concepts**: Entities, value objects, and aggregates that live here
- **Ubiquitous language**: Terms and definitions unique to this context
- **Team ownership**: Which team builds and maintains it
- **Subdomain mapping**: Which subdomain(s) this context serves

### Context Size Guidelines

- **Too large**: Contains concepts with conflicting meanings → split it
- **Too small**: Every entity in its own context → excessive integration overhead → merge related concepts
- **Right size**: All terms within have consistent meaning, the team can hold the model in their heads, changes rarely ripple outside the boundary

### Team Alignment

Conway's Law applies: the bounded context boundaries should match team boundaries. One team per context, one context per team (ideally). When organizational structure contradicts context boundaries, either reorganize teams or accept that the model will degrade.

## Context Map

The Context Map is a visual representation of all bounded contexts and their relationships. It shows the political landscape — who depends on whom, who has power, and how models translate at boundaries.

### Drawing Convention (ASCII)

```
[Context A]---pattern--->[Context B]
```

Arrow direction: points from upstream (provider) to downstream (consumer). The upstream context influences the downstream context's model.

### Relationship Patterns Overview

| Pattern | Relationship | When to Use |
|---------|-------------|-------------|
| **Partnership** | Mutual dependency, joint planning | Two teams that succeed or fail together |
| **Shared Kernel** | Small shared model, joint ownership | Tightly coupled contexts that need a common subset |
| **Customer-Supplier** | Upstream serves downstream's needs | Downstream has negotiating power over upstream's API |
| **Conformist** | Downstream adopts upstream's model | Upstream has no incentive to accommodate downstream |
| **Anticorruption Layer** | Downstream translates upstream's model | Protecting your model from external/legacy influence |
| **Open Host Service** | Upstream provides a well-defined protocol | Upstream serves many consumers with a stable API |
| **Published Language** | Shared data exchange format | Contexts communicate via a documented schema |
| **Separate Ways** | No integration | Cost of integration exceeds benefit |
| **Big Ball of Mud** | No clear boundaries | Legacy system with entangled models (recognize and isolate) |

See `reference/integration-patterns.md` for detailed guidance on each pattern.

## Distillation

Distillation separates the essential from the incidental in your domain model.

### Core Domain

The most valuable part of the model — the concepts that embody the business's unique competitive advantage. Everything else serves the Core Domain.

**Techniques:**
- **Domain Vision Statement**: A short (one page) document describing the Core Domain's value proposition and what distinguishes it
- **Highlighted Core**: Mark which modules/packages are Core — make it visually obvious in documentation and code structure

### Generic Subdomains

Identify which parts of your model are Generic and extract them. Don't invest deep modeling effort in authentication, email, or logging. Use existing libraries or services.

### Distillation Document

A brief document (not the code, not the full model) that describes:
1. What the Core Domain is and why it matters
2. What the primary elements of the Core Domain model are
3. What Generic Subdomains exist and how they're handled
4. The relationship between Core and Supporting subdomains

This document helps new team members understand where to focus their modeling effort and where "good enough" is acceptable.
