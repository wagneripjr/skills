# Host runtime: Claude Code and Codex

Both skills run the same way on either host. Only how they are invoked and how they ask questions differ.

Resolve bundled paths from the installed `SKILL.md`, never from the project's working directory. `<skill-dir>` is the directory that holds a skill's `SKILL.md`, and `<plugin-root>` is two levels above it. Quote every path. Paths inside the project under analysis stay relative to that project's root.

| Capability | Claude Code | Codex |
|---|---|---|
| Invocation | `/farley-score`, `/farley-score-coach` | `$farley-score:farley-score`, `$farley-score:farley-score-coach` |
| Menus and questions | `AskUserQuestion`, with the labels the skill gives | The available question tool; otherwise ask in the conversation and wait for the answer |
| Hand-off to the other skill | Activate `farley-score:farley-score-coach` (or `farley-score:farley-score`) with the Skill tool | Tell the user to use that skill's Codex invocation from the row above, or continue in the same conversation with that skill's instructions |
| Running the calculator | Bash: `python3 "<skill-dir>/scripts/cli_calculator.py" …` | Terminal execution, same command |
| Optional Jev judge | `uv run "<skill-dir>/scripts/jev_judge.py" <methods.json>` | Terminal execution, same command |
| Installed version | `python3 "<skill-dir>/scripts/cli_calculator.py" --version` | same |

If `python3` is missing, stop and say so. Never compute the Farley Index in prose instead: a score produced that way is a guess dressed up as a measurement.
