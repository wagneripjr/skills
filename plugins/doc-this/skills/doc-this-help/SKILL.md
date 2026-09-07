---
name: doc-this-help
description: "Use to get an analogy-driven explanation of every doc-this agent and when to use each. Covers all 12 Discovery agents with one-paragraph analogies (Scout = real-estate broker doing a walkthrough; Detective = Sherlock interpreting clues; Architect = cartographer producing formal maps; Reviewer = auditor stress-testing the contracts) plus the recommended sequence and customer-project safety notes. Triggers: '/doc-this-help', 'explain doc-this agents', 'which agent should I use for X', 'what does [agent] do'. NOT for actually running an agent — invoke that agent directly. NOT for the doc-this orchestrator (use it directly)."
license: MIT
---

# Doc-This Agents — A Guide With Analogies

Doc-This is a team of specialists. Each agent does ONE thing and does it well. Below: an analogy + one-line use-when for every agent.

**Discovery (`/doc-this`) is strictly descriptive.** Every Discovery agent obeys the describe-only pact at `${CLAUDE_PLUGIN_ROOT}/skills/doc-this/references/describe-only-pact.md`: documents what exists, never what should be; binary 🟢 (cited) / 🔴 (gap) confidence; no judgment, no proposals, no fabricated ADR sections, no technical-debt registers, no NFRs without written contracts, no bug reports.

---

## Discovery Team (12 skills) — extract specs from a legacy system

### 🎼 Doc-This — the conductor
**Command**: `/doc-this`

A conductor doesn't play any instrument; they know the score, signal who plays when, hold the rhythm. Without one, every musician plays their part but the orchestra falls apart.

> Use to start or resume a full Discovery analysis. Handles first-run, database-context handshake, plan generation, and dispatches the pipeline.

### 🗺️ Scout — the real-estate broker
**Command**: dispatched by `/doc-this`

A broker walks through a property the first time. Doesn't open drawers, doesn't read documents. Maps: how many rooms, what neighborhood, what's the general state.

> Use first. Maps the project surface — languages, frameworks, modules, dependencies — without entering the code.

### 🔬 Code Analyst — the systems analyst
**Command**: dispatched by `/doc-this`

The classic systems analyst sits with the source and reads every line — control flow, algorithms, data structures — then writes the technical dossier: data dictionary, flowcharts, process logic. Describes exactly what is there, never judges it.

> Use after Scout. Analyzes code module by module, reading **every source file** (markup, SQL, and scripts included — coverage is never traded for tokens). Checkpoints per module and resumes across sessions.

### 🔍 Detective — the Sherlock Holmes
**Command**: dispatched by `/doc-this`

Sherlock arrives after the code analyst. Looks at the catalogued evidence and asks: *"But why is this here? Who put it? What does it reveal about who lived here?"* Doesn't re-read the archive. Interprets.

> Use after the Code Analyst. Extracts implicit business rules, reads git history like a diary, reconstructs undocumented decisions. Also classifies APIs as public vs. private.

### 📐 Architect — the cartographer
**Command**: dispatched by `/doc-this`

The cartographer visits a territory and produces formal maps: floor plan, elevation map, structural plan. Someone who never set foot there can understand everything from the maps.

> Use after Detective. Synthesizes everything into C4 diagrams, full ERD, and the unified `external-surface.json` catalog.

### 📝 Writer — the notary
**Command**: dispatched by `/doc-this`

The notary turns what was discovered into formal, precise, traceable contracts. Each clause has its degree of certainty declared. The document is binding: a coding agent can reimplement the system from it.

> Use after Architect. Generates folder-per-unit specs (`requirements.md` / `design.md` / `tasks.md`) ATDD-ready, with `@api` / `@browser` / `@cli` / `@message` / `@database` scenarios per public surface.

### ⚖️ Reviewer — the auditor
**Command**: dispatched by `/doc-this`

The Reviewer takes Writer's contracts and tries to break them: *"This is a contradiction. This claim has no proof. This rule disappears if the user does X."* Not destructive — wants to make sure what stands is solid.

> Use after Writer. Reviews specs critically, reclassifies confidence, enforces ATDD discipline (cross-layer coverage, transitive private coverage, DB coverage), generates questions for human validation.

### 🌉 Promote — the SDLC bridge
**Command**: `/doc-this-promote`

After all the analysis, someone has to translate the staged specs into the project's actual SDLC chain — assigning FR-NNN IDs, writing TRACEABILITY rows, generating `.feature` files for the spec runner. The Promote agent is that translator.

> Use after Reviewer. The ONLY skill in the doc-this team that touches `docs/`.

### 🖼️ Visor — the forensic illustrator (optional)
**Command**: dispatched by `/doc-this`

The forensic illustrator works only with images. Receives screenshots and faithfully reconstructs the interface: screens, forms, navigation flows. Doesn't need the system running, just the photos.

> Use when screenshots are available. Documents the UI without needing access to the running system.

### 🗄️ Data Master — the geologist (optional)
**Command**: dispatched by `/doc-this`

The geologist maps the subsoil — the layer no one sees but everything sits on. Tables, relationships, constraints, triggers, procedures. The invisible foundation. Branches behavior on database ownership: when the team owns the schema, full migration plan; when the schema is owned by another team, frozen contract documentation.

> Use when DDL, migrations, or ORM models exist. Documents the database completely AND extracts DB-resident business logic from views, procedures, triggers.

### 🎨 Design System — the wardrobe stylist (optional)
**Command**: dispatched by `/doc-this`

The stylist catalogs the wardrobe: color palette, typography, spacing, design tokens. The "fashion rules" that govern how the system looks — what can and cannot be combined.

> Use when CSS, themes, or interface screenshots exist. Extracts the visual tokens of the project.

### 🔬 Tracer — the forensic chemist (optional)
**Command**: dispatched by `/doc-this`

When static analysis hits a wall — "what's the actual state machine?" — the chemist runs tests on samples the case file already collected: log files, traces, error reports. Not running the live system, just analyzing the evidence already on hand. The chemist also countersigns the confirmed findings: the corroboration sweep stamps each 🟢 scenario's `Evidence:` provenance (`static` → `static + runtime`) when telemetry matches it — which is why the orchestrator insists on the chemist when the system can't be run live (`legacy_runnable` ≠ `yes`).

> Use when 🔴 gaps remain after Reviewer, or to corroborate 🟢 scenarios with telemetry. Resolves gaps using existing logs/traces/error exports (read-only, never touches a live system). Hard-advisory when the legacy system cannot be run live.

---

## Recommended sequences

```
/doc-this  →  /doc-this-promote

Or invoke individual agents:
  Scout → Code Analyst → Detective → Architect → Writer → Reviewer

Optional anytime:  Visor · Data Master · Design System · Tracer
```

## Customer-project safety

In a client workspace — any project outside your own or your organization's namespace:
- Every doc-this agent stops at "staged for commit"
- The user reviews staged diffs and commits manually

## Output staging

- Discovery: `.doc-this-sdd/` (analysis-only, non-destructive)
- SDLC promotion: `docs/` tree (only via `doc-this-promote`)
