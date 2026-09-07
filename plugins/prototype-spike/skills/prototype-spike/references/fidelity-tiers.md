# Data fidelity tiers

> The orchard app in the examples below is **fictional** — the same invented app used in
> `harvest-playbook.md`, `anatomy.md` and `exemplar-visit-report.md`. Paths, component names,
> feature flags, timings and endpoints point at nothing real; they illustrate shape only.

What the screen *shows* has its own ladder, independent of how faithfully the screen is *built*. A
labeled stub inside a source-faithful UI is a perfectly good prototype. An invented payload inside a
beautiful one is worthless, because everything the reviewer concludes from it is about a system that
does not exist.

## The ladder

| Tier | Condition | What you build |
|---|---|---|
| **A — live** | the contract is reachable, or can be made reachable through a dev proxy holding credentials the browser never sees | the real request, the real response, the real timing |
| **B — recorded** | the service exists but is unreachable from the dev box | one captured response, inlined byte-for-byte |
| **C — labeled stub** | the service does not exist yet | a visibly fake placeholder the caption names as fake |

**There is no rung below C.** If neither A nor B is reachable and the shape matters, ask the operator
for a capture. Composing a plausible response is the one failure this skill cannot recover from:
every downstream judgment — layout, truncation, empty states, error handling, whether the thing is
even useful — is then about fiction.

Fidelity is a function of what already exists. Tier A is available when part of the system has
already shipped; on a greenfield requirement Tier C is the correct answer, not a failure. Say which
tier you are on in the fidelity ledger and move on.

For a **technique spike**, Tier A is a validity condition rather than a preference. A rendering,
isolation, or streaming mechanism is only proven against real content — real length, real markup,
real weirdness. A spike run against a stub proves the stub renders.

## Tier A: the dev proxy

The proxy exists because of a constraint, not for convenience: a browser bundle cannot hold a service
credential, and a service reached server-to-server usually has no CORS allowance for a browser origin.
The dev server is the one place that can hold the secret and speak to both sides.

Three pieces:

```js
// 1. the prototype's own route — a directory route, not one constant per file,
//    so the next prototype needs no server edit
app.get('/prototype/:id', (req, res) =>
  res.sendFile(path.resolve(__dirname, `../prototypes/${req.params.id}.html`)));

// 2. real parameters, from a gitignored source, delivered at runtime.
//    This is what keeps real identifiers out of the committed file.
app.get('/prototype-params', (_req, res) => res.json(readEnv()));

// 3. the service call, with the secret injected server-side
createProxyMiddleware({
  target: env['service-url'],
  pathRewrite: { '^/proxy-route': SERVICE_ROUTE },
  onProxyReq: (proxyReq) => proxyReq.setHeader('x-api-key', env['x-api-key']),
});
```

Keep it dev-only. Never touch production routing or the build.

**The route you invent here is a proposal.** If the real edge has not published this path yet, you are
choosing it, and someone else will have to ratify it. Say so in a comment beside the constant and
report it at CLOSE — a proposal that reads as a settled contract is how a guess becomes an
architecture by default.

## Tier B: the capture

Capture once, inline the exact bytes, and record how you got them:

```js
/* Captured YYYY-MM-DD:
   curl -s -H "x-api-key: $KEY" "$BASE/api/v1/spray-window/advisory?block=42&season=2026"
   Response inlined verbatim below; do not hand-edit. */
```

Do not tidy the payload. Trimming a long field or rounding a number destroys the thing a capture is
for — showing what the screen does with real data, including data that is longer, uglier, or emptier
than anyone designed for.

## Tier C: the stub

Make it obviously a stub — visually distinct, and named as one in the caption. A polished placeholder
gets screenshotted into a slide deck and becomes a commitment nobody made.

## Every tier degrades

Whatever tier the prototype runs at, the failure path must land somewhere honest. The reviewer will
open the file without the dev server running — from a chat link, from a published page, months later
— and a prototype that shows a broken screen there has thrown away most of its lifespan.

```js
try {
  response = await fetch(route, { cache: 'no-store' });
} catch {
  renderRecorded(CAPTURED_PAYLOAD);
  caption(`Dev server unavailable — showing the response captured on ${CAPTURE_DATE}.`);
  return;
}
```

The caption is the load-bearing part: degrade silently and the reviewer cannot tell live data from a
months-old capture.

## Fidelity ledger

CLOSE reports the tier, the source, and the date. A reader six months later needs to know whether the
numbers on the screen were real, and how old they were.
