# Harvest playbook

Nothing gets written into the prototype until it is in the harvest table. The table is the artifact
that makes every later gate mechanical: the annotation audit is a set difference against it, the
recognition check resolves against it, and the spike report reads its `ESTABLISHED HERE` rows.

## The table

Every value below is **fictional** — an invented app used to show the format. The colors, paths and
line numbers point at nothing real; only the *shape* of a row is the lesson. Cite your own app.

| element | value | path:line | branch |
|---|---|---|---|
| brand green | `#3F7D4E` | `src/styles/palette.ts:24` | mirror |
| primary CTA label | `Open this block` | `src/screens/block-roster/BlockRoster.tsx:212` | mirror |
| block-roster tabs | `All, Bearing, …` (6, in order) | `src/screens/block-roster/BlockRoster.tsx:96-118` | mirror |
| retry floor | `3` seconds | `src/hooks/useSprayWindow.ts:41` | mirror |
| report isolation | `sandbox="allow-scripts allow-popups"` | `src/screens/spray-window/SprayWindow.tsx:58` | mirror |
| proposed route | `/orchard/spray-window` | — | **ESTABLISHED HERE** |

Two branches, and every row declares one:

- **mirror** — the value exists; copy it exactly. This is the default and covers most rows.
- **ESTABLISHED HERE** — the prototype is deciding the value because the spike is what settles it.
  These are *outputs* of the run, not inputs, and CLOSE must report each one with its destination.

A row you cannot fill is not a row you may guess. Either widen the search, or move the element to the
prototype-only group with a written justification, or drop the element.

## LSP first

Navigation goes through LSP (`ToolSearch select:LSP`) because it resolves across files and follows
re-exports, which grep cannot. Grep stays the right tool for string literals — hex codes, route
paths, config keys, user-visible copy — because those *are* text.

### Screen structure

```
workspaceSymbol  "BlockRoster"   → locate the view
documentSymbol   <view file>     → its components and handlers
```
Then read the template in full. Skimming produces the classic failure: the elements you noticed are
faithful and the ones you skipped are missing, and the client sees a screen with holes.

### Copy strings

Read them out of the source that renders them. Static arrays (tab lists, menu entries, section
headings) are the high-value target: they have a definite length and order that a prototype must
reproduce whole.

```bash
grep -rn "title: '" src/screens/block-roster/BlockRoster.tsx
```

A string absent from the app is invented. No exceptions, no "it's obviously what they'd call it".

### Design tokens

```
workspaceSymbol  "colors" | "theme" | "tokens"   → the token module
documentSymbol   <token file>                    → the exported maps
```
Record the raw literal *and* any normalization you perform — a token stored as `#22302AFF` written as
`#22302A` is an eight-to-six-digit conversion, and saying so keeps the citation honest.

### Theming truth

```
goToDefinition  <theme resolver>
```
Read the body, not the signature. A resolver that early-returns before its `matchMedia` call is
light-only in practice regardless of what the dead code below suggests. This is a fact you can state
with a citation; "the app looks light" is not.

### Feature flags

```
workspaceSymbol  ENABLE_<FEATURE>
findReferences   ENABLE_<FEATURE>      ← not optional
```
`findReferences` is what turns "the flag shows the screen" into "the flag routes entry *and* shows a
menu row *and* guards the screen itself". A flag description built from the one call site you happened
to open understates the change, and the control label in the panel will be wrong.

### Contract and timing

```
goToDefinition  <data hook>
```
Harvest every constant *and* the scheduling shape: a chained timeout is a different guarantee from an
interval, and the comments around these values usually carry the reasoning you need for the caption.

### Isolation posture

```
goToDefinition  <rendering component>
```
Copy the sandbox token list character for character, and note whether content arrives inline or by
URL. Both are security decisions. A prototype that relaxes either proves nothing about the real screen
— which matters most when isolation *is* the spike.

## When the source cannot be read

Third-party surfaces, screens behind a vendor portal, code you have no access to: fall back to a
screenshot, record in the file which screens came from images and when, and keep the fallback visible
in the fidelity ledger. Silence here is what turns an honest approximation into an accidental claim.
