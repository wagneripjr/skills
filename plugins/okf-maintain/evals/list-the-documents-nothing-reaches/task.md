# Half our docs are invisible

Halvorsen Instruments, `labgrid` repo. We have a listing at `docs/index.md` that somebody wrote
by hand about eight months ago and has hand-edited since. It is wrong in both directions: it
points at a document we deleted in February, and it is missing most of what we have actually
written since. Anything under `docs/onboarding/` might as well not exist — two new hires last
month both said they never found it.

Please recreate the tree exactly as given below in the working directory, then fix the listings.

**We are in a documentation freeze.** Four of these documents are out for review with their
authors right now and any edit of mine will collide with theirs. So: do not change the contents
of any document, and do not add anything to the top of one either. The listings are yours; the
documents are not.

`docs/calibration.md` really is gone — it was folded into the alignment procedure in February.

## The tree as it stands

### `README.md`

```markdown
# labgrid

Control software for the Halvorsen optical bench and its sensor rig.
```

### `CONTRIBUTING.md`

```markdown
# How to contribute

Branch from master, run the bench simulator before pushing, and tag one of the instrument team
for review.
```

### `docs/index.md`

```markdown
# Documentation

- [Alignment procedure](alignment.md)
- [Calibration](calibration.md)
- [Sensor bus](sensor-bus.md)
```

### `docs/alignment.md`

```markdown
---
type: Procedure
title: Aligning the optical bench
description: Step-by-step alignment of the optical bench before a measurement run.
---

# Aligning the optical bench

Loosen the kinematic mounts, seat the reference flat, and walk the beam back to the target using
the two steering mirrors.
```

### `docs/sensor-bus.md`

```markdown
---
type: Reference
title: Sensor bus wiring
description: Pinout and address map for the sensor bus.
---

# Sensor bus wiring

The bus is a four-wire differential pair carrying up to sixteen addressable nodes.
```

### `docs/troubleshooting.md`

```markdown
# When the rig will not arm

Check the interlock loop first. An open enclosure latch, a tripped e-stop, or an unseated
encoder connector all present the same way at the panel.
```

### `docs/field-log-format.md`

```markdown
## Columns

Each row is one measurement: timestamp, axis, raw counts, corrected value, operator initials.

## Encoding

UTF-8, comma separated, no quoting.
```

### `docs/onboarding/day-one.md`

```markdown
---
type: Procedure
title: Your first day
description: What to do on your first day on the instrument team.
---

# Your first day

Collect a badge, get added to the bench rota, and pair with whoever is on calibration duty.
```

### `docs/onboarding/bench-safety.md`

```markdown
# Bench safety rules

Never energise the gantry with the enclosure open. The interlock is not a substitute for the
lockout tag.
```

### `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## What changed

## How it was verified
```

## Output Specification

Write, in the working directory:

- `index.md` at the repo root.
- `docs/index.md`, replacing what is there.
- `docs/onboarding/index.md`.
- `NOTES.md` at the repo root: anything you removed from a listing and why, any file you could
  not place and why, and every document you left without a summary.

Do not create or modify any other file, including the documents themselves.
