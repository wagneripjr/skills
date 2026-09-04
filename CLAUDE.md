# Wagner Skills

Repo hosting **two** Claude Code plugins published from one marketplace (`wagner-skills-marketplace`):

| Plugin | Root | Contents | Default state |
|---|---|---|---|
| `wagner-skills` | `./` | 8 engineering skills — CLI design (agent + human), Airflow 3, Kubernetes SRE, requirements elicitation, prototype-spike, postmortem, OKF documentation maintenance. One hook: OKF index regeneration on edit. | enabled |
| `doc-this` | `./doc-this` | The 14-skill reverse-engineering Discovery pipeline + its 9 enforcement gates + `/doc-this-promote`. | **disabled** (FR-DOC-PLUGIN-1) |

`doc-this` is split out because it is only needed while reverse-engineering a legacy codebase, and
riding inside `wagner-skills` charged every session ~3.4k tokens of skill descriptions plus 5 node
hook spawns per `Skill` call and 2 per `Edit`/`Write`. Enable it for a discovery run:

```bash
claude plugin enable  doc-this@wagner-skills-marketplace
claude plugin disable doc-this@wagner-skills-marketplace
```

Neither `skillOverrides` nor `disable-model-invocation` can achieve this — see
*Description classes* below.

## About the `FR-` / `BUG-` / `ERR-` identifiers in this file

They are **stable labels, not links.** This repository was published from a squashed seed commit,
so the requirement and bug documents those IDs were minted against are not in its history and no
`docs/` tree here resolves them. They are kept because they are the shared vocabulary the code
already uses — `BUG-003` names the Total Source Coverage rule enforced by
`doc-this-coverage-gate.mjs`, `BUG-004` names the per-module artifact rule, `BUG-005` names the
describe-only gate's staging-only scope, and `FR-PROTO-1` / `FR-BUNDLE-3` name the acceptance
matrices in `tests/`. Read each one as the name of a rule, and find the rule's actual definition
in the hook or harness cited beside it.

**A new identifier is minted here, not in a `docs/` tree.** There is no requirements bundle in this
repository and adding one for a single rule would create a second place to look, contradicting the
convention above. The rule statement goes in this file; the enforceable definition goes in the
harness, which is the artifact that can actually be wrong.

### FR-OKF-3 · A document is indexed because it exists

Owned by `skills/okf-maintain`. Four parts, each named by an acceptance test:

1. **A declared `profile:` in `docs/okf.yaml` is reported, never a refusal.** The refusal it
   replaces was justified by a generator the profile would ship and a byte-exact index-sync gate it
   would pair with — neither ever verified by the tool, and a guard whose condition nothing can
   satisfy is a defect wearing a guard's clothes. Its effect was inverted: the repositories that
   declared a profile were the ones guaranteed to have no index. `tests/test-okf-maintain.mjs` AC-15.
2. **Every tracked markdown file gets a row**, readmes and files with no frontmatter included. The
   title degrades — frontmatter `title`, first body `# ` heading, filename stem — so listing imposes
   nothing. AC-29, AC-30.
3. **Enforcement scope does not move.** `isConcept` keeps its name, its bytes and its job of deciding
   which documents must carry required keys; only *indexing* stopped consulting it, via the separate
   `isListable`. AC-29's canary pins that a concept document with no `type` still fails `check`.
