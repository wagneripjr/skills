# Contributing

Thanks for taking a look. This repo is a **marketplace** holding nine plugins, so most
contributions are Markdown — a new skill, or a fix to an existing one.

`CLAUDE.md` is the architecture reference: plugin conventions, the full hook table, and the
reasoning behind the doc-this pipeline. This file covers only the mechanics you cannot infer from
reading the tree.

## Prerequisites

| Tool | Needed for |
|---|---|
| **Node ≥ 18** | The doc-this hooks are `node` invocations, and the test runner is Node. Without it the hooks fail open — they become silent no-ops rather than errors. |
| **`jq`** | Not needed here — every harness is Node. The doc-this agents call it while analyzing a *target* project (`brew install jq` / `apt install jq`). |

Editing a skill needs nothing but a text editor.

```bash
git clone https://github.com/wagneripjr/skills
cd skills
node tests/run-all.mjs
```

## Which tree does your change belong in?

Every plugin is a root under `plugins/`, in the layout Tessl documents for a repository holding
more than one:

```
plugins/<name>/
├─ .tessl-plugin/plugin.json     # Tessl registry manifest
├─ .claude-plugin/plugin.json    # Claude Code manifest
├─ skills/<name>/SKILL.md
├─ evals/                        # scenarios, when the skill has them
└─ .tesslignore
```

Eight are one skill each. `plugins/doc-this/` is the exception and bundles 14, because they share
nine enforcement gates and a common `hooks/lib/` that has no per-skill home.

New scripts are **zero-dependency `.mjs`** (`node:fs`, `node:path`, `node:os`, `node:url`,
`node:child_process`). The tree is shell-free — do not add any.

## Version bumping — read this before opening a PR

Plugins are version-keyed in the plugin cache. **A change that does not bump a version ships
nothing**: `claude plugin update` compares against the marketplace entry and silently no-ops. There
is no hook automation — every field is edited by hand.

| Commit prefix | Bump |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` / `BREAKING CHANGE:` | major |
| `docs:`, `chore:`, `ci:`, `test:` | none |

A change to one plugin touches three fields, all carrying the **same** number:

- `plugins/<name>/.claude-plugin/plugin.json` → `.version`
- `plugins/<name>/.tessl-plugin/plugin.json` → `.version`
- `.claude-plugin/marketplace.json` → that plugin's `.plugins[*].version`

`tests/test-tessl-publish.mjs` fails the build if the two manifests drift, and
`scripts/tessl-publish.mjs` refuses to publish a plugin whose twins disagree.

Never let `marketplace.json` fall behind `plugin.json`. The marketplace entry is what the client
compares against; if it advertises a lower version the update is a permanent no-op.

Publishing to Tessl happens automatically on push to `master` and needs a maintainer secret, so
**a PR is never blocked on it** — `node tests/run-all.mjs` is the bar for contributors.

## Writing a skill

1. `plugins/<plugin>/skills/<name>/SKILL.md` with YAML frontmatter: `name` (must equal the
   directory name), `description`, `license`. A new standalone skill is a new plugin root, with
   the two manifests and a `.tesslignore` beside them.
2. **Description**: third person, listing every trigger condition explicitly. **Hard limit 1024
   characters** — past it, review tooling aborts before it evaluates anything.
3. **Body**: imperative ("Log to…", not "You should log to…"), 1,500–2,000 words. Push detail into
   `references/` rather than inlining it.
4. Explain *why* an instruction matters, not just what to do.
5. Heavy reference material goes in `references/`, executables in `scripts/`.

Two conventions that surprise people:

- **Do not add a `commands/<name>.md` wrapper.** A skill auto-exposes at the bare `/<name>` slot.
  Adding a same-named command file suppresses that slot entirely, leaving only
  `/<plugin>:<name>` — the wrapper makes the skill *less* reachable. No plugin here ships a
  `commands/` directory.
- **Dispatching between skills uses the fully namespaced name**, prefixed by the *plugin*. For a
  solo plugin the two are the same word: `postmortem:postmortem`, `okf-maintain:okf-maintain`,
  and `doc-this:<name>` inside the pipeline. Bare short names do not resolve.

## Tests

```bash
node tests/run-all.mjs                    # every suite; the one command CI runs
node tests/test-publication-safety.mjs    # repo-wide scan for credential-shaped material
```

A suite that cannot run its prerequisites exits **77**, and the runner reports INCOMPLETE with a
non-zero status. That is deliberate: a suite that asserted nothing is not a pass.

If you add a check that asserts the *absence* of something, prove it in both directions — it must
flag a planted canary and must not flag benign text. An absence check that silently reads nothing
reports success. `tests/test-publication-safety.mjs` shows the pattern.

## Skill quality review and evals (optional)

Skills can be scored with `tessl review run quality`, and measured against eval scenarios with
`tessl eval run`. Both are entirely optional — no PR is blocked on a score and you never need an
account to contribute.

> **A review uploads the whole skill directory to a hosted third-party service** — `SKILL.md`
> plus `references/`, `scripts/` and `assets/`. Never run it on anything confidential.

A review needs a login and a workspace name (`--workspace`, or `$TESSL_WORKSPACE`); the harness
skips rather than guessing one. Writing an eval scenario under `plugins/<name>/evals/` and
checking it with `tessl eval lint ./plugins/<name>` or `node tests/test-eval-scenarios.mjs` is
free and needs no account — contributing one is welcome. *Running* an eval costs credits and is a
maintainer step.

See README for usage.

## Pull requests

- Branch from `master`, one logical change per PR.
- Conventional-commit prefix on the title (it determines the version bump).
- Say which suites you ran. CI runs them too, but a PR that never ran them locally usually shows.

## Security

Do not open a public issue for anything exploitable — see [SECURITY.md](SECURITY.md) for the
reporting address.
