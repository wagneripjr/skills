# UI fidelity: rebuilding a screen that already exists

> The orchard app in the examples below is **fictional** — the same invented app used in
> `harvest-playbook.md`, `anatomy.md` and `exemplar-visit-report.md`. Paths, component names,
> feature flags, timings and endpoints point at nothing real; they illustrate shape only.

When the prototype covers a screen the client already uses daily, fidelity is not polish — it is what
makes the exercise valid. A client reviewing a prototype is reading it as *their app plus a change*.
Every element that silently differs from their app is a second, unannounced change they now have to
untangle from the one you meant to show them. Worse: when they spot one invented detail, they stop
trusting the accurate ones, and the review turns into a hunt for errors instead of a decision.

So the rule is narrow and absolute: **invent only what the requirement adds, and annotate it.**

## The ladder

| Rung | When | What you owe the reader |
|---|---|---|
| **from-source** | the screen's code is in the repo | every element traced to `path:line` in the harvest table |
| **from-screenshot** | no source access (third-party surface, external portal) | a note in the file saying which screens came from images and when the image was taken |
| **schematic** | neither source nor images exist — the screen is new | declare the *whole prototype* schematic in the lede; do not mix schematic screens into a source-faithful file without saying so |

Mixing rungs silently is the failure mode. A file that is 90% source-faithful and 10% invented reads
as 100% faithful, which makes the invented 10% actively misleading.

## Copy strings

User-visible text is where invention is both easiest and most damaging, because a wrong label is
indistinguishable from a right one.

**Grep every string you are about to write.** If it is not in the app, it is invented — there is no
third category. Then either it is the requirement's own new copy, in which case annotate it, or delete
it.

```bash
grep -rn "Open this block" src/ | head -1
# src/screens/block-roster/BlockRoster.tsx:212   → harvested, cite it

grep -rn "Irrigation" src/ public/ | head -1
# (no output)                              → invented; annotate or delete
```

Watch for a compound failure: inventing an entry *and* dropping real ones. A tab strip rendered from
a static array in the source has a definite length and order. Reproduce it whole. Rendering a tab you
invented while silently dropping ones the array contains is three errors wearing one coat.

Strings that come from data rather than source (a client's name, a product title) are not invented —
they are Tier-A/B payload and follow the data ladder instead.

## Structure and order

Read the template top to bottom and reproduce the *sequence*, not just the inventory. Clients navigate
by position; a settings row moved two slots up reads as a redesign nobody asked for.

Capture, per screen: the chrome (header, tabs, bottom nav, any persistent context bar), the order of
content blocks, which controls are present in each block, and what the empty and loading states look
like. If the requirement adds a row to a list, the surrounding rows must be the real ones, in the real
order, or the client cannot judge whether the new row is in the right place — which is usually the
actual question.

## Icons

Harvest the icon set the app uses. Where the real icons are unavailable as inline markup, hand-draw
inline SVG that matches the family's stroke weight, corner radius, and optical size — and say so once
in a comment. A prototype using a visibly different icon family reads as a redesign.

## The annotation audit

Before the browser drive, walk every element on every screen and mark it *harvested* or *invented*.
Two failure directions, both defects:

- **invented and un-annotated** — the client believes something false
- **annotated but not part of the requirement's delta** — the prototype changed the app for no
  reason, and the annotation layer now cries wolf

The audit is the reason the annotation layer must be a real toggle rather than static highlighting:
you have to be able to see the screen both ways to tell whether the diff is honest.

## The recognition check

Where the app runs locally, open the real screen beside the prototype during the drive and compare.
This catches what the harvest table cannot: a spacing scale that drifted, a heading weight that is
subtly off, a control that is present in both but positioned differently.

Every difference resolves one of three ways — it is annotated (intended), it is a harvest error (fix
it), or it is a real defect *in the app* that the prototype faithfully reproduced (keep it, mark it
inherited, cite the line). That third case is worth surfacing rather than silently fixing: it tells
the team something true about the code.

## Inherited defects

The prototype's obligation is fidelity, and that includes reproducing things the house style would
otherwise forbid. A control the app disables for a semantic reason stays disabled in the prototype,
marked in the annotation layer as inherited-and-nonconforming, with its `path:line`. Silently fixing
it hides a real finding and makes the prototype describe an app that does not exist.

Decide inherited-versus-invented by reading the **render condition**, not the attribute. A button the
app never renders until a selection exists is not a disabled button — a prototype that renders it
greyed out has invented the violation, and rule 7a applies instead.