4. **`okf.mjs coverage`**, anchored to `git ls-files --cached --others --exclude-standard` from the
   repository root — the flags are part of the contract, because plain `--cached` enumerates the git
   *index* and is therefore blind to the document being added right now, going green on exactly the
   commit that introduces an unindexed one (AC-34's canary). `check` and
   regenerate-and-diff both read the corpus through the same walk, so a document the walk never
   reaches is absent from both and compares equal — a projection checked against itself cannot
   report a missing input. `tests/test-okf-coverage.mjs`, whose AC-32 is the negative control: a
   document the walk genuinely cannot reach, on a tree `check` calls clean and regeneration
   reproduces byte-for-byte.

5. **The walk stops at another repository's working tree** — a directory holding a `.git` entry,
   whether a submodule (a `.git` *file* with a gitdir pointer) or a nested clone. Writing there
   edits a repository the caller only pins by SHA, it is indistinguishable in the output from the
   caller's own files, and `coverage` can never catch it because git reports a submodule as one
   gitlink. That combination is why the refusal is structural rather than an `.okfignore` line
   nobody can add before the first run does the damage. Reported as `separate-repo:`.
   `tests/test-okf-maintain.mjs` AC-39, `tests/test-okf-coverage.mjs` AC-37/AC-38.
6. **An `index.md` carrying no generation marker is never overwritten.** A dialect's rows can hold
   an id, a status or a shape v0.2 does not project, so regenerating over one is a silent lossy
   downgrade of the catalog the index exists to be. Removing the profile refusal (part 1) took this
   protection with it; the replacement turns on evidence in the file, which also covers a
   hand-written index in a repo with no manifest — something the old refusal never did. Reported as
   `foreign-index:`; resolve by deleting the file or naming it in `.okfignore`. AC-40.

The generator and the checker disagree in exactly one place, on purpose: the walk does not descend
into dot-directories, while `git` lists a tracked document inside one. Coverage therefore reports a
finding `index` can never clear, so it prints the two real remedies beside it — move the document
out, or name the path in `.okfignore` — and names the trap, hand-writing the missing `index.md`,
which sits outside the walk and so is never regenerated. AC-32 pins the advice; AC-35 pins that it
stays absent for a path the walk reaches fine.

Found by the new check on its first run against this repo, and fixed with it: a title containing
`[...]` (`Gap analysis: [Feature Name]`) was emitted raw, producing a row `ENTRY_RE` cannot parse —
so the round-trip description store dropped it and coverage read the document as indexed by nobody.
Titles are now escaped on the way out and unescaped on the way back in. AC-30.

### FR-OKF-4 · A plugin's payload directories are the loader's, not OKF's

Owned by `skills/okf-maintain`. At a **Claude Code plugin root** — a directory holding
`plugin.json` or `marketplace.json`, either at the package root or under `.claude-plugin/`, both
of which the loader accepts — the `commands/`, `agents/` and `skills/`
children are enumerated by Claude Code, not by OKF: every `.md` under `commands/` *is* a slash
command, every `.md` under `agents/` *is* an agent definition, and a skill folder's entry point is
`SKILL.md`, carrying the loader's frontmatter schema. `okf.mjs` prunes them from the walk, from
`check` and from `coverage`, reporting each as `plugin-payload: <path>/`.

Two halves of one defect, both real in this repository before the fix. The visible half was 43
generated `index.md` files stamped into payload directories — a document where the loader expects
payload, inert today only because a frontmatter-less file happens not to register, which nothing
guarantees. The larger half was `okf.mjs check .` returning **100 violations, all 100 of them
payload**: 22 `SKILL.md` files "missing required key 'type'" and 78 `reference/` files with "no
YAML frontmatter block". Satisfying either would put foreign keys in a loader-parsed file, or make
a progressively-disclosed reference pay context for keys nobody reads — so the checker was
permanently, unfixably red, and therefore never run.

Refused **structurally**, not via `.okfignore`, on the same argument as the separate-repo boundary
above: the line can only be written after the first run has already done the damage. Anchored on
the **manifest, never the directory name** — a `docs/commands/` folder documenting a CLI is
ordinary knowledge and stays indexed; removing the manifest brings every finding straight back,
which is what the acceptance tests use as their canary. **Probe both manifest locations**: an
installed plugin under `~/.claude/plugins/cache/` carries `plugin.json` at its package root with no
`.claude-plugin/` directory at all, and a marketplace entry pointing at such a directory loads its
commands and skills normally. 6.4.3 recognised only the nested form, which was stricter than the
loader it models and let payload straight back in — reported from claude-code-config, fixed in
6.4.4. `tests/test-okf-maintain.mjs` AC-41 (index
and check), `tests/test-okf-coverage.mjs` AC-42 (the two enumerators must agree, or payload becomes
permanent unindexed findings — the deliberate dot-directory disagreement must not gain a second).

Consequence for this repository, and it is the honest one: `check` now evaluates **zero** concept
documents and exits 77. Its markdown is entirely plugin payload plus project meta; there is no
documentation bundle here, which is what the `FR-`/`BUG-` note above already says. The root
`index.md` lists the seven project-meta files and no subdirectories.

### FR-OKF-5 · An index nothing links to may not vouch for a document

Owned by `skills/okf-maintain`. `okf.mjs index` writes but never deletes, so anything that narrows
what gets indexed — a new `.okfignore` line, FR-OKF-4's payload pruning, the last document leaving a
folder — strands the `index.md` it stops maintaining on disk with its rows intact. `coverage` used
to union the rows of **every** `index.md` it could find, which credits a document that nothing a
reader can follow leads to: a fail-open, and the quietest kind, because an orphan is not an
unreached document but a reached *nothing* — the totals read identically before and after the
debris is removed. Found only by diffing the generated file list across two versions of the tool,
reported from claude-code-config after FR-OKF-4 stranded eight index files there.

`coverage` now credits only indexes the root index reaches through the chain of Subdirectories
links the format is built on, and names generated strays as `orphan-index:`, exit 1. The
generation marker gates the naming — the same evidence `ownsIndex` uses before overwriting — so a
hand-written stray is never called this tool's debris, though its rows do not count either. With no
root index at all every index is trusted, because a larger finding is already in flight and piling
a second report on it helps nobody. `tests/test-okf-coverage.mjs` AC-43: canary a broken chain,
controls that repairing it clears both findings together and that an unmarked stray is not named.
Mutation-tested — removing the reachability gate flips the canary.

Deliberately **not** done: `index` does not delete the debris it left. Naming it with the remedy is
the smaller correct thing, and a generator that removes files it no longer claims is a much larger
promise than one that refuses to write where it does not belong.

### FR-OKF-6 · An index is regenerated when a document under it changes

Owned by `skills/okf-maintain`, and the first hook surface in this plugin. Four parts, each named by
an acceptance test:

1. **`okf.mjs` is importable.** Its tail was a bare `process.exit(main(…))`, which runs the CLI — and
   terminates the host process — the instant anything imports the file, so the generator could not be
   reused by a client of it. Guarded with `import.meta.url === pathToFileURL(process.argv[1]).href`;
   `cmdIndex`, `parseBlock`, `readDoc`, `declaredProfile`, `readIgnores`, `ignoredFile` and
   `declaredOkfVersion` are exported. Exit codes and `--version` unchanged.
   `tests/test-okf-maintain.mjs` AC-45, asserted from a separate process because an import that exits
   takes the harness with it.
2. **The hook** — `hooks/okf-index-regen.mjs`, PostToolUse `Write|Edit`, importing the core by
   relative path and spawning only `git` (ADR-014). **The root comes from the edited file**, via
   `git -C <its dir> rev-parse --show-toplevel` with the file required to be inside the answer, never
   from the session cwd: a cwd default rewrites the session repository's indexes for an edit aimed
   into a linked worktree or a submodule, leaving the edited tree stale with no error either side.
   git answers a realpath, so the containment test resolves symlinks first — on macOS `/var` versus
   `/private/var` is otherwise enough to read a file inside the repository as outside it.
   Refusals, all before any write: not markdown; no `okf.yaml` (adoption is the opt-in); the edit is
   itself an `index.md`; the path is in `.okfignore`; the index carries no generation marker; the
   repository declares a **newer** `okf_version` than this generator writes — the marker is
   versionless, so an older installed plugin would otherwise downgrade a richer catalog silently.
   Never gated on `check`: a repository can carry frontmatter violations and still owe its readers an
   accurate index. Writes only bytes that differ, and fails open — every path exits 0, because a hook
   that can block an edit trades a stale index for a stuck session.
   `tests/test-okf-index-regen.mjs` AC-47..AC-54.
3. **A fixture corpus** at `tests/fixtures/okf-frontmatter/`, one expected-parse JSON per document,
   with an expectation recorded **per consumer** — `agentic-sdlc` vendors the same files and its
   lenient reader disagrees with this strict one on malformed input **by design** (its `extractBlock`
   consumes to end of file on a missing closing delimiter, fail-open; `readDoc` here reports
   `unterminated YAML frontmatter block`, because `check` is its job). Neither is made to converge.
   Every expectation is hand-written: one generated from the implementation is the
   projection-checked-against-itself fail-open in a new costume. AC-46, which also pins the
   `profile:` spellings `declaredProfile` accepts and the near-misses it must not.
4. **`coverage` names a `dangling-row`** — a row in a *tracked* index pointing at a document git is
   not tracking. `index` reads the working tree on purpose, which is what lets the hook index a
   document on the edit that created it; `git commit -a` then carries the modified index and leaves
   the document behind, producing a commit that is self-consistent and wrong. Every other enumerator
   here reads the working tree, where both files are present, so nothing else can see it. Scoped to
   tracked indexes because an untracked one is not going into that commit either.
   `tests/test-okf-coverage.mjs` AC-44.

All four guards are mutation-tested: reverting the root resolution to cwd, dropping the version-skew
refusal, unscoping the dangling-row check, removing the byte-diff write, and removing the import
guard each flip at least one canary.

### FR-TESSL-1 · A skill's score is read, never guessed; a scenario is counted, never assumed

Owned by `tests/lib/tessl.mjs` and the two harnesses beside it. Four parts, each named by an
acceptance test:

1. **Tessl Review replaces `tessl skill review`.** The deprecated command reviewed a single
   `SKILL.md` in one pass; `tessl review run quality` runs an agent over the whole bundle. The
   harness's `remote` mode, its `TESSL_REPO` variable and its origin-URL rewriting existed *only*
   because the old local review could not see `references/` — all three are deleted, not ported.
   A workspace is now required and has **no default**: `--workspace`, then `$TESSL_WORKSPACE`,
   then SKIP 77. Hardcoding one would put an account name in a public repository.
2. **A score is a finite number in 0..100, and 0 is one of them.** Three commands return three
   different envelopes (`review.reviewScore`, `attributes.score`, `data[].attributes.score`), so
   `reviewScoreFrom` reads whichever is present rather than guessing one. The string `"93"` is not
   a score; neither is `null`, `NaN` or `105`. `tests/test-tessl-score-parse.mjs` AC-3 pins that
   `reviewScore: 0` returns `0` — the defect an `if (!score)` refactor introduces — and AC-7
   mutation-checks AC-3 by running the truthy variant beside the real one. The fixtures are **real**
   0.105.0 envelopes with ids replaced and judge prose elided: one generated from the
   implementation would be the projection-checked-against-itself fail-open in a new costume.
3. **The free preflight comes before the paid call.** `tessl review list --limit 1` proves auth and
   workspace resolution at zero credits. Without it, the first thing a logged-out run discovers is a
   review it has already submitted. `--threshold 0` is passed on purpose so tessl's own gating is
   off and a validation *warning* can never arrive as a non-zero exit to be misread as
   "below floor".
4. **`tessl eval lint` fails open, so it may not be the only check.** Its own help states that a
   directory without `task.md` is "silently skipped and recursed into"; verified, a folder holding
   only `criteria.json` lints `✔ 0 scenarios valid`, exit 0. A renamed brief therefore deletes a
   scenario from every future run while every signal stays green — the same shape as the
   projection-checked-against-itself defect FR-OKF-3 fixed, in someone else's tool.
   `tests/test-eval-scenarios.mjs` pairs the two files (AC-1), compares its own walk against
   lint's count (AC-5), and **reproduces the fail-open as a canary** (AC-6b) so a future
   simplification cannot quietly remove the guard without also removing its proof.

Both harnesses run in `tests/run-all.mjs` and are green on a bare clone with **no tessl installed
at all** — `resolveTessl({ allowNpx: false })` refuses the registry fallback in the default suite,
because npx would turn a local structural check into a network call on a cold CI machine. Only
`test-tessl-quality-gate.mjs` stays excluded, and only because it cannot assert anything without an
account.

Deliberately **not** done: no `.tessl-plugin/plugin.json` anywhere. Tessl's documented layout is
plugin-rooted, and `--context <path>` reaches the same result without a fifth hand-synced semver.

### BUG-006 · A published example may not borrow authority from what the reader cannot see

Two rules, both found by a confidentiality audit of the public tree and both about the same mistake
— an example that is more convincing than it is entitled to be, because part of what makes it
convincing sits outside the repository.

1. **A shipped skill may not assert that tooling exists which this repo does not ship.**
   `doc-this-design-system`'s description ended with `NOT for design generation (use frontend-design
   plugin)`. `frontend-design` appears in none of the three manifests — it is a plugin in the
   author's environment. A stranger's agent reads the clause as a fact and routes into tooling it
   cannot run, so the claim is not merely unverifiable, it is *steering*. The disambiguation was
   kept and the plugin name dropped. Applies to every shipped surface: skill descriptions and
   bodies, hooks, README, SECURITY, CONTRIBUTING. Maintainer meta (`CLAUDE.md`, `AGENTS.md`) may
   name private tooling; it is not addressed to strangers.

2. **A worked example may not carry unlabelled counts from a real engagement.** Four passages
   narrated an actual `/doc-this` run as observation, each quoting an exact file count beside the
   named technology stack it ran against. Any one of them is a defensible anecdote; together the
   stack-and-scale pair is a fingerprint, and it sat beside a *fictional* example on the identical
   stack, which invites the inference that the fiction was abstracted from the fact. The counts
   became orders of magnitude. The pedagogy is untouched — `N scripts means N reads` teaches what an
   exact number taught. The stack detail stays where the routing rule is genuinely stack-specific:
   it is the *combination* that fingerprints, so removing one side breaks it.

   **This clause is itself bound by the rule.** The audit that produced it restated the counts here
   on the first draft, which republished the fingerprint in a tracked file — the remediation
   becoming the next disclosure. A rule about a leak names the *shape* of what leaked, never the
   values. If you need the specifics to re-verify, read them out of `git log -p` for this commit,
   not out of this file.

The matching hygiene rule for fiction: **every** file carrying a shared invented example states that
it is invented. `prototype-spike` had the label in three of six files; the densest instance,
`evals/evals.json`, was the one missing it, and was also the only file siting the app under a
`~/dev/<client>/` path — so a reader could not tell a placeholder from a redaction. An unlabelled
sanitized example is not a leak, but it guarantees every future audit re-litigates it.

Re-running the audit sweeps: use `$(git rev-list --all)` **inline**, never a `$VAR` — zsh does not
word-split an unquoted variable, so `git grep <pat> $REVS` passes one bogus rev, finds nothing, and
reports clean. Pair every sweep with a control term that must match.

## Repository Structure

```
.claude-plugin/          # Plugin manifest and marketplace config
doc-this/                # SECOND PLUGIN — the doc-this reverse-engineering suite (FR-DOC-PLUGIN-1)
  .claude-plugin/        # Its own plugin.json; the plugin name IS the Skill-tool prefix
  hooks/                 # All 9 doc-this gates + hooks.json + lib/ + run-all.mjs + gate harnesses
  skills/                # The 14 doc-this* skills:
    doc-this/              # Discovery orchestrator — reverse-engineer legacy codebase into ATDD-ready specs
      SKILL.md             # Orchestrator
      references/          # describe-only pact, state-schema, checkpoint-guide, step-01..06 (first run, resume, specs-org, db-context, incremental, coverage backfill)
    doc-this-scout/        # Surface mapping (folders, languages, frameworks, entry points) + deterministic file-manifest.json
    doc-this-code-analyst/ # Per-module deep code analysis (control flow, algorithms, data structures)
    doc-this-detective/    # Implicit business rules + retroactive ADRs + public/private API classification
      references/          # api-classification-heuristics
    doc-this-architect/    # C4 diagrams, ERD, unified external-surface.json catalog (with kind:database entries)
      references/          # external-surface-schema
    doc-this-writer/       # Folder-per-unit ATDD-ready specs (requirements/design/tasks per public surface)
      references/          # requirements-template, design-template, tasks-template, scenario-extraction-guide
    doc-this-reviewer/     # Validates ATDD discipline: cross-layer coverage, transitive private coverage, DB coverage
      references/          # review-checklist
    doc-this-promote/      # Single SDLC bridge — stages .doc-this-sdd/ into docs/ + .feature spec runners, OKF-conformant (frontmatter, generated indexes/traceability)
      references/          # id-assignment, traceability-row-template, feature-stub-template, atdd-scaffolding-guide, okf-conformance
                           #   (no scripts/ — index generation is a Skill dispatch to wagner-skills:okf-maintain)
    doc-this-tracer/       # Optional dynamic analysis (logs/traces/error exports) — resolves 🔴 gaps
    doc-this-visor/        # Optional UI extraction from screenshots
    doc-this-data-master/  # Optional database analysis with ownership branching (owned/external/mixed/none)
      references/          # ownership-branching-guide, db-business-logic-extraction (per-engine recipes)
    doc-this-design-system/ # Optional design-token extraction (CSS/Tailwind/MUI/Chakra/styled-components)
    doc-this-help/         # Analogy-driven guide to all 12 doc-this agents
    doc-this-viewer/       # Optional user-triggered browser viewer for doc-this output (NOT a pipeline worker)
      app/                 # Svelte+Vite SOURCE (committed for maintenance)
      assets/dist/         # PREBUILT static SPA served at runtime (no npm install for the user)
      scripts/             # build-manifest.mjs, serve.mjs + launch.mjs (localhost server), build.mjs, test harness (all zero-dep Node)
      references/          # manifest-schema.md (viewer-manifest.json contract)
