---
name: prototype-spike
description: "Use when a requirement or an unproven technique must be made clickable before it is built — produces a single self-contained HTML prototype that doubles as a design spike, whose control panel is the open questions. Rebuilds existing screens at high fidelity from real source (structure, copy strings, icons, tokens, each cited file:line; invents only what the requirement adds, and annotates it), derives one control per acceptance criterion or technical unknown, drives real data through a dev-server proxy that also proposes the route shape (live > recorded capture > labeled stub, never an invented payload), verifies every state in a real browser, and reports what the spike settled. Triggers on 'prototype FR-NNN', 'clickable prototype of FR-NNN', 'make this requirement clickable', 'spike this technique'. NOT for inventing UI from a prompt — use a generative-design skill. NOT for production frontend code. NOT the client-confirmation record — that is a spec-playback step. NOT an ADR writer."
license: MIT
---

# Prototype Spike

Build one self-contained HTML file that executes a requirement's interpretation against the real
system, for two audiences at once.

**Outward** it asks the client *is this what you meant?* — its output is deltas, not approval.
**Inward** it asks the team *does this technique work, and what should the contract be?* — its output
is a settled decision. States are indexed by **open questions**: some are acceptance criteria, some
are unproven mechanisms. Flipping a control re-runs the reading.

Three files, every run, written beside the prototype:

- `<anchor>-<slug>.html` — the prototype
- `harvest-table.md` — where every borrowed value came from
- `spike-report.md` — what the run settled, and where each answer belongs

`spike-report.md` is **opened at ANCHOR and appended to as you go** — not composed at the end. A run
that ends early still leaves its answers behind, and answers are the part that outlives the file: a
technique proven in a run that stopped short otherwise ends up recorded nowhere but a code comment.
Treat it the way you would a lab notebook, not a closing summary.

Four invariants:

- **Only invent what the requirement adds.** Structure, copy, icons, spacing, tokens, payloads all
  trace to source, so a disagreement about the prototype is a disagreement about the *system*.
- **Invented ⟺ annotated.** Whatever is absent from the harvest table lights up under the annotation
  toggle, and whatever lights up is something the requirement genuinely adds. Both directions hold,
  which is what makes the annotation layer a completeness check rather than decoration. Later
  sections refer to this rule by name.
- **Frame ≠ app.** The reviewer shell uses a deliberately different design language from the app
  tokens, so nobody confuses chrome with product. Only the shell is templatable.
- **Controls are the agenda.** If every control demonstrates settled behavior and no technique is in
  doubt, the thing does not need a prototype. Say so and route to a scenario walkthrough.

## Three fidelity axes

Independent. A stub payload inside a source-faithful UI is a good prototype. Mixing fidelity *within*
one axis without marking it is the failure.

| Axis | Ladder | Gate |
|---|---|---|
| **UI** — does it read like the app they use daily? | from-source > from-screenshot > schematic (whole file, declared up front) | G2: every non-annotated element traces to the harvest table |
| **Token** — are the colors and type the app's own? | harvested-and-cited > prototype-only-and-justified | G1: zero uncited constants |
| **Data** — is what the screen shows real? | live > recorded capture > labeled stub | G3: no rung below stub; never invent a payload |

## Procedure

### 0. ANCHOR — *G0: at least one open question, named*

Two legitimate anchors, either or both:

- **Requirement anchor** — an FR/NFR/BUG id. Read the body in full, index-first: one Read of
  `docs/requirements/index.md`, never `ls` or `grep -r` over the folder. Take every acceptance
  criterion, the frozen-interface section, the pending-dependency section, and linked ADRs.
- **Technique anchor** — an unproven mechanism, a `Proposed` ADR, or a contract nobody has shaped
  ("will `srcDoc` render this without leaking the session?", "what should this route look like?").
  Needs no FR.

Refuse only when neither exists — a feature description with settled mechanics is a design-comp
request, and a generative-design skill owns that.

**Open `spike-report.md` now**, before any other work, and write the questions this run is meant to
settle under `Still open:`. Every later phase moves lines out of that list.

### 1. HARVEST — *G1: zero uncited constants; UI inventory complete*

LSP first (`ToolSearch select:LSP`). Grep only for string literals. Full recipes:
`references/harvest-playbook.md`.

