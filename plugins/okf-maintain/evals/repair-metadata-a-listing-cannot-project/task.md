# Our docs listing renders badly and I do not know why

Ondaatje Robotics, `gantry-control` repo. Our documentation listing is generated from the YAML
header on each file under `docs/`. Three things are wrong with the output and I would rather fix
the headers than fight the generator:

1. It comes out with three separate sections that all mean the same thing, so the procedures are
   split across them and none of the three looks complete.
2. Two entries have no summary line at all, even though both of those files clearly have one in
   the header. The rest render fine.
3. One file stops the generator with a parse error before it gets to the end of the folder.

Two more things while you are in there:

- Priya on the safety team read `safety-interlocks.md` line by line and signed it off on 2 April
  2026. The header credits our documentation agent instead, which makes it look like nobody has
  actually checked it. Her account handle is `pnair`.
- `axis-limits.md` is superseded by the new limits table, but half the wiki still links to it, so
  it has to stay reachable. Somebody also put an expiry on it at some point and I have no idea
  what they intended by the date — nobody remembers.

Please recreate the tree exactly as given below in the working directory, then fix it.

## The tree as it stands

### `docs/deploy-gantry.md`

```markdown
---
type: Runbook
title: Deploying gantry-control
description: This runbook covers the full deployment of the gantry-control service to the plant floor, including the pre-flight interlock check, the staged rollout across all four cells, the smoke test on cell 1, and the rollback procedure to follow if the encoder self-test fails at any point during the rollout.
owner: controls-team
---

# Deploying gantry-control

Stage to cell 1 first, wait for a clean encoder self-test, then release the remaining three
cells together.
```

### `docs/restart-controller.md`

```markdown
---
type: Playbook
title: Restarting a cell controller
description: How to restart a single cell controller without stopping the line.
---

# Restarting a cell controller

Drain the cell, wait for the current cycle to finish, then cycle the controller and re-home.
```

### `docs/swap-encoder.md`

```markdown
---
type: runbook
title: Swapping an axis encoder
description: Replacing a failed axis encoder, from lockout through re-homing, including the torque values for the mounting bolts, the pairing sequence the new encoder needs, and the verification pass that has to be signed off before the cell goes back to production.
---

# Swapping an axis encoder

Lock out the cell, break the coupling, and note the index offset before you pull the old unit.
```

### `docs/axis-limits.md`

```markdown
---
type: Reference
title: Axis soft limits
description: Soft-limit values for each axis on the B-series gantry.
status: archived
stale_after: 2026-12-31
---

# Axis soft limits

Values are in machine units, measured from the home switch.
```

### `docs/safety-interlocks.md`

```markdown
---
type: Reference
title: Safety interlock chain
description: How the interlock chain is wired and what opens it.
owner: safety
jira: GC-412
verified: { by: gantry-doc-agent, at: 2026-04-02T10:00:00Z }
---

# Safety interlock chain

The chain runs enclosure latch, e-stop loop, light curtain, then the controller enable input.
```

### `docs/torque-curves.md`

```markdown
---
type: Reference
title: "Torque curves for the B-series gantry
description: Measured torque curves per axis at 20C.
---

# Torque curves for the B-series gantry

Curves were measured at 20C with the axis unloaded.
```

### `docs/spares.md`

```markdown
---
type: Reference
title: Spares
---

- 3x encoder, B-series
- 2x brake resistor
- 1x controller backplane, cell 3 only
```

## Output Specification

Write, in the working directory:

- All seven documents at the paths given, with their headers corrected. Leave each body as it is.
- `docs/index.md` — the listing as it should now render.
- `NOTES.md` at the repo root: every summary you rewrote and roughly how long the original was,
  any value you removed rather than guessed at, and anything you could not describe without
  reading meaning into it.