hooks/                   # The wagner-skills plugin's hooks (auto-loaded via hooks/hooks.json)
  okf-index-regen.mjs    # PostToolUse Write|Edit — regenerates an adopted bundle's index.md files
                         #   from the EDITED file's repository; refuses on version skew, foreign
                         #   indexes, unadopted repos, .okfignore hits (FR-OKF-6)
tests/                   # Repo-level harnesses owned by neither plugin
  run-all.mjs            # THE runner — every suite in the repo; 77 = INCOMPLETE, never a pass.
                         #   Excludes test-tessl-quality-gate.mjs (77 without auth = permanent red).
                         #   test-tessl-score-parse.mjs and test-eval-scenarios.mjs are NOT
                         #   excluded — both are green on a bare clone with no tessl at all
  test-publication-safety.mjs  # repo-wide credential scan; structural rules + canaries both ways
  test-fr-bundle-3.mjs    # tree/closure AC matrix — the expected skill dirs of each plugin
  test-fr-proto-1.mjs     # prototype-spike AC matrix (AC-7 is the secret-shaped-token scan)
  test-okf-maintain.mjs   # okf.mjs index/check/wire AC matrix (AC-17 pins the entry block byte-exact)
  test-okf-coverage.mjs   # okf.mjs coverage AC matrix (FR-OKF-3) — git is a hard prerequisite,
                         #   so it owns its own 77 instead of dragging the other suite down
  test-okf-index-regen.mjs # the regeneration hook's AC matrix (FR-OKF-6) — AC-48 is the canary
                         #   that the root comes from the edited file, not the session cwd
  fixtures/okf-frontmatter/ # the frontmatter contract corpus: one document plus a hand-written
                         #   expected-parse JSON per case, an expectation PER CONSUMER, and the
                         #   profile: spellings declaredProfile accepts (FR-OKF-6)
  test-no-shell-invocation.mjs  # the viewer launcher opens a URL on darwin/linux/win32 without
                         #   a shell, plus a repo-wide scan: no .mjs reaches one
  lib/tessl.mjs           # reviewScoreFrom / reviewIdFrom / resolveTessl / workspaceFrom — the
                         #   parsing and resolution rules the tessl harnesses share
  test-tessl-score-parse.mjs # those rules, asserted with no account and no credits. AC-3 pins
                         #   that reviewScore 0 is a score; AC-7 mutation-checks it
  test-eval-scenarios.mjs # eval scenario shape + AC-6b, which REPRODUCES `tessl eval lint`'s
                         #   fail-open (a dir without task.md lints green) so the guard can't be lost
  fixtures/tessl/         # real 0.105.0 review envelopes, ids replaced, judge prose elided
  test-tessl-quality-gate.mjs