| What | LSP | Fallback |
|---|---|---|
| Screen structure | `workspaceSymbol` on the view → `documentSymbol` → read the template in full | glob the view folder |
| Copy strings | read them from the source that renders them | grep the literal — **a string absent from the app is invented, full stop** |
| Icons | `goToDefinition` on the icon imports | grep the sprite or package |
| Design tokens | `workspaceSymbol` on the token module → `documentSymbol` | hex grep in `constants/`, `theme/`, `tokens.*` |
| Theming truth | `goToDefinition` on the theme resolver — read for early returns and dead code | read the resolver body |
| Feature flag | `workspaceSymbol` → **`findReferences`** for every gating site | grep the config key or flag SDK |
| Contract + timing | `goToDefinition` on the data hook | grep the route literal |
| Isolation posture | `goToDefinition` on the rendering component — read `sandbox`/CSP verbatim | grep `iframe`, `sandbox`, `srcDoc` |

Produce a harvest table — `element | value | path:line | verbatim?` — covering copy and structure,
not just tokens. `findReferences` is not optional: a flag usually gates more than one site, and
describing only the one you noticed misstates the change.

State which branch each value is in:

- **Mirror-verbatim** — it already exists; copy it exactly. Lists reproduce whole and in order.
- **Prove-then-record** — the mechanism *is* the spike; the prototype establishes the value. Mark it
  `ESTABLISHED HERE` and **append it to `spike-report.md` as you find it**, while the reasoning is in
  front of you rather than reconstructed later.

Where a screen cannot be read (no source, third-party surface), fall back to a screenshot and say so
in the file. Where neither exists, declare the whole prototype schematic up front rather than faking
selective realism.

### 2. FRAME — *G2: question↔control coverage both ways; invented ⟺ annotated*

Build the question↔control matrix. Catalogue and template: `references/control-derivation.md`.

Every control traces to a question. Every question reaches an observable state **or** carries a
caption saying why it cannot be seen — an invisible guarantee still has to be stated, or the client
cannot falsify it.

Then run the **annotation audit**: classify every element on every screen as harvested or invented,
and check invented ⟺ annotated in both directions.

### 3. BUILD — *G3: self-contained, degradable, no build step*

Zero-dependency HTML/CSS/JS. Inline SVG only: no `<img>`, `<link>`, `@import`, or CDN. Two-pane shell
collapsing to one column on narrow viewports, sticky stage. Structure and the copyable shell block:
`references/anatomy.md`.

Data ladder, decision procedure in `references/fidelity-tiers.md`:

| Tier | When | Requirement |
|---|---|---|
| **A — live** | the contract is reachable, or can be made reachable through a dev proxy holding credentials the browser never sees | wire the proxy with the secret injected server-side; real parameters from a gitignored source via a params route |
| **B — recorded** | the service exists but is unreachable from the dev box | capture once with `curl`; inline the exact bytes; a comment carries the literal command and the capture date |
| **C — labeled stub** | the service does not exist yet | visibly a stub; the caption names it as one |

If neither A nor B is reachable, **ask the operator for a capture**. For a technique spike Tier A is
a validity condition rather than a preference — a mechanism is only proven against real content — but
fidelity is a function of what already exists, so Tier C is not failure.

**Every tier degrades, never dead-ends.** The fetch-failure path falls back to the Tier-B/C payload
with an honest caption, so the same file works at its dev route *and* opened standalone.

Treat the dev proxy as a first-class artifact: it is where a **proposed edge contract** gets written.

### 4. DRIVE — *G4: every matrix cell observed; the app is recognizable*

Use Chrome, not Playwright: this artifact is disposable and will be frozen, so a retained spec file
is maintenance debt. Load in one call:

```
ToolSearch select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__read_page
```

If `ToolSearch` returns none of these, the Chrome tools are not configured in this environment.
Do not skip the gate silently and do not substitute reading the source: finish the build, then
report G4 as UNVERIFIED, naming which checks could not run. Steps 2 and 3 below are mechanical
proofs that source reading cannot supply.

Full checklist: `references/verification.md`. All mandatory:

1. `navigate` to the served route
2. `read_console_messages` → zero errors
3. `read_network_requests` → zero origins other than the dev server. This is the mechanical proof of
   self-containment; never assert it by reading the source
4. `computer` walks every question↔control cell; screenshot per state
5. **Recognition check** — where the app runs locally, open the real screen beside it. Every
   difference is either annotated or a defect. This is what catches an invented label
