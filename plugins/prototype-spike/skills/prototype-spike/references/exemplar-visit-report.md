# A worked example, walked through — including what it got wrong

This walkthrough is **fictional** — the same invented orchard app used in `harvest-playbook.md` and
`anatomy.md`. The artifact, the team, the defects and every value below point at nothing real. Only
the *shape* of the critique is the lesson.

The example artifact is a single self-contained HTML file prototyping one requirement in a React PWA used
by orchard scouts: an advisory screen existed in the app, but nothing navigated to it, and the team
needed to decide *where the entry point belongs* — surfaced automatically when a scout opens a
block, or as a row in the account menu.

It is worth studying because it is written to be both good and flawed, and the flaws are the ones
this skill exists to prevent. An example that showed only the format would teach neither.

## What it was actually for — two audiences

**Outward**, it asked the client which entry path they wanted. Its two flows are the two candidate
answers, and the control panel makes both clickable.

**Inward**, it was a design spike. The team did not know whether an isolated inline frame would render
the externally-produced advisory without leaking the session, and they did not know what the service
route should look like. The prototype answered both by doing them for real.

That second audience is easy to forget and is why CLOSE exists. A spike usually settles more than
one question, and the answers do not survive at the same rate:

- **The question the requirement was already about graduates.** Somebody was waiting for it, so it
  lands in a decision record and gets ratified. Proposal → ratification, properly.
- **The question the spike had to answer along the way does not.** The technique that made the
  prototype work at all — the isolation approach, the transport choice, whatever the build forced
  you to solve before anything rendered — survives as a code comment beside the implementation and
  maybe one test assertion. No decision record mentions it.

Same artifact, same session, two outputs, one recorded. That is the asymmetry the spike report is
designed to make visible, and it is why CLOSE asks what the run settled rather than what it built.

## What it does well

**Tokens are the app's own.** Brand green, bark, amber, clay, and the grey ramp are all lifted
from the real token modules. Exactly one color is invented — the annotation accent — and it is chosen
specifically so it exists nowhere in the app and can never be mistaken for product UI.

**It reads code instead of guessing.** A comment states the app is light-only "because the theme
check returns false" — which is a true reading of a resolver that early-returns before its media
query, with dead code below. That is a citable fact, not an impression.

**The flag is the real flag.** The panel's first control carries the actual runtime config key, and
its help text describes *both* effects — routing on block entry and the menu row's visibility —
because whoever built it followed the references, not just the one call site they opened first.

**The data is live, through the real contract.** It calls the same endpoint the app calls, through a
dev proxy that injects the service key server-side, and honours the asynchronous contract rather than
approximating it: the service accepts the request before the answer exists and dictates how long to
wait, so the prototype waits the interval it is given instead of polling on a cadence of its own, and
it does not retry by itself when a request fails. The advisory renders in the same sandboxed frame the
screen uses.

**It narrates.** The caption under the device changes with every state and explains the mechanism —
what the service answered, what interval it dictated, why nothing retries on its own.

## Five defects

**D1 — dead lower-tier CSS.** A block of lower-tier CSS styles an advisory layout with zero markup
references anywhere in the file — the fossil of a hand-drawn fake advisory that was replaced by the
live inline frame and never deleted. A later reader cannot tell whether the file has two rendering
modes.
*Gate:* re-grep classes and ids after any fidelity upgrade.

**D2 — uncited tokens.** Not one color carries a source line. The harvested brand green and the invented
annotation accent sit in the same undifferentiated block, so nothing distinguishes fact from choice.
*Gate:* three groups in the root block, every harvested line citing `path:line`.

**D3 — an invented disabled control.** The primary action ships disabled until a block is selected —
the "form incomplete" case, where a greyed control withholds *why*. It looks inherited from the app,
whose button carries a `disabled` expression including the same condition. It is not: the app wraps
that whole block in a render guard, so in production **no button exists** until a selection is made
and the user never meets a greyed control. The prototype introduced the violation and is *less*
faithful than the app it copies. *Gate:* decide inherited-versus-invented by reading the render
condition, not the attribute.

**D4 — the failure path dead-ends.** When the fetch fails, the caption asks whether the dev server is
running on port 3000. Opened anywhere else — a chat link, a published page, six months later — the
file is a broken screen rather than a degraded demo, which throws away most of its useful life.
*Gate:* every tier degrades to the recorded or stub payload with an honest caption.

**D5 — invented UI copy beside harvested copy.** The block-roster tab strip shows a tab that exists
nowhere in the repo, sitting unmarked beside correctly harvested ones. The app renders its tabs from a
fixed array, so the prototype simultaneously invented an entry and dropped the ones it did not copy. Neither the invented tab nor the two omissions carry an annotation, so the invented entry is
indistinguishable from the accurate four. A reviewer either believes the invented tab or spots it —
and spotting it discredits the four true ones beside it. *Gate:* grep every user-visible string;
reproduce static lists whole and in order; invented ⟺ annotated.

## One structural finding

The dev-server config that serves the prototype is committed; the prototype itself never was. A fresh
clone therefore has a tracked route pointing at a missing file. Either the artifact is tracked or the
route is removed — and tracking is usually right, because the file is one text document with no build
output, and real identifiers reach it at runtime from a gitignored source rather than being inlined.