.github/                 # CI (test.yml: ubuntu + macOS, both blocking) + templates
CONTRIBUTING.md          # Contributor entry point: prereqs, version-bump rules, skill conventions
LICENSE                  # MIT — matches the "license" field in both plugin.json files
THIRD-PARTY-NOTICES.md   # MIT notices for Svelte + marked (compiled into the viewer's dist bundle)
README.md                # Public entry point: install, the two-plugin split, skill tables
SECURITY.md              # Reporting address + what the hooks and skills do locally vs off-machine
skills/                  # One folder per skill — the 8 wagner-skills members
  airflow-dags/          # Apache Airflow 3 DAG authoring with 12 reference docs
    SKILL.md             # Main skill file
    reference/           # Deep-dive docs (authoring, scheduling, testing, etc.)
  agent-cli/             # Build and evaluate CLIs for AI agent consumption
    SKILL.md             # Main skill file
    reference/           # Command design, output design, input security, discoverability, composability, agent knowledge, scoring rubric, framework patterns
  human-cli/             # Design and evaluate CLIs for human users
    SKILL.md             # Main skill file
    reference/           # Command ergonomics, visual output, interactive input, help docs, performance, polish, human scoring rubric, framework UX patterns
  platform-sre-kubernetes/  # SRE-focused Kubernetes production deployments and manifest review
    SKILL.md             # Main skill file
  requirements-elicitation/ # Analyze PRDs/specs for gaps, generate clarifying questions, assess risk
    SKILL.md             # Main skill file
    references/          # Elicitation framework and question templates
  prototype-spike/       # Requirement prototypes that double as design spikes — one self-contained HTML file, high-fidelity rebuild from the app's own source, controls = the open questions (FR-PROTO-1)
    SKILL.md             # Thesis + 3 fidelity axes (UI/token/data) + ANCHOR->HARVEST->FRAME->BUILD->DRIVE->CLOSE + 13 hard rules
    references/          # anatomy, ui-fidelity, harvest-playbook, control-derivation, fidelity-tiers, verification, exemplar walkthrough
    evals/               # evals.json — 2 prompts x 19 assertions (with-skill 18/19 vs no-skill 7/19).
                         #   LEGACY format, not convertible: every assertion cites source facts of a
                         #   fictional app, so a runnable tessl scenario would need that app built
  okf-maintain/          # Adopt and maintain an Open Knowledge Format v0.2 doc bundle — frontmatter, chained
                         #   root indexes, no log.md / no in-doc history (git owns it), agent-entry wiring (FR-OKF-1)
    SKILL.md             # Profile-manifest reading + the two workflows (adopt / maintain)
    references/          # frontmatter (field families, actors, trust tiers), index-format (frozen grammar), adoption
    scripts/             # okf.mjs — zero-dep Node (runs on node/bun/deno), importable core plus a
                         #   guarded CLI; `index` (generate, every
                         #   tracked .md listed, minus plugin payload) / `check` (§11, fail-closed
                         #   frontmatter reader, no YAML lib) / `coverage` (git ls-files vs the
                         #   indexes, crediting only ones the root index reaches — FR-OKF-5) /
                         #   `wire` (entry blocks). Rows pointing at a document git will not
                         #   commit are named dangling-row (FR-OKF-6). A declared profile is reported, never a
                         #   refusal (FR-OKF-3); commands//agents//skills/ at a plugin root
                         #   belong to Claude Code and are pruned (FR-OKF-4)
  postmortem/            # Production-incident postmortems — numbered spine, machine-readable frontmatter
    SKILL.md             # Machine contract (frontmatter severity, finding-id stability) + per-section discipline + evidence rules
    references/          # full-template (long form), quick + Investigation variants
```

## Doc-This Discovery Pipeline

12 skills that reverse-engineer a legacy codebase into ATDD-ready, traceable specs. Pipeline:

```
Scout → Code Analyst → Detective → Architect → Writer → Reviewer
                                                              ↓
                                                       doc-this-promote
                                                              ↓
                                                          docs/ tree
