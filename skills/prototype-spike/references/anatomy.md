# Anatomy of a prototype spike

One file, two panes: a **reviewer shell** on the left and a **device stage** on the right. The shell
is invariant across prototypes and is the only part you copy. The app chrome inside the stage is
composed fresh every time from the harvest table — never templated, because a reused app frame is
exactly how the wrong tokens and invented labels get in.

## Layout contract

```
<div class="wrap">
  <header class="page">        eyebrow (anchor id) · h1 (the question) · lede
  <div class="layout">
    <aside class="panel">      controls · service parameters · "where you are" · restart
    <div class="stage">        the device frame + a caption underneath
```

- `.layout` is `grid-template-columns: minmax(0, 320px) minmax(0, 1fr)`, collapsing to one column
  below ~900px.
- `.stage` is `position: sticky; top: 24px` on wide viewports, static when collapsed.
- The device frame is sized in real device units and capped against the viewport:
  `height: min(760px, calc(100dvh - 130px)); min-height: 520px`. Use `100dvh`, not `100vh` — mobile
  browser chrome makes `vh` lie.

## Shell versus app tokens

Two disjoint token sets in `:root`, and the separation is load-bearing: it is what stops a client
mistaking reviewer chrome for product.

The values below are **fictional**, from the same invented app as the harvest example — the point is
the three-group structure and the citation format, never the specific colors or line numbers.

```css
:root {
  /* shell — reviewer chrome, deliberately NOT the app's design language */
  --shell-bg: #EDF0EE;
  --shell-panel: #FFFFFF;
  --shell-ink: #1E2622;
  --shell-ink-soft: #5F6B64;
  --shell-line: #D2D8D4;
  --shell-accent: #3F7D4E;        /* the app's brand color, used ONLY for shell focus/accent */
  --shell-shadow: 0 24px 60px rgba(30, 38, 34, .18);

  /* app — harvested, each line carries its source */
  --brand:  #3F7D4E;  /* src/styles/palette.ts:24 */
  --ink:    #22302A;  /* src/styles/palette.ts:26 */

  /* prototype-only — justified */
  --novo:   #B5179E;  /* annotation layer only; MUST NOT exist in the app, so it can never be
                         mistaken for product UI */
}
```

Theme handling for the shell, three blocks, in this order — a color whose only definition sits inside
a media query has no light-mode value at all:

```css
:root { /* complete light palette */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* overrides */ } }
:root[data-theme="dark"] { /* same overrides, so an explicit toggle wins */ }
```

**The app tokens do not participate.** If the app is light-only, say so in a comment *and cite the
resolver line that proves it* — a theme function with an early `return false` is a fact you read, not
an assumption you made.

## One switcher drives four surfaces

Screens are sections toggled by a class. Exactly one function changes screens, and it updates every
dependent surface in the same call — split that logic and the step list will drift out of sync with
the frame within two edits.

```js
function show(name) {
  clearTimers();                                    // 1. cancel in-flight polling
  current = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelector('#s-' + name).classList.add('active');

  document.querySelectorAll('[data-nav] button').forEach(b =>                 // 2. nav highlight
    b.classList.toggle('on', b.dataset.go === name));
  document.querySelectorAll('#steps li').forEach(li =>                        // 3. step list
    li.classList.toggle('on', li.dataset.s === name));
  setFlowName(name);                                                          // 4. flow label
  caption(captionFor(name));                                                  // 5. narration
}
```

`clearTimers()` first is not incidental: leaving a poll running after the user navigates away is both
a bug and a silent contradiction of any "leaving cancels the wait" criterion.

## The caption is a second output channel

Under the frame, one line that changes with every state and says what happened **and why**:

- on a poll: what the server answered and what interval it dictated
- on a failure: that nothing will retry on its own, and why that is deliberate
- on a state no pixel can show ("leaving cancels the wait"): say it, or the client cannot falsify it
- on a spike result: what the mechanism just proved

Never leave a stale caption after a screen change or a branch of the data loop.

## Annotation layer

A body class plus one prototype-only color. Everything the requirement adds, changes, or removes is
reachable through it, and nothing else is.

```css
.tag { display: none; }
body.annot .tag { display: inline-block; }
body.annot .is-new { outline: 2px dashed var(--novo); outline-offset: -2px; }
```

Use `outline`, not `border` — a border changes layout and the annotated screen stops matching the
unannotated one.

## Rendering foreign content

If the prototype displays a document produced elsewhere, reproduce the app's isolation posture
**verbatim** — the sandbox token list, and the choice of inline content versus a URL. Both are
security decisions with reasons; a prototype that relaxes them proves nothing about the real screen.

## Accessibility floor

Not optional, and each one gets exercised during the drive:

```css
:focus-visible { outline: 2px solid var(--shell-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 3s; } }
```

Plus: real `<button>` elements for anything clickable, `h1` for the question, `text-wrap: balance` on
the headline, and `font-variant-numeric: tabular-nums` wherever the app shows codes or money.
