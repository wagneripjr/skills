---
name: ddd
description: "Use when analyzing a problem domain, designing domain models, defining bounded contexts, mapping context relationships, building ubiquitous language glossaries, classifying subdomains, designing aggregates and value objects, or planning integration patterns between systems. Triggers on: 'DDD', 'domain-driven design', 'bounded context', 'aggregate design', 'context map', 'ubiquitous language', 'subdomain', 'domain model', 'strategic design', 'tactical design', 'anticorruption layer', 'analyze this domain', 'design the domain model'. NOT for EventStorming workshops (use eventstorming). NOT for writing acceptance tests (use atdd). NOT for implementation code — produces design artifacts only."
---

# Domain-Driven Design Analysis & Design

Analyze a problem domain autonomously and produce comprehensive DDD design artifacts. Read requirements, product definitions, and existing code. Research the domain via `gemini-web`. Write all outputs to `docs/ddd/` and significant decisions as ADRs to `docs/adr/`.

**Default: autonomous mode** — state assumptions and proceed without questions. When information is ambiguous, document the assumption and move on.

**Interactive mode** — activated when the user says "interview me", "ask questions", "interactive", "collaborative DDD", or "let's discuss the domain". See the Interactive Mode section below.

## Hard Gates

Violation of any gate halts progress. No workaround. No exceptions.

| Gate | Rule |
|------|------|
| **G1** | No tactical design without bounded context boundaries defined first |
| **G2** | No aggregate spans multiple bounded contexts |
| **G3** | Every domain term has exactly ONE definition per bounded context |
| **G4** | No direct object references between aggregates — reference by identity only |
| **G5** | No business logic in application services — domain model owns all business rules |
| **G6** | External systems accessed only through Anticorruption Layer or Published Language |
| **G7** | This skill produces design artifacts only — no implementation code |

## Phase 1: Domain Harvest

Gather raw domain knowledge from every available source.

**Read project inputs:**
- `docs/requirements/` — acceptance criteria, user stories, business rules
- `docs/plans/` — existing design documents
- `README.md`, `CLAUDE.md` — project overview and conventions
- Any product definition documents the user provides or references

**Read existing code** (if any) to extract implicit domain concepts — entity names, method signatures, database schemas, API contracts reveal the current mental model.

**Research the domain** using `gemini-web research "industry patterns for <domain>"` to discover:
- Standard terminology and industry conventions
- Regulatory constraints and compliance requirements
- Common domain patterns others have solved (e.g., double-entry bookkeeping in accounting, saga patterns in order fulfillment)

Extract domain concepts from all sources. Flag terms with conflicting meanings — these indicate context boundaries. Output a raw concept list — do not classify yet.

## Phase 2: Subdomain Classification

Classify each discovered domain area into Core, Supporting, or Generic. See `reference/strategic-patterns.md` for the classification decision matrix.

Write to `docs/ddd/subdomains.md` with rationale for each classification.

## Phase 3: Bounded Context Discovery

Identify linguistic boundaries — where the same word carries different meaning or where different teams need independent models.

**Heuristics for context boundaries:**
- Same noun, different attributes/behavior (e.g., "Product" in catalog vs warehouse vs billing)
- Different teams or organizational boundaries
- Different rates of change (fast-moving vs stable areas)
- Different consistency requirements (strong vs eventual)
- Different ubiquitous languages emerging from different stakeholders

Map each bounded context to its subdomain(s). A bounded context may span multiple supporting subdomains, but a Core subdomain should typically have its own dedicated context.

If the user requests collaborative discovery, invoke `eventstorming:es-explore` and incorporate its output as input to this phase. Otherwise, derive contexts autonomously from the concept list and research.

Write to `docs/ddd/bounded-contexts.md` — name, responsibility, key concepts owned, subdomain mapping, and team alignment (if known).

## Phase 4: Context Mapping

Define the relationship between every pair of interacting bounded contexts. Load `reference/integration-patterns.md` for all 9 patterns.

For each relationship, determine:
1. **Direction**: Which context is upstream (provides) and downstream (consumes)?
2. **Pattern**: Partnership, Shared Kernel, Customer-Supplier, Conformist, Anticorruption Layer, Open Host Service, Published Language, Separate Ways, or Big Ball of Mud
3. **Rationale**: Why this pattern fits the relationship's power dynamics and team structure

Draw an ASCII context map:

```
[Catalog Context]---OHS/PL--->[Order Context]
[Order Context]---ACL--->[Payment Gateway (external)]
[Order Context]<---CS--->[Shipping Context]
```

