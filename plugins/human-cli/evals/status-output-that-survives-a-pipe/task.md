# `swarmwatch nodes` needs to work for people *and* for pipes

Quillon Robotics runs warehouse picking robots. `swarmwatch nodes` prints the current state of
the fleet as a table. It is the command our floor supervisors run twenty times a shift, and it
is also the command everyone drops into one-liners. Right now it is bad at both.

I want it rewritten. Here is what I have collected from the team.

## What is going wrong

- Sam runs `swarmwatch nodes | grep Offline | wc -l` to count what is down. The count is wrong
  and the matched lines are full of unreadable junk characters when he opens them in a file.
- Sam also runs `swarmwatch nodes | head -3`. After the third line he gets a wall of red
  interpreter output instead of a clean stop.
- Priya redirects to a file for the morning report: `swarmwatch nodes > snapshot.txt`. The
  "Fetching fleet state…" indicator ends up inside `snapshot.txt`, mixed into the data.
- Priya also has an environment variable set in her shell that `rg`, `gh` and `bat` all honour
  to turn colour off everywhere. Ours ignores it. She wants a one-off switch too, for the times
  she is at someone else's machine.
- Marco is colourblind. On his screen he cannot tell the failing rows from the healthy ones,
  because the only difference is that they are printed in red.
- On the loading-dock terminal, which is narrow, the table wraps into an unreadable mess.
- When a filter matches nothing, the command prints only the column headings. Two people have
  reported that as "the tool returned nothing, I think it crashed".
- Fetching state takes about three seconds and the terminal is completely silent for all of it,
  so people assume it is stuck and hit Ctrl-C. When they do, they get another wall of
  interpreter output.

## Constraints

- Python 3 standard library only, or Node.js builtins only. No pip, no npm, no network.
- One entry file, runnable with no install step.
- Embed a fixed fleet of eight robots in the source. Each has: a name, a status of exactly one
  of `Running`, `Degraded` or `Offline`, a battery percentage, an uptime, and a last-seen
  timestamp. Make at least two of them not `Running`.
- Simulate the three-second fetch with a sleep so the slow-operation behaviour is real. Provide
  a way to shorten it so the demos do not take all day.
- Support at least `swarmwatch nodes` and `swarmwatch nodes --status <status>`.

## Output Specification

Write these four files into the working directory:

1. **`swarmwatch.py`** (or `swarmwatch.mjs`) — the complete, runnable tool.

2. **`demo-terminal.txt`** — a faithful reproduction of what the table looks like on a normal
   wide terminal for a supervisor, including whatever is shown while the three seconds elapse.

3. **`demo-piped.txt`** — real captured output. Run each of these, and record the exact command
   line, the output that came back, and the exit code:
   - `swarmwatch nodes | cat`
   - `swarmwatch nodes > snapshot.txt` followed by the contents of `snapshot.txt`
   - `swarmwatch nodes --status Offline | head -1`
   - a run whose `--status` filter matches nothing at all
   - a run with Priya's colour-disabling environment variable set
   - a run with the one-off colour switch instead
   Nothing in this file may be hand-written.

4. **`README.md`** — how the output differs between the two situations, and what each exit code
   means.
