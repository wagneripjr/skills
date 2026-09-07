# Prove out the in-app sailing manifest before we commit to it

> **Fictional app.** Ferrylink, its file paths, its polling code, its job API and the captured
> manifest below are invented for this exercise. They point at nothing real.

Ferrylink is the crew app for a regional passenger ferry operator. Today, to see a sailing manifest,
the purser taps a link that downloads a file from the harbourmaster's system and hands it to whatever
the handset does with downloads. FR-166 says it should open in the app.

Two different people need something out of this before we schedule the work.

The operations lead needs to see the waiting and failure behaviour and tell us whether it is
acceptable on a gangway with two minutes before departure. And I need to know whether the
harbourmaster's HTML actually survives being rendered under the isolation we use for crew notices,
because if it needs scripts enabled then this is a security conversation and not a UI ticket.

You do not have the repository in this environment. The parts of it you need are pasted below with
real line numbers.

## FR-166 - Sailing manifest in app

- **CA-01** While the manifest is being produced, the crew see a waiting state that names the sailing.
- **CA-02** The wait follows the interval the server dictates, and gives up at the documented ceiling,
  falling back to the existing download link.
- **CA-03** A failure shows an explicit retry action. Nothing retries by itself - each attempt costs
  a harbour-feed credit.
- **CA-04** The rendered manifest cannot reach the crew session.
- **CA-05** Leaving the screen cancels the wait.

**The unknown I need answered:** the crew-notice viewer renders its content under a fixed isolation
posture, unchanged for two years. Nobody has ever put harbourmaster HTML through it. Does it come out
intact, or does it need scripts enabled?

## The source

The existing notice viewer, whose isolation posture FR-166 is meant to reuse unchanged:

```tsx
// src/screens/notices/NoticeViewer.tsx
  44 | <iframe
  45 |   title="Crew notice"
  46 |   className="notice__frame"
  47 |   sandbox="allow-popups allow-downloads"
  48 |   referrerPolicy="no-referrer"
  49 |   srcDoc={notice.html}
  50 | />
```

The polling hook written for the manifest job, already merged behind the screen nobody can reach yet:

```ts
// src/screens/manifest/useManifestJob.ts
  17 | const MIN_POLL_MS     = 3_000;    // the harbour feed rate-limits below this
  18 | const DEFAULT_POLL_MS = 20_000;
  19 | const MAX_WAIT_MS     = 90_000;   // give up, fall back to the download link
  ...
  36 | const body = await res.json();
  37 | const wait = Math.max(MIN_POLL_MS, (body.retryAfterSeconds ?? DEFAULT_POLL_MS / 1000) * 1000);
  38 | timer = window.setTimeout(poll, wait);        // chained on purpose, never setInterval
  ...
  46 | } catch (err) {
  47 |   setState({ kind: 'failed', error: err });   // no automatic retry: each job costs a feed credit
  48 | }
  ...
  58 | return () => window.clearTimeout(timer);      // leaving the screen cancels the wait
```

The job API, as the harbourmaster's team documented it:

```
POST /v3/manifests            -> 202 {"jobId":"mf_8823","status":"pending","retryAfterSeconds":8}
GET  /v3/manifests/{jobId}    -> 202 {"status":"pending","retryAfterSeconds":8}
                              -> 200 {"status":"ready","html":"<!doctype html>..."}
                              -> 200 {"status":"failed","reason":"FEED_TIMEOUT"}
```

```ts
// src/styles/tokens.ts
  12 | export const tokens = {
  13 |   hull:    '#134E5E',
  14 |   deck:    '#FFFFFF',
  15 |   mist:    '#EFF3F4',
  16 |   ink:     '#101C21',
  17 |   inkSoft: '#55666D',
  18 |   line:    '#D3DDE0',
  19 |   alert:   '#B4402A',
  20 |   ok:      '#2E6B4F',
  21 | } as const;
```

Screen copy that already exists, from the download link this replaces:

```tsx
// src/screens/manifest/ManifestLink.tsx
  19 | <h1 className="manifest__title">Sailing manifest</h1>
  20 | <p className="manifest__sub">FL-2203 - Ardmore Pier to Kilbeg - 08:10</p>
  27 | <button className="manifest__download">Download manifest</button>
```

## The data

The harbour feed is not reachable from this environment. Here is a ready-state response I pulled on
2026-08-21, exactly as it came back - note that the manifest HTML carries its own inline styling and
a script tag:

```
$ curl -s -H "x-api-key: $FERRYLINK_KEY" \
    "https://harbour-feed.internal/v3/manifests/mf_8823"
{"status":"ready","html":"<!doctype html><html><head><style>body{font:13px Georgia,serif;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}</style></head><body><h2>SAILING MANIFEST FL-2203</h2><p>Ardmore Pier to Kilbeg &mdash; 2026-08-21 08:10 &mdash; issued 07:52</p><table><tr><th>Ref</th><th>Party</th><th>Foot/Veh</th><th>Notes</th></tr><tr><td>B-1042</td><td>Nolan, 2 adults</td><td>Vehicle</td><td>&nbsp;</td></tr><tr><td>B-1043</td><td>Okonkwo, 1 adult 2 children</td><td>Foot</td><td>Assistance requested</td></tr><tr><td>B-1044</td><td>Ferrand, 4 adults</td><td>Vehicle</td><td>Oversize &mdash; 6.2m</td></tr></table><script>document.title='FL-2203';</script></body></html>"}
```

## Constraints

One HTML file. It has to open by double-clicking it, so: no build step, no npm, no framework, no
network request at run time, nothing loaded from a CDN. Anything visual you need, draw inline. Render
it in a phone-sized frame.

The operations lead has two minutes with this, so she should be able to reach every behaviour FR-166
describes without me sitting beside her explaining what to click.

## Output Specification

Produce exactly two files in your working directory:

- **`FR-166-manifest-viewer.html`** - the clickable prototype.
- **`findings.md`** - a short write-up: what this exercise settled, what it did not, and where each
  answer needs to go next.