Legend: OHS = Open Host Service, PL = Published Language, ACL = Anticorruption Layer, CS = Customer-Supplier, SK = Shared Kernel, CF = Conformist, P = Partnership, SW = Separate Ways

Write to `docs/ddd/context-map.md`. ADR for each non-trivial integration decision (ACL vs Conformist, Shared Kernel introduction).

## Phase 5: Ubiquitous Language

Build a precise glossary for each bounded context. Load `reference/ubiquitous-language-guide.md` for harvesting techniques and glossary format.

Each term entry:

| Field | Content |
|-------|---------|
| **Term** | The canonical name (e.g., "Order") |
| **Context** | Which bounded context owns this definition |
| **Definition** | Precise, unambiguous, one paragraph |
| **Examples** | 2-3 concrete instances |
| **Not to be confused with** | Same word in other contexts, if applicable |
| **Related terms** | Links to other glossary entries |

Same word with different meanings across contexts confirms the context boundary — document both definitions. Flag requirement-glossary contradictions with `[UL CONFLICT]`.

Write to `docs/ddd/ubiquitous-language.md` (one section per context). Merge into `docs/DEFINITIONS.md` if it exists.

## Phase 6: Tactical Design

For each Core and Supporting bounded context, design the internal model. Reference files: `reference/tactical-patterns.md`, `reference/aggregate-design-rules.md`, `reference/supple-design.md`.

**Prerequisite (G1):** Bounded context boundaries from Phase 3 must exist.

For each aggregate, apply Vernon's four rules and define: root entity, owned entities and value objects, invariants it protects, commands it handles, domain events it emits. Assign remaining building blocks (entities, value objects, domain events, domain services, repositories, factories) to the appropriate aggregate or context.

Write to `docs/ddd/<context-name>/tactical-design.md` per context. ADRs for aggregate boundary decisions.

## Phase 7: Integration Design

For each context boundary relationship from Phase 4, design the concrete mechanism. Reference: `reference/integration-patterns.md`.

Options: ACL (translator + facade + adapter), OHS (API contract in UL), Published Language (schema format and versioning), Shared Kernel (joint ownership scope), or Conformist (adoption strategy).

Specify domain events that cross boundaries and their transformation rules — events change shape at ACL boundaries because each context owns its own model.

Write to `docs/ddd/integration-design.md` (one section per boundary). ADRs for technology choices.

## Phase 8: Finalize

All artifacts were written during Phases 2-7. In this phase:

- Update `docs/TRACEABILITY.md` if it exists — link requirements to DDD artifacts
- Update `docs/DEFINITIONS.md` if it exists — merge ubiquitous language terms
- Verify all cross-references between artifacts are consistent (context names, term definitions, relationship patterns)

## Interactive Mode

When activated, each phase follows a three-step cycle: **Ask → Research → Confirm**.

**Ask** (before the phase): Ask the user one focused question about the upcoming phase — what they know, what constraints exist, what they're unsure about. Run `gemini-web research` in parallel so user answers and research feed the phase together.

**Confirm** (after the phase): Present the phase output and ask "Does this match your understanding? Anything to correct or add?" Iterate until approved.

### Iterating on Specific Areas

The user can request a deep dive into any specific domain, subdomain, or bounded context at any point:
- "Let's dig deeper into the Payment context" → re-run Phases 5-6 for that context only
- "I think we split Ordering wrong" → re-run Phase 3 with new boundary hypothesis, cascade changes through Phases 4-7
- "The Inventory subdomain should be Core, not Supporting" → update classification, re-evaluate tactical design investment

When iterating, only re-run affected phases and update the corresponding artifacts. Do not rewrite unaffected contexts.

## Downstream Handoff

After completing DDD analysis:
- Invoke `wagner-skills:atdd` to write acceptance specifications from the domain model
- The ubiquitous language glossary becomes the vocabulary for executable specifications — spec DSL methods use the same terms
- Aggregate boundaries inform protocol driver design — one driver per bounded context's external interface

## Rules

1. **Autonomous by default** — interactive mode requires explicit activation (see Interactive Mode section)
2. **Research the domain** — use `gemini-web research` to fill knowledge gaps about industry patterns and standards
3. **ADRs for significant decisions** — aggregate boundaries, integration pattern choices, debatable subdomain classifications
4. **EventStorming is optional input** — invoke `eventstorming:es-explore` only if the user requests collaborative discovery
5. **Ubiquitous language governs naming** — all artifact names, section headers, glossary terms, and downstream code must match the UL