```

Optional independent agents (run anytime in the pipeline): Tracer, Visor, Data Master, Design System.

**Reading the output (`doc-this-viewer`)**: an optional, user-triggered companion (`/doc-this-viewer`) serves a prebuilt Svelte SPA over a localhost-only zero-dep Node static server (`serve.mjs`) so a human can browse the generated specs — grouped sidebar, rendered Markdown with Mermaid + 🟢/🔴 badges, an interactive Surface Catalog built from `external-surface.json`, and a coverage dashboard. It navigates BOTH the rich `.doc-this-sdd/` staging tree and the promoted `docs/` tree (source switcher when both exist). It is **not** a pipeline worker — it runs against already-generated output, needs no live state, and is deliberately absent from `hooks/doc-this-dispatch-gate.mjs`'s worker list. Runtime files are written only to `.doc-this/viewer/` (inside doc-this's write boundary); the frozen launcher `scripts/launch.mjs` binds `127.0.0.1` only and runs no git/IaC/deploy commands, so it is safe to run inside a client repository.

**Key design choices**:
- **Describe-only pact** — the canonical policy at `skills/doc-this/references/describe-only-pact.md` mandates that every Discovery agent documents what exists and never proposes, judges, or invents. No technical-debt registers, no fabricated ADR Alternatives/Consequences, no NFR inference from middleware/timeout patterns, no bug labels. The pact is multilingual: rules apply by **meaning** across whatever language `doc_language` selected (en, pt-BR, or other) — mechanical enforcement is best-effort en + pt-BR; semantic enforcement is the real gate.
- All orchestration prompts in English; spec output language follows `doc_language` (English and pt-BR are the exercised paths)
- Output staged in `.doc-this-sdd/` (hidden + auto-gitignored on first run, beside the `.doc-this/` state dir) so a normal coding session never mistakes unpromoted specs for real docs — agents are non-destructive
- `doc-this-promote` is the ONLY skill that writes to `docs/` — one bridge into the SDLC tree, so Discovery output can never be confused with hand-authored requirements
- **Promoted output is born OKF-conformant** (FR-DOC-OKF-1) — promote stamps frontmatter (`id`/`type`/`status: Documented`/`description` + `adrs`/`specs` relation keys; `Done` is reserved for observed-GREEN acceptance runs — reverse-engineered specs describe behavior, they do not verify it), silently bootstraps `docs/okf.yaml` in legacy repos (never with `traceability: generated`), regenerates per-folder/root `index.md` by dispatching `wagner-skills:okf-maintain` — the skill that owns the OKF index grammar and ships the generator — appends curated TRACEABILITY rows, and suggests `docs(FR-NNN)` commits
- Public/private API classification (Detective) — only public APIs get `@api` ATDD scenarios; private APIs covered transitively via `@browser`/`@cli`
- Database ownership branching (Data Master) — `owned` / `external` / `mixed` / `none` flows through every downstream agent; `external`/`mixed` produces `@database` scenarios with `IDatabaseContractDriver` interfaces
- Schema-versioning gate (Reviewer) — refuses coverage completion when schema is unversioned and no baseline DDL exists
- **Binary confidence** on every claim: 🟢 CONFIRMED (with citation) / 🔴 GAP (recorded in `questions.md`). 🟡 INFERRED is **retired** — pattern-based guesses do not produce facts; either find direct evidence (🟢) or record a gap (🔴).
- **Total Source Coverage** (BUG-003) — a 🔴 must be *earned by reading*: it records what the repository cannot answer, never what the pipeline did not read. Scout emits a deterministic `file-manifest.json` (every file classified source/vendored/generated/binary; markup IS source); the Code Analyst routes every source file by subclass (markup/SQL/other = full Read; LSP only accelerates code files) and appends to an append-only `coverage-ledger.json` with a file-level resume cursor; the Architect emits `kind:ui` entries one-per-page; the Writer's `code-spec-matrix.md` is manifest-driven; the Reviewer hard-REJECTs ledger/manifest mismatches, sampling phrases, grouped UI entries, and spot-checks gaps for answers sitting in unread files. `doc-this-coverage-gate.mjs` enforces it mechanically at phase transitions; `--backfill-coverage` migrates legacy runs. Token pressure is absorbed by checkpoint-and-resume, never by skipping. On large codebases the Code Analyst may also, with explicit user consent, fan out the reading to ≤3 `model: sonnet` reader subagents (FR-DOC-FANOUT-1) — it stays the merger and single ledger-writer while readers only transcribe to staging under `.doc-this-sdd/.analyst-staging/`; the shared protocol lives in `skills/doc-this/references/sonnet-reader-fanout.md` and is reused by `--backfill-coverage` (zero hook changes — readers are Agent dispatches the dispatch gate ignores, and the describe-only gate fires on their staging writes).
- **Evidence provenance + fossil-evidence path** (FR-DOC-FOSSIL-1) — every 🟢 scenario carries an `Evidence:` line (`static` from the Writer; the Tracer's corroboration sweep upgrades telemetry-matched scenarios to `static + runtime (<artifact cite>)`); the Reviewer validates the format and reports per-unit corroboration rates in `confidence-report.md`; promote carries the line into `.feature` stubs as `# Evidence:` comments. Confidence stays binary — Evidence is provenance metadata on facts, never a third color. `state.json.legacy_runnable` (`yes`/`prod-only`/`no`, collected at first run) makes the Tracer **hard-advisory** when the system can't be run live, and the Data Master mines actual data distributions (`database/data-profile.md`) as fossil runtime evidence.
- Mechanical enforcement: the `doc-this-describe-only-gate.mjs` PreToolUse hook on Edit|Write blocks pact violations (🟡, judgment phrases en + pt-BR, fabricated ADR sections, technical-debt headers, NFR-from-pattern phrases) when targeting `.doc-this-sdd/**` — the staging tree only (BUG-005). The promoted `docs/` tree (requirements/adr/bugs) is the shared SDLC namespace co-owned by forward-design work (legitimate `## Consequences`/`## Alternatives`, "should be" requirements, bug reports) and is deliberately NOT policed; promote copies from already-gated staging. Per-artifact escape: `<!-- DOC-THIS-EXEMPT : reason="..." -->`. Per-session: `/tmp/.claude-doc-this-bypass-${CLAUDE_SESSION_ID}`.

**To use**: `/doc-this` in any legacy project. The orchestrator handles first-run handshake (project name, language, doc level, database context) and dispatches the pipeline.

**For an analogy-driven guide to all 12 agents**: `/doc-this-help`.

## Plugin Convention

- **Plugin manifest**: `.claude-plugin/plugin.json` — name, version, author
- **Marketplace**: `.claude-plugin/marketplace.json` — self-referencing for discovery
- **Hooks**: `hooks/hooks.json` — auto-loaded, never reference in plugin.json
- **Skills**: `skills/<name>/SKILL.md` — one SKILL.md per skill folder
- **Commands**: `commands/<name>.md` — slash-command wrappers; auto-discovered, never reference in plugin.json. **Caveat**: in current Claude Code (verified 2026-05-31), if a plugin contains both a skill named `X` and a command named `X`, the bare `/X` slot stops resolving in the slash autocomplete — only the namespaced `/<plugin>:X` works. (The command does NOT take the bare slot; the collision suppresses it entirely.) For pure passthrough wrappers (`Invoke the wagner-skills:X skill via the Skill tool. Pass through $ARGUMENTS`), this means **adding the command file makes the skill LESS reachable, not more**. Skills auto-expose at the bare `/X` path when no same-name command file exists — which is why `commands/doc-this.md` was removed (2026-05-31) so `/doc-this` resolves bare like its command-less siblings — and why `commands/doc-this-promote.md` was removed (2026-08-23) for the same reason, one sweep late. **Neither plugin ships a `commands/` directory now; every slash entry point is a bare skill.** When this rule is applied, sweep *every* passthrough wrapper in the tree, not just the one that was reported.
- **Script paths**: Use `${CLAUDE_PLUGIN_ROOT}` in hooks — resolves to install location

### Commands vs skills

