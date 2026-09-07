# Make the delayed-sailing reason clickable before we build it

> **Fictional app.** Ferrylink, its file paths, its copy strings, its feature flags and the captured
> response below are all invented for this exercise. They point at nothing real.

Ferrylink is the crew app for a regional passenger ferry operator. Deckhands and pursers live on the
sailings board all day. Operations has asked for FR-141, and before anybody writes production code
I want to put something clickable in front of the operations lead so she can tell us whether we read
the request the way she meant it.

You do not have the repository in this environment. Everything you need from it is pasted below,
with real line numbers, straight out of the files. Work from these excerpts.

## FR-141 - Delay reason on the sailings board

Today a delayed sailing shows the word "Delayed" and nothing else, so the crew phones the
harbourmaster to ask why. The harbour feed already carries the reason.

- **CA-01** A delayed sailing on the board shows the delay in minutes and the reason.
- **CA-02** When the feed carries a delay but no reason text, the row shows the minutes and does not
  render an empty reason line.
- **CA-03** Tapping a delayed row opens a detail sheet with the minutes, the reason, where the reason
  came from, and when it was last updated.
- **CA-04** The detail sheet issues no new request to the harbour feed. It renders what the board
  already loaded.

Behind the existing flag. The scaffolding for this landed months ago and has been off since.

**What operations has not decided, and what I actually want out of this session:** whether the reason
belongs inline on the board row at all, or only inside the sheet. She thinks the board is already
crowded. I think a purser scanning the board should not have to tap. Let her see both.

## The source

```tsx
// src/screens/sailings/SailingsBoard.tsx
  41 | const FILTERS = ['All', 'Boarding', 'Departed', 'Delayed', 'Cancelled', 'Berthed'] as const;
  42 |
  ...
  52 | const STATE_LABEL: Record<SailingState, string> = {
  53 |   boarding:  'Boarding now',
  54 |   departed:  'Departed',
  55 |   delayed:   'Delayed',
  56 |   cancelled: 'Cancelled',
  57 |   berthed:   'Alongside',
  58 | };
  ...
  77 | <header className="board__head">
  78 |   <h1 className="board__title">Today's sailings</h1>
  79 |   <p className="board__sub">Live from the harbour feed</p>
  80 | </header>
  ...
  94 | {FILTERS.map((f) => (
  95 |   <button key={f} className={cx('chip', f === active && 'chip--on')} onClick={() => setActive(f)}>
  96 |     {f}
  97 |   </button>
  98 | ))}
  ...
 110 | <li className="row">
 111 |   <span className="row__code">{s.sailingCode}</span>
 112 |   <span className="row__route">{s.route}</span>
 113 |   <span className="row__time">{s.scheduledDeparture}</span>
 114 |   <span className="row__state">{STATE_LABEL[s.state]}</span>
 115 |   {useFlag('ferrylink.delayReason') && <DelayReasonRow sailing={s} />}
 116 |   <button className="row__cta">Open sailing</button>
 117 | </li>
  ...
 129 | <p className="board__empty">No sailings match this filter.</p>
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

```ts
// src/theme/resolveTheme.ts
   9 | export function resolveTheme(): 'light' | 'dark' {
  10 |   return 'light';                      // dark mode postponed indefinitely, see FR-092
  11 |   // eslint-disable-next-line no-unreachable
  12 |   if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  13 |   return 'light';
  14 | }
```

```ts
// src/flags/registry.ts
  18 |   'ferrylink.delayReason': { default: false, owner: 'sailings' },
```

Where that flag key is read, in full:

```
$ grep -rn "ferrylink.delayReason" src/
src/screens/sailings/SailingsBoard.tsx:115:  {useFlag('ferrylink.delayReason') && <DelayReasonRow sailing={s} />}
src/nav/routes.tsx:63:  useFlag('ferrylink.delayReason') ? <Route path="/sailings/:code/delay" element={<DelaySheet />} /> : null,
```

## The data

The harbour feed is not reachable from this environment. Here is a response I pulled off it on
2026-08-14, exactly as it came back:

```
$ curl -s -H "x-api-key: $FERRYLINK_KEY" \
    "https://harbour-feed.internal/v3/sailings?day=2026-08-14"
{"asOf":"2026-08-14T07:12:03Z","pollAfterSeconds":15,"sailings":[{"sailingCode":"FL-2201","route":"Ardmore Pier to Kilbeg","scheduledDeparture":"07:40","state":"berthed","delay":null},{"sailingCode":"FL-2203","route":"Ardmore Pier to Kilbeg","scheduledDeparture":"08:10","state":"delayed","delay":{"minutes":25,"reasonCode":"WX_SWELL","reasonText":"Swell above operating limit at Kilbeg","updatedAt":"2026-08-14T07:05:40Z","source":"harbourmaster"}},{"sailingCode":"FL-2204","route":"Kilbeg to Ardmore Pier","scheduledDeparture":"08:35","state":"delayed","delay":{"minutes":25,"reasonCode":"WX_SWELL","reasonText":null,"updatedAt":"2026-08-14T07:05:41Z","source":"harbourmaster"}},{"sailingCode":"FL-2206","route":"Ardmore Pier to Kilbeg","scheduledDeparture":"09:10","state":"boarding","delay":null}]}
```

## Constraints

One HTML file. It has to open by double-clicking it, so: no build step, no npm, no framework, no
network request at run time, nothing loaded from a CDN. Anything visual you need, draw inline.

The operations lead will be looking at this on a phone-sized frame, so render it in something that
reads like the mobile app rather than a desktop page.

## Output Specification

Produce exactly two files in your working directory:

- **`FR-141-delay-reason.html`** - the clickable prototype.
- **`findings.md`** - a short write-up: what this exercise settled, what it did not, and where each
  answer needs to go next.
