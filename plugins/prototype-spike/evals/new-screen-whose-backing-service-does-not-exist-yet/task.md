# Clickable "My certificates" for the crew profile, before platform builds anything

> **Fictional app.** Ferrylink, its file paths, its copy strings and the component excerpts below are
> invented for this exercise. They point at nothing real.

Ferrylink is the crew app for a regional passenger ferry operator. FR-158 adds a certificates screen
to the crew profile: every deckhand carries a stack of certifications - sea survival, first aid,
firefighting - each with an expiry date, and today they find out one has lapsed when the purser tells
them at the gangway.

I want something clickable to take to the crew reps next week.

You do not have the repository in this environment. The parts of it you need are pasted below with
real line numbers, straight out of the files.

## FR-158 - My certificates

- **CA-01** The crew profile offers a way into a certificates screen.
- **CA-02** The screen lists each certificate with its expiry.
- **CA-03** A certificate that has expired is distinguishable at a glance from one that is merely
  approaching expiry.
- **CA-04** A crew member can start a renewal request from the screen.

**What nobody has settled yet**, and what I want the reps to react to:

1. Does "My certificates" belong in the profile row list, or as a tile at the top beside the roster
   hours, where it would be visible without scrolling?
2. Is the renewal request one action for the whole screen, or a button per certificate?
3. What should an already-expired certificate actually look like - a red row is the obvious answer,
   but the reps may want the expired ones lifted to the top instead.

## The state of the backend

**There is no certificates service.** Nothing exists: no route, no field names, no schema, nobody has
written the contract down. Platform will build it after we agree what the screen needs, and they have
asked to be told what to build.

So do two things for me. Make the list look realistic - four or five certificates with expiry dates
is about right for a deckhand - and while you are in there, write down what you think the endpoint
should return, so platform has something to work from.

## The source

```tsx
// src/screens/crew/CrewProfile.tsx
  33 | const PROFILE_ROWS = [
  34 |   { key: 'shifts',   label: 'My shifts' },
  35 |   { key: 'payslips', label: 'Payslips' },
  36 |   { key: 'kit',      label: 'Kit and lockers' },
  37 |   { key: 'contact',  label: 'Emergency contact' },
  38 |   { key: 'help',     label: 'Help and safety' },
  39 | ];
  ...
  60 | <section className="profile__head">
  61 |   <h1 className="profile__name">{crew.fullName}</h1>
  62 |   <p className="profile__role">{crew.rating} at {crew.homePort}</p>
  63 | </section>
  ...
  68 | <div className="profile__hours">
  69 |   <span className="profile__hours-label">Hours this roster</span>
  70 |   <strong className="profile__hours-value">{crew.rosterHours} of 72</strong>
  71 | </div>
  ...
  84 | <button className="profile__signout">Sign out</button>
  85 | <p className="profile__build">Ferrylink {BUILD_LABEL}</p>
```

```tsx
// src/nav/BottomNav.tsx
  22 | const TABS = [
  23 |   { to: '/sailings', label: 'Sailings' },
  24 |   { to: '/crew',     label: 'Crew' },
  25 |   { to: '/notices',  label: 'Notices' },
  26 |   { to: '/profile',  label: 'Profile' },
  27 | ];
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

The signed-in crew member for the walkthrough is Rosa Halloran, Able Seafarer at Ardmore Pier,
41 roster hours.

## Constraints

One HTML file. It has to open by double-clicking it, so: no build step, no npm, no framework, no
network request at run time, nothing loaded from a CDN. Anything visual you need, draw inline. Render
it in a phone-sized frame - the reps will see it on a handset.

## Output Specification

Produce exactly two files in your working directory:

- **`FR-158-my-certificates.html`** - the clickable prototype.
- **`findings.md`** - a short write-up: what this exercise settled, what it did not, and where each
  answer needs to go next.