- A **skill** is invoked by Claude (auto-trigger on description match, or via the Skill tool).
- A **slash command** is invoked by the user typing `/<name>`.
- **Empirical behavior (verified 2026-05-10):** Skills auto-expose as bare `/<name>` in the slash autocomplete when no same-name command file exists — examples in this plugin: `/doc-this-scout`, `/doc-this-code-analyst`, `/doc-this-detective`, etc., all reachable bare with `(doc-this)` attribution. Adding a `commands/<name>.md` file forces the skill to namespaced-only `/<plugin>:<name>`. The earlier guidance ("a command file is *required* for `/<name>` to work") was incorrect — keep command files only when they add real logic beyond `Invoke ... Pass through $ARGUMENTS` (e.g., model selection, multi-step bash, references that the skill itself doesn't pull in).
- **When you DO need a command file**: it owns the bare slot. Skills with the same name retreat to the namespaced form. Plan accordingly.
- **Argument passing for bare-slash skills**: skills invoked via the bare `/<name>` slot still receive the rest of the user's input as conversational context — the Skill tool pattern handles it. If a skill needs strict argv-style parsing (`--resume`, `--regenerate=<phase>`), test the bare form with that exact invocation before deleting any wrapper command file that previously declared `argument-hint`.

### When dispatching from one skill to another

Use the **fully namespaced name** with the Skill tool — the prefix is the **plugin** name, not the repo: `doc-this:<name>` for anything in the Discovery pipeline, `wagner-skills:<name>` for the 8 members of the root plugin, `frontend-design:<name>` for third-party. Bare short names will not resolve. The `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` file-read path is a fallback only for non-Claude-Code harnesses.

### Description classes: user-triggered vs orchestrator-dispatched

Two contracts, two description shapes:

- **User-triggered skills** (orchestrator `/doc-this`, bridges `doc-this-promote`/`doc-this-help`, optional agents tracer/visor/data-master/design-system, and every standalone skill): pushy descriptions with explicit user trigger phrases, per skill-creator guidance.
- **Orchestrator-dispatched workers** (Discovery: scout, code-analyst, detective, architect, writer, reviewer): called **objectively** by their orchestrator via the Skill tool with the exact namespaced name — never by circumstantial user phrasing. Their descriptions carry the canonical dispatch-contract sentence ("Dispatched programmatically by <orchestrator> after <predecessor> — never auto-triggered by user phrasing; direct '/<name>' is for resume/debug…") plus NOT-for disambiguation clauses. **Never add user-intent trigger keywords to a worker** — a worker auto-triggered outside its pipeline runs unanchored (no manifest, no ledger, the ordering gates no-op without state) and reproduces the BUG-003 failure mode.
- Frontmatter flags cannot express this contract (docs-verified 2026-06-10): `disable-model-invocation: true` blocks ALL model invocation including the orchestrator's Skill-tool dispatch ("Claude can invoke: No"); `user-invocable: false` does not stop description-based auto-triggering. Enforcement is therefore mechanical: `hooks/doc-this-dispatch-gate.mjs` denies worker activation when the pipeline anchor is missing.
- Subagent (`agents/*.md`) conversion was evaluated and rejected for the workers: plugin agents are also description-auto-delegated, cannot pause for user input mid-run (the pipeline's checkpoints/handshakes are interactive), and plugin-provided agents ignore `hooks`/`mcpServers`/`permissionMode` frontmatter.

### Pipeline enforcement hooks

The doc-this pipeline is enforced by the hooks below (wired in `doc-this/hooks/hooks.json`, scripts in `doc-this/hooks/`, shared lib in `doc-this/hooks/lib/doc-this-checks.mjs`). They ship with the `doc-this` plugin, so they exist only while it is enabled. All are no-ops in projects that don't use doc-this (i.e., have no `.doc-this/state.json`) — EXCEPT the dispatch gate, which exists precisely to fire in that case for pipeline workers.

| Hook script | Event | What it blocks |
|---|---|---|
| `doc-this-dispatch-gate.mjs` | `Skill` | **Unanchored Discovery worker activation**: the 7 Discovery workers (incl. legacy `doc-this-archaeologist` name) denied when `.doc-this/state.json` is absent in cwd. Workers are dispatched objectively by `/doc-this` — circumstantial activation would run them without manifest/ledger/gates (BUG-003 failure mode). `/doc-this`, promote, help, optional agents, and non-pipeline skills pass through. Runs FIRST in the Skill matcher. Harness: `hooks/test-doc-this-dispatch-gate.mjs` (11 cases). |
| `doc-this-phase-gate.mjs` | `Skill` | `doc-this:doc-this-code-analyst` activation (legacy alias `doc-this-archaeologist` also matched) when `state.json.doc_level` or `state.json.database_ownership` is null. Hard deny (`exit 2`). |
| `doc-this-checkpoint-gate.mjs` | `Skill` | Any `doc-this:doc-this-<agent>` activation when the predecessor phase has no checkpoint in `state.json.checkpoints` (legacy key `archaeologist` accepted alongside `code_analyst`). Optional agents (tracer, visor, data-master, design-system, promote, help) exempt. Hard deny. |
| `doc-this-coverage-gate.mjs` | `Skill` | **Total Source Coverage** (BUG-003) at phase transitions, derived from `.doc-this/context/file-manifest.json`: detective denied while any manifest `source` file is missing from `coverage-ledger.json` or unassigned (no `all_files`/`exclusions` home); writer denied while any manifest markup page lacks a per-page `kind:ui` entry in `external-surface.json`; reviewer denied while `code-spec-matrix.md` misses source-file rows. Legacy runs (no manifest) get an advisory pointing at `/doc-this --backfill-coverage` — never denied. Hard deny (`exit 2`), capped 20-path lists, `Set`-difference set math. Regression harness: `hooks/test-doc-this-coverage-gate.mjs` (15 cases). |
| `doc-this-artifact-completeness-gate.mjs` | `Skill` | **Per-module doc_level artifact completeness** (BUG-004) at the analysis→interpretation transition (`doc_level ∈ {standard, detailed}`): detective denied while any `modules.json` module with entities lacks a non-empty `data-dictionary/[module].md`, or with functions/algorithms lacks `flowcharts/[module].md`. `doc_level=minimal` passes; legacy runs (no `modules.json`) get an advisory. Hard deny (`exit 2`). Regression harness: `hooks/test-doc-this-artifact-completeness-gate.mjs` (14 cases). |
| `doc-this-promote-warning.mjs` | `Edit\|Write` | Nothing — advisory only. Injects `additionalContext` when the staging tree (`.doc-this-sdd/`, or legacy `_doc_this_sdd/`) exists and the target is `docs/requirements/*.md`, `docs/adr(s)/*.md`, or `docs/TRACEABILITY.md`. |
| `doc-this-describe-only-gate.mjs` | `Edit\|Write` | Pact violations in `.doc-this-sdd/**` **only** — the staging tree where the agents write (BUG-005; legacy `_doc_this_sdd/**` is still matched for in-flight runs). The promoted `docs/` tree (requirements/adr/bugs) is the shared SDLC namespace co-owned by forward-design work and is NOT policed (a forward ADR's `## Consequences`, a "should be" requirement, and bug files are all legitimate there); promote copies from already-gated staging, so nothing is lost. The regex layer is an **English tripwire, not the rule**: 🟡 markers (language-independent), judgment verbs at line start (`should be / recommend / propose / consider refactoring / better approach`), Technical-debt headers, fabricated ADR sections (`Alternatives considered / Consequences`), NFR-from-pattern phrases (`inferred from middleware`), and sampling-phrases disclosing unread source (`not read in full / read by sampling / skimmed`). Output written in another `doc_language` is caught by **meaning**, by the agents applying the pact — the regex deliberately no longer carries per-language word-lists, because a literal list silently passes every phrasing outside it. Per-artifact escape via `<!-- DOC-THIS-EXEMPT : reason="..." -->`. Best-effort safety net — primary enforcement is the agents' semantic application of `skills/doc-this/references/describe-only-pact.md`. Hard deny (`exit 2`). Regression harness: `hooks/test-doc-this-describe-only-gate.mjs` (24 cases). |
| `doc-this-lsp-budget.mjs` | `LSP` (PreToolUse) | Per-agent, per-operation LSP call budgets. The Code Analyst gets unlimited `documentSymbol` but near-zero `incomingCalls` (5) since that's Detective's job. Soft limits at ~50% inject advisory; hard limits deny (`exit 2`). Tracker: `os.tmpdir()/.claude-doc-this-lsp-${SESSION_ID}.json` (a legacy `/tmp` tracker from an in-flight pre-port session is still read). |
| `doc-this-lsp-timing.mjs` | `LSP` (PostToolUse) | Nothing — advisory only. Tracks per-call duration, warns on slow calls (>15s) and cumulative LSP time (>5min). Logs to `~/.claude/logs/doc-this-lsp.log`. |

**Bypass**: `touch /tmp/.claude-doc-this-bypass-${CLAUDE_SESSION_ID}` in a prior turn (the same marker name under `os.tmpdir()` is also honored — that is the portable form denial messages advertise, and the only one that exists on native Windows). Inline `SKIP_*` env vars do NOT work — Claude Code spawns the hook in a separate process so the env var never reaches it. Per-session marker file is the only reliable bypass.

**Logs**: `~/.claude/logs/doc-this-gates.log`. Format: `TIMESTAMP | VERSION | SESSION | PROJECT | DECISION | TARGET | REASON | DUR_S`. One line per decision (allow/deny/advise/exempt/skip).

**Adding a new hook**: write a zero-dep Node `.mjs` script under `hooks/` (only `node:fs`/`node:path`/`node:os`/`node:url`), import the canonical I/O helpers from `hooks/lib/doc-this-checks.mjs` (`readHookInput`, `parseInput`, `bypassActive`, `bypassHint`, `statePath`, `resolveProject`, `stateField`, `log`, `allow`, `deny`, `advise`, `advisePost`, `lspTrackerPath`, `phaseToAgent`, `failOpen`), wrap the body in `failOpen(main)`, append a `node "${CLAUDE_PLUGIN_ROOT}/hooks/X.mjs"` command to `hooks/hooks.json`, `chmod +x` the script (verify `git ls-files -s` shows `100755`). Node ≥18 required; hooks fail-open if `node` is missing (command error → non-blocking) or the script throws. Test harnesses are zero-dep `.mjs` too — the tree is shell-free.

## Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`)
2. Add supporting files in `scripts/`, `assets/`, `references/` as needed
3. If the skill needs hooks, append them to `hooks/hooks.json`
4. Bump the version by hand in all four fields (see Versioning) — nothing bumps it for you
5. Commit and push — marketplace users run `claude plugin marketplace update` to sync

## SKILL.md Writing Rules

- **Description** (frontmatter): Third-person, pushy — list all trigger conditions explicitly. **Hard limit: 1024 characters** — the review's `description_field` validation aborts above this, skipping both LLM judges and returning `reviewScore: 18` with no useful feedback. Verify before any other review iteration: a wordy `Triggers on '...', '...'` + multi-clause `NOT for ...` description hits 1024 fast.
- **Body**: Imperative/infinitive form ("Log to..." not "You should log to...")
- **Target**: 1,500–2,000 words body; offload heavy reference to bundled files
- **Explain why**: Every instruction should make clear why it matters
- Use `skill-creator:skill-creator` to test, evaluate, and iterate on skills

## Testing Skills

Author and iterate through `skill-creator:skill-creator`. **Measure** with Tessl evals — write a
scenario under `evals/<plugin>/<skill>/<scenario>/` and run it against the skill as `--context`.
See **Evals** below for the layout, the `eval lint` fail-open, and the budget.

The older method — prompts in `skills/<name>/evals/evals.json`, run with and without the skill in
parallel subagents, judged by eye — is superseded: it is unrepeatable and produces no comparable
number. Two files remain in that format and are documented in place; do not add a third.

## Writing a scanning check

Several harnesses here assert the *absence* of something (`test-fr-proto-1.mjs`'s secret-shaped-token
scan, the describe-only gate's pattern layer). An absence check that silently reads nothing reports
PASS, so treat the scan itself as the thing under test:

- **Prove both directions before trusting a verdict.** The scan must flag a planted canary *and*
  must not flag benign text. One control is not enough — a pattern that matches everything and a
  pattern that matches nothing both look like a green suite from one side.
- **State what is allowed, not what is forbidden.** An allowlist (`test-fr-bundle-3.mjs`'s list of
  expected skill dirs) stays correct as the tree grows; an inline list of banned strings goes stale
  and puts the very strings it rejects into the file.
- **Shell gotchas that make a scan inert:** zsh does not word-split unquoted vars, so
  `for t in $LIST` loops once over the whole string; a blank line in a `grep -F -f` pattern file is
  an empty pattern that matches every line; and some `grep` builds mishandle `.*` spanning a short
  anchor plus a large ERE alternation — split those into a two-stage pipe.

## Quality Gate

**Optional, not a contributor requirement** — it needs a tessl account, and the review
**uploads the whole skill directory to tessl's service** (`SKILL.md` plus `references/`,
`scripts/`, `assets/`). Never run it on anything confidential. A PR is not blocked on a tessl
score. Contributor-facing instructions live in README.md ("Skill quality review"); this section is
the maintainer's shorthand.

The CLI and the MCP server now drive **the same** server-side pipeline: `tessl review run quality`
≡ `mcp__tessl__review_run`, `tessl review view` ≡ `mcp__tessl__review_view`. The deprecated
single-pass `tessl skill review` is superseded (it still exists in 0.105.0 and prints no warning —
do not write that it was removed). Both paths are bundle-aware, which is why the harness's old
`remote` mode is gone: it existed only because the old local review did not read `references/`.

### The MCP path

Enable the server for this repo first — `.claude/` is gitignored, so a fresh clone carries no MCP
configuration and you must add it to your own `.claude/settings.local.json`:

1. `mcp__tessl__status` — confirm `authenticated: true`.
2. `mcp__tessl__review_run` — `path: ./skills/<skill-name>`, `kind: "quality"`. Async: returns a
   run ID immediately. One run per user request, never speculative.
3. `mcp__tessl__review_view` — poll that `runId` until `status` is `completed` (or `failed` /
   `cancelled`). Budget a couple of minutes, not seconds.

**`review_fix` is report-only here.** Start it, read `summaryOfChanges` through `review_view`, then
apply the parts you agree with by hand. **Never call `review_view` with `apply: true`** — it writes
the judge's preferences straight to disk, and the judge has no idea the tradeoffs below are
deliberate. It will revert them: a single pass on okf-maintain proposed trimming exactly the
rationale paragraphs that carry the *why*, alongside one genuinely missing reference link. The
CLI's `tessl review fix` replaces the old `--optimize` and inherits the same report-only rule.

### The CLI path

```bash
export TESSL_WORKSPACE=wagneripjr        # no default; the harness SKIPs rather than guess
node tests/test-tessl-quality-gate.mjs ./skills/<skill-name> 90
# exit 0 pass · 1 below floor · 77 skipped (no CLI / no workspace / preflight failed / no score)
```

The harness runs a **free** `tessl review list` preflight first, so a logged-out or misnamed
workspace skips *before* submitting a review rather than after paying for one. It passes
`--threshold 0` on purpose: tessl's own gating is disabled so a validation *warning* can never
arrive as a non-zero exit and be misreported as "below floor". Score extraction lives in
`tests/lib/tessl.mjs` and is asserted by `tests/test-tessl-score-parse.mjs` — 0 is a score, `"93"`
is not.

The harness **skips (77), never fails**, when tessl is unavailable or unauthenticated — a review
that could not run is not a pass. It stays excluded from `run-all.mjs` for that reason.

### Prices, measured 2026-09-04 on the Free plan

| Thing | Credits |
|---|---|
| `review run quality` | **10** |
| `review run quality`, cached (no `--force`, unchanged skill) | **0** — `credits: null`, `metadata.reusedFromReviewRunId` |
| `review run security` (Snyk) | **0** |
| `review fix --max-iterations 1` | **100** (2026-08-23) |

`tessl org usage --json` reports `credits.{limit,used,remaining,resetsAt,overageAllowed}` for free.
Free plan: 1000/month, **overage not allowed** — work simply stops. Read it before and after
anything paid; the delta is the real price. `--review-plugin` (custom rubric) requires a **paid
plan**: do not plan around custom rubrics.

Caveat that survives the migration: the validation check is named for `references/` **plural**,
while `agent-cli`, `human-cli` and `airflow-dags` use `reference/` **singular** — before trusting a
low `progressive_disclosure` on those three, confirm the run's validation block actually counted
their files. Worth a separate `fix:` commit to rename.

**"MCP and CLI scores are not one scale" is under re-verification.** The recorded gap (MCP 89 vs
harness 93, okf-maintain, 2026-08-23) was MCP-bundle vs CLI-*local*. Both paths now run the same
bundle-aware pipeline, so the gap should be gone — but that is a hypothesis until a paired run
says so, and the 2026-08-23 measurement was real. Do not delete it; settle it.

Fix any criterion scoring below 3/3 unless it's an intentional design tradeoff (document why).

**Known structural tradeoffs (do not chase):**
- `descriptionJudge.trigger_term_quality` is **low-by-design for orchestrator-dispatched workers** (see "Description classes" above) — they are invoked by exact name, not by user phrasing; expected score 1–2. Never add user-intent keywords to lift it: that creates unanchored-run risk (the 2026-06-10 architect episode — keywords added to chase the judge had to be reverted). This is no longer an assertion to take on faith: see **Evals → non-activation proof** below, which makes it measurable.
- `contentJudge.conciseness` may stay 2 (or 1 for doc-this-code-analyst) where inline commands and restated discipline rules are load-bearing for actionability=3. Verify judge claims before reacting (e.g., judge line-count assertions have been wrong).
- `validation.relative_links` on **okf-maintain** flags a missing `index.md`. It is a false positive and must not be "fixed": the link sits inside a fenced block quoting `okf.mjs`'s `ENTRY_BLOCK` verbatim, `tests/test-okf-maintain.mjs` AC-17 pins that quote byte-identical to what the script writes, and the link is relative to the *target* repo — it can never resolve from the skill directory. Editing it breaks AC-17 and makes the doc lie about what `wire` emits. The same block is quoted in `references/adoption.md` and carries the same warning.

## Evals

A review grades the skill; an **eval** grades its *effect*. `tessl eval run` solves each scenario
twice — baseline and with the skill injected — and scores the difference against a per-scenario
rubric. That delta is what the skill is worth, and it replaces the old
`evals/evals.json` + parallel-subagents + eyeball method as the measurement of record.

### Layout — repo root, not inside the skill

```
evals/<plugin>/<skill>/<scenario>/
  task.md        # the ONLY thing the agent sees
  criteria.json  # {context, type:"weighted_checklist", checklist:[{name,description,max_score}]}
  resources/     # optional, auto-copied into the working dir
  scenario.json  # optional; fixtures: directory | commit, plus include[] / setup[]
```

Root, **not** `skills/<name>/evals/`, and the first reason is decisive: a quality review bundles
the whole skill directory, so an in-skill `evals/` is uploaded to the judges as part of the thing
it grades. It also lets one free `tessl eval lint ./evals` cover everything, and keeps fixture
`resources/` out of a shipped plugin.

`criteria.json` items are `{name, description, max_score}` **only**. The `category` enum
(INTENT/MUST_NOT/…) in the published docs is **not** in 0.105.0's schema — it warns
`⚠ Extra checklist fields: category`. `tests/test-eval-scenarios.mjs` AC-3 rejects it.

### `tessl eval lint` fails open — this is the trap

Its own help says so: a directory is a scenario only if it holds `task.md`, and one without is
"silently skipped and recursed into". Verified: a folder holding only `criteria.json` lints as
`✔ 0 scenarios valid`, exit 0. A renamed or mistyped brief therefore deletes a scenario from every
future run while every signal stays green. `tests/test-eval-scenarios.mjs` pairs the two files
(AC-1), compares its own walk against lint's count (AC-5), and **reproduces the fail-open as a
canary** (AC-6b) so the guard cannot be quietly lost. Never rely on `eval lint` alone.

### Running one

An eval — unlike a review — requires a **Tessl project link**: `tessl project create skills
--workspace wagneripjr`, which writes `tessl.json` at the repo root. That file is **gitignored on
purpose**: it names a workspace no contributor has, and evals are a maintainer step. Same
precedent as `.claude/`. `tessl project repair` re-links a broken one.

```bash
tessl eval run ./evals/wagner-skills/postmortem --context ./skills/postmortem --wait
```

`--context` takes a local path or glob, so **no `.tessl-plugin/plugin.json` is committed anywhere**
in this repo. Tessl's documented layout is plugin-rooted (a manifest beside `evals/`, unlocking
`tessl scenario generate` and the `eval run ./my-plugin` shorthand) and we deliberately do not
adopt it: each manifest carries its own semver, and four hand-synced version fields is already one
problem too many. If generated scenarios are ever wanted, do it in a **throwaway copy outside this
repo** (`tessl skill import` → `scenario generate` → `scenario download --output` → curate → copy
the good ones in). Never point `scenario download` at the real tree: its default
`--strategy merge` overwrites `scenario-N/` directories and destroys hand edits.

**There is no dry-run.** `tessl eval run --json` *submits* — by the time it prints
`estimatedCredits` you have paid. Budget a priori from `tessl org usage --json`, before invoking.
Cheap levers: `--skip-baseline` (halves it when the baseline is meaningless), `--skip-scoring` (no
scorer model runs at all), `-n 1` while exploring and `-n 3` only for probabilistic properties.

### The non-activation proof (planned)

`--skip-forced-context-activation --skip-scoring` observes whether an agent reaches for a skill on
its own. Pointed at scenarios written as the most tempting user phrasing for each doc-this worker,
with `--context './doc-this/skills/*'` so the agent has a real choice, it turns
"`trigger_term_quality` is N/A by design" from an excuse into a measurement. Pass condition: across
every run, **no member of the `WORKERS` set in `doc-this/hooks/doc-this-dispatch-gate.mjs`**
appears in the Activated-skills column — the orchestrator `doc-this` activating is expected and
allowed. The assertion must read that set from the gate file, never restate it. Record the result
in a committed `RESULTS.json` (no run ids, no workspace ids) enforced by a zero-credit harness,
the same shape as `judgment-fixture/FINDINGS.md`.

### Not worth doing

- **Any tessl step in `.github/workflows/test.yml`.** Fork PRs cannot read secrets, so the job
  either fails on every fork PR — contradicting "no PR is blocked on a score" — or exits 77, and
  `run-all.mjs` turns any skip into INCOMPLETE + exit 1, making **every fork PR red**. Keys also
  expire silently after 30 days, credits are finite and PR volume is not, and `test.yml` currently
  carries no secrets at all. If a score must ever attach to a commit SHA, use `workflow_dispatch`.
- **`tessl schedule *`** — unattended burn against a hard cap with no overage.
- **`tessl skill publish`** — a third version surface, publishing private-by-default plugins out of
  a public repo, for no benefit. These plugins are consumed from git via the Claude Code
  marketplace.

## Versioning

Versions are maintained **by hand** — there is no hook automation. Both plugins are version-keyed
in the plugin cache, so a bump is mandatory to ship anything: `update` silently no-ops otherwise.

### Commit → Version Bump Mapping

| Commit prefix | Version bump | Example |
|---------------|-------------|---------|
| `fix:` | Patch (0.1.0 → 0.1.1) | Bug fixes in skills |
| `feat:` | Minor (0.1.0 → 0.2.0) | New skills, new features |
| `feat!:` or `BREAKING CHANGE:` | Major (0.1.0 → 1.0.0) | Breaking changes |
| `docs:`, `chore:`, `ci:`, `test:` | No bump | Non-functional changes |

### Version Files

Four fields, all edited by hand, all of which must agree:

| File | Field | Current |
|---|---|---|
| `.claude-plugin/plugin.json` | `.version` | 6.5.1 |
| `.claude-plugin/marketplace.json` | `.metadata.version` | 6.5.1 |
| `.claude-plugin/marketplace.json` | `.plugins[*].version` | 6.5.1 / 1.1.5 |
| `doc-this/.claude-plugin/plugin.json` | `.version` | 1.1.5 |

**Never let `marketplace.json` fall behind `plugin.json`.** The marketplace entry is what the
client compares against; if it advertises a lower version, `claude plugin update` is a permanent
no-op and nothing you ship reaches the cache. Realign both and move on — there is no hook left to
re-sync them for you.

### Gotchas

- **zsh and `!`**: zsh escapes `!` to `\!` in double-quoted strings. Use single quotes for breaking change commits: `git commit -m 'feat!: breaking change'`.

## Installation

Local development:
```bash
claude plugin add /path/to/this/repo
```

Via marketplace:
```bash
claude plugin marketplace add wagneripjr/skills
claude plugin install wagner-skills@wagner-skills-marketplace
claude plugin install doc-this@wagner-skills-marketplace
claude plugin disable doc-this@wagner-skills-marketplace   # off until a discovery run
```

## Updating After Changes

Both plugins are version-keyed in the cache — bump the relevant `plugin.json` (and its
`marketplace.json` entry) or `update` no-ops.

```bash
claude plugin marketplace update wagner-skills-marketplace
claude plugin update wagner-skills@wagner-skills-marketplace
claude plugin update doc-this@wagner-skills-marketplace
```

Then restart Claude Code to apply.

## Commands

```bash
# Verify plugin loads
claude plugin list

# Every suite in the repo — what CI runs. Exit 0 only if none skipped.
node tests/run-all.mjs

# Repo-wide scan for credential-shaped material (also in CI)
node tests/test-publication-safety.mjs

# Run the tree/closure acceptance matrix (asserts only the 8 expected skill dirs exist)
node tests/test-fr-bundle-3.mjs
```

<!-- okf:entry -->
## Documentation

Start at [index.md](index.md). Every documentation folder carries a generated `index.md` listing
each document's title and one-line description — answer "which doc covers X" and "does a doc for Y
exist" from that index in one read, and open a document only after the index names it. Do not grep
`docs/` for a document's identity; grep stays correct only for a literal phrase inside a body that
the index cannot carry.
<!-- /okf:entry -->