6. **Annotation completeness** — flip the annotation toggle and confirm every highlight is in the
   requirement's delta and nothing outside the harvest table stays un-highlighted
7. one keyboard-only pass and one reduced-motion pass
8. a control whose flip produces no observable change is deleted, not shipped
9. re-grep every class and id in the stylesheet against the rest of the file; delete unreferenced
   rules and report the count

### 5. CLOSE — *G5: nothing the spike settled leaves only as a comment*

**Close out `spike-report.md`** — the file you opened at ANCHOR and appended to throughout. Here you
only fill the fidelity ledger and move anything still unresolved into `Still open:`. If the run is
running short, this is the step to protect: finish the report and leave a rougher prototype rather
than a polished file whose findings exist only in a chat message nobody reads six months later.

```
Settled by this spike:
  - <technique>: <what was proven>, evidence <state> → belongs in an ADR
  - <route shape>: proposed as <path>, awaiting confirmation → belongs in the integration + its ADR
Still open:
  - <question>: unreachable at this fidelity tier because <reason>
Fidelity ledger:
  - UI: <n> harvested, <n> invented (all annotated), <n> unreadable → <fallback>
  - Data: tier <A|B|C>, <source or capture command + date>
Client-facing deltas to record:
  - → hand to your spec-playback / client-confirmation step
```

Then, **only where the environment allows it**: register the dev route, and run the secret/PII grep
against every environment value and against identity-document and customer-name patterns, refusing to
recommend a commit on a hit. Where either is impossible, say so in the report and move on — their
absence never suppresses the report.

Draft nothing else. This skill never writes a `## Playback` block, never drafts an ADR, never edits
requirement docs. It names destinations; a human decides.

## Hard rules

A scan-before-you-ship checklist; the phases above carry the reasoning.

1. Three `:root` groups — shell, app-harvested (each line `path:line`), prototype-only-and-justified.
2. Grep every user-visible string. Absent from the app → annotated as the requirement's own, or
   deleted. Static lists reproduce whole and in order.
3. No rung below a labeled stub. Unreachable and uncaptured → ask the operator.
4. Zero external subresources. A same-origin `fetch` is fine; a CDN font is not.
5. Invented ⟺ annotated, enumerable on demand.
6. Client's language for the shell; in-frame copy harvested verbatim; identifiers follow the codebase.
7. A control you *invent* stays clickable and says what is wrong beside the offending field. A control
   genuinely *reproduced* disabled stays disabled, annotated inherited-and-nonconforming with its
   `path:line`. Tell them apart by the render condition, not the `disabled` expression — a control the
   app never renders in that state is one you are inventing.
8. One anchor per file; a screen exists only if something reaches it.
9. The lede states the question. Could someone answer "no" to it?
10. Mirror constants, scheduling shape, and security attributes verbatim — never re-derive.
11. Upgrading a tier deletes the tier below it, dead CSS included.
12. Real identifiers arrive at runtime from a gitignored source, never inlined.
13. A proposed route is labelled a proposal, in the file and in the report.

## Where the artifact lands

`<frontend-root>/prototypes/FR-NNN-<slug>.html`, or `<slug>.html` in pure-spike mode. Track it in git
once the secret/PII grep is clean — an untracked prototype behind a committed dev route breaks on a
fresh clone. Scope dev-server changes to one dev-only route; never production routing, never the
build. Prefer a directory route over a per-file constant so the second prototype needs no server edit.

Freeze, don't delete. Usefulness expires when the requirement ships; evidentiary value does not — the
file is the evidence behind whatever decision the spike produced. Mark it frozen with a date and stop
maintaining it.

## References

- `references/anatomy.md` — shell structure, the single screen switcher, the copyable shell block
- `references/ui-fidelity.md` — the UI axis: reading a screen out of source, copy-string discipline,
  list completeness, the annotation audit, the recognition check, fallbacks
- `references/harvest-playbook.md` — LSP recipes, citation format, mirror-vs-prove branching
- `references/control-derivation.md` — question shapes → controls, the matrix template
- `references/fidelity-tiers.md` — data tiers, dev-proxy recipe, capture form, degrade path
- `references/verification.md` — the full browser drive
- `references/exemplar-visit-report.md` — a worked example walked through, including its defects
