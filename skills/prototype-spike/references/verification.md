# Verifying the prototype

A prototype is a claim about how something behaves. Reading the source you just wrote does not test
that claim — it re-reads your own intent. Drive it in a browser.

Use Chrome rather than a test framework: this artifact is disposable and will be frozen when the
requirement ships, so a retained spec file is maintenance debt on something nobody will run again.

Load the tools in one call:

```
ToolSearch select:mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__read_page
```

If none of those tools resolve, they are not configured here. Report the gate UNVERIFIED and say
which checks could not run — never infer these results by reading the source.

## Checklist

**1. Console is clean.** `read_console_messages` → zero errors. A thrown error usually means one
branch of the state machine never runs, and that branch is often the interesting one.

**2. No foreign origins.** `read_network_requests` → nothing but the dev server. This is the
mechanical proof that the file is self-contained; do not substitute reading the source for it, since
the whole point is catching the subresource you forgot you referenced. A single CDN font both breaks
the file for offline review and leaks the reviewer's browsing to a third party.

**3. Every matrix cell.** Walk each question↔control combination with `computer`, screenshot each
state. Watch for the common lie: a control that is present, wired, and changes nothing. Flip it and
confirm something on screen actually differs. **A control with no observable effect is deleted, not
shipped** — it invites a decision the prototype cannot inform.

**4. Recognition check.** Where the app runs locally, open the real screen in a second tab and put
them side by side. Resolve every difference:

- annotated → intended, fine
- harvest error → fix it
- a real defect in the app, faithfully reproduced → keep it, mark it inherited, cite the line

This is the step that catches an invented label, a dropped list entry, or a spacing scale that
drifted — none of which the harvest table can catch on its own, because they are things you never
recorded.

**5. Annotation completeness.** Flip the annotation toggle and check both directions: everything
highlighted is part of the requirement's delta, and nothing outside the harvest table is left
un-highlighted. This is a set difference, so do it deliberately rather than by eye.

**6. Keyboard pass.** Tab through the panel and drive the primary flow without a mouse. Focus rings
must be visible at every stop. A declared `:focus-visible` rule that nothing exercises is decoration.

**7. Reduced-motion pass.** Re-run with reduced motion preferred and confirm the animations respond.

**8. Degrade pass.** Open the file with the dev server stopped. It must fall back to the recorded or
stub payload with a caption saying so — not a broken screen, and not a silent switch that looks live.

**9. Dead-CSS sweep.** Re-grep every class and id in the stylesheet against the rest of the file and
delete unreferenced rules. Fidelity upgrades leave fossils: when a hand-drawn placeholder is replaced
by real content, its styling survives and quietly misleads the next reader about what the file does.
Report the count so the sweep is visible.

## What "observed" means

A state is observed when you drove the prototype into it and looked at the result — not when you
reasoned that the code would produce it. The distinction matters most for timing-dependent states: a
polling loop, a timeout ceiling, a retry interval. Those are exactly the states where an off-by-one
hides, and exactly the ones most likely to be waved through.

If a state cannot be reached at the current fidelity tier — a long poll ceiling you will not sit
through, an error the service will not produce on demand — say so in the fidelity ledger rather than
implying it was checked.
