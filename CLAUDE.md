# Wagner Skills

Repo hosting **eleven plugins**, published at the same granularity to native Claude Code and Codex
marketplaces named `wagner-skills-marketplace`, and the Tessl registry (FR-TESSL-3). Nine are one skill
each; `farley-score` ships a scorer and its coach, and `doc-this` bundles fourteen because they
share nine gates and a `hooks/lib/`.

| Channel | Published by |
|---|---|
| Claude Code marketplace | `git push` + `claude plugin marketplace update` + `claude plugin update` |
| Codex marketplace | `git push` + `codex plugin marketplace upgrade` + `codex plugin add` |
| Tessl registry | `.github/workflows/tessl-publish.yml`, **never the CLI** |

### FR-LAYOUT-1 · One directory per plugin, serving every channel

Every plugin is a root under `plugins/`, the layout Tessl documents for a repository holding more
than one (`docs.tessl.io/creating-skills-and-plugins/create-a-plugin.md`, asked for the monorepo
shape): `plugins/<name>/` holding `.tessl-plugin/plugin.json`, `skills/`, `evals/` and
`.tesslignore`. The `.claude-plugin/plugin.json` sits beside them, and the repo-root
`marketplace.json` points at each with `"source": "./plugins/<name>"`.
The sibling `.codex-plugin/plugin.json` selects Codex entry points and hook registration;
`.agents/plugins/marketplace.json` catalogs the same eleven roots.

**Why the granularities had to converge.** Claude Code plugin path fields (`skills`, `hooks`,
`commands`, …) must be relative, must start with `./`, reject `../`, and support no globs — so a
skill directory cannot be both a member of a Claude Code bundle and its own sibling Tessl plugin
root. Nine Tessl plugins and two Claude Code bundles could not both be canonical; the bundles were
dissolved rather than the per-skill release cadence.

Three deviations died with the old tree, and they are worth naming because each was invisible:
`doc-this` was a root at the repository top level while the other eight were nested *inside*
`skills/`; `evals/` sat at the repository root, outside every plugin root, which is the exact
shape the troubleshooting page blames for *"baseline results only, no with-context column"*; and
the eight solo manifests declared `"skills": ["."]`, which the schema does not document — the
field is "a directory containing skill subdirectories, or an array of specific skill directory
paths", and omitting it discovers `./skills/`. All eight now omit it.

**Installing is per plugin.** There is no bundle and nothing ships disabled — a plugin you do not
install costs no context and spawns no hooks. `doc-this` is still the one to install only for a
discovery run: it charges ~3.4k tokens of skill descriptions per session plus 5 node hook spawns
per `Skill` call and 2 per `Edit`/`Write`.

```bash
claude plugin install postmortem@wagner-skills-marketplace
claude plugin install doc-this@wagner-skills-marketplace
```

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

Owned by `plugins/okf-maintain`. Four parts, each named by an acceptance test:

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

Owned by `plugins/okf-maintain`. At a **Claude Code plugin root** — a directory holding
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

At FR-OKF-4 adoption, `check` evaluated zero concept documents and exited 77: the tree was entirely
plugin payload and project meta. FR-HOST-1 adds one indexed migration handoff, which `check` now
evaluates. There is still no requirements/ADR corpus or `docs/` tree; rule identifiers remain
defined in this file. The root index lists the project-meta files and the handoff.

### FR-OKF-5 · An index nothing links to may not vouch for a document

Owned by `plugins/okf-maintain`. `okf.mjs index` writes but never deletes, so anything that narrows
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

Owned by `plugins/okf-maintain`, and the first hook surface in this plugin. Four parts, each named by
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

### FR-OKF-7 · One generator renders both dialects, and adopts a catalog only where nothing is lost

Owned by `plugins/okf-maintain`. Two OKF index dialects were live and only one had a generator. The
profiled row is `* [<id> — <title>](<file>) - **<status>** — <description>` under a single
`# <directory basename>` heading with the marker beneath it; the v0.2 row is
`* [<title>](<file>) - <description>` grouped under `# <type>` headings with the marker first. The
profiled generator, `okf-index-gen.mjs`, was deleted when index generation moved here, and the
survivor it was renamed into kept only `--traceability` — its argument parser falls through to
`usage()` without that flag, so no version of `agentic-sdlc` regenerates a folder index. Every
repository on the profiled dialect therefore hand-maintained its catalogs while `okf.mjs` correctly
refused them. Six parts:

1. **The manifest selects the dialect, and nothing else does.** `required_keys` containing both `id`
   and `status` gets the profiled row; anything else gets v0.2. Not `profile:`, which names which
   documents carry required keys and never which are enumerated, and not `okf_version`.
   `declaredRequiredKeys` and `declaredConceptFolders` line-scan the manifest in the style of
   `declaredProfile`, and they accept **both** YAML spellings — the block sequence and the one-line
   flow sequence — because the two repositories on this dialect use one each, and a reader that knew
   only the one in front of it would have shipped silently half-working.
2. **OKF v0.2 is the only format version there is.** A profile changes the row shape, never the
   version, so the root index carries `okf_version: "0.2"` in both dialects — which today's profiled
   roots carry none of, and gaining it is the point. A manifest still declaring `0.1` is named as
   `retired-okf-version:` and otherwise ignored: refusing would lock out the two repositories the
   feature exists for, and honouring it would perpetuate a version that means nothing beyond "which
   generator wrote this".
3. **Adoption is gated on what the renderer can express, not on what the bytes say.** An index
   carrying the retired marker is adopted — marker replaced, file regenerated — when every *concept*
   document in that directory has a non-empty `id` and `status` and no description was dropped by the
   cap. The first draft compared rendered text against committed text instead, and it was wrong in
   both directions: it refused a merely **stale** index, whose only escape was deleting the file,
   when regenerating a stale index is the entire purpose of the tool; and it refused an index that
   had **omitted** documents, because adding their rows changed the row count — though adding a row
   is FR-OKF-3 working, not a loss. Losslessness is a property of the documents.
4. **`isConcept` scopes the gate, and this is load-bearing.** Scoped to every listable file instead,
   an ordinary `README.md` in an indexed folder refuses that folder forever: you cannot give a README
   an `id`, and naming it in `.okfignore` would delete its row. That is a guard whose condition
   nothing can satisfy — the exact defect FR-OKF-3 removed when it deleted the profile refusal,
   reintroduced in a new costume, and it was caught on a two-file fixture rather than in review.
   Project-meta files render in the default row shape, are not reported, and never block.
5. **Three markers, two of them written.** The retired `okf-index-gen.mjs` marker (an em dash, where
   both live markers use ASCII hyphens) is recognised **only** so a catalog it left behind can be
   adopted, and is never emitted — stamping forward the name of a binary on no disk anywhere is the
   defect being repaired, not a format worth continuing. The profiled marker's bytes differ from the
   v0.2 marker by the single word `concept`, which is what makes an *older* `okf.mjs` refuse a
   profiled index rather than silently rewriting it without an id or a status. `wasGenerated` had to
   learn the second written marker too, or `coverage` stops naming adopted debris as `orphan-index:`
   — the FR-OKF-5 fail-open, one marker later.
6. **The cap moved to 512 and still drops rather than truncates.** Measured before choosing:
   20 of 26 described documents in the hub exceed 160, 4 of 15 in `claude-code-config`, and 13 of 14
   in a client repository — and the profiled dialect has **no** cap, so its committed rows carry
   descriptions up to 413 characters verbatim. At 160 the capability gate would have refused nearly
   every profiled directory, shipping a feature that did nothing. 512 clears every profiled corpus
   measured and changes no v0.2 row in any of them. Its ceiling is stated rather than discovered:
   512 is fitted to today's corpus, nine hub descriptions still exceed it and stay bare behind a
   `long-description:` report, and the "a machine-cut half-sentence is a summary no author wrote"
   argument against truncating is untouched — only the threshold moved.

The hook needed no change, and the reason is worth recording because it looks like an omission: the
"index carries no generation marker" refusal has never lived in `okf-index-regen.mjs`. It lives in
`ownsIndex`, per directory, which is where widening it belongs — a repository-wide refusal because
one directory's index is foreign would be strictly worse.

`tests/test-okf-maintain.mjs` AC-55..AC-63.

### FR-CORPUS-1 · A shipped instruction may not name an executable that is not there

Owned by `tests/test-shipped-names-resolve.mjs`. The class is shipped instructions disagreeing with
shipped code — `agentic-sdlc` BUG-092, BUG-140 and BUG-145 are the same shape, each found by a
consuming-repository session rather than by a test. The guard BUG-145 left behind greps for one live
basename and so structurally cannot see a retired one. Two rules, both mutation-tested:

- **Every `.mjs` basename the shipped instruction corpus names resolves to a tracked file.**
- **Every generation marker a skill stamps is byte-identical to one imported from `okf.mjs`**, never
  restated as a literal in the test.

**Scoped to `.mjs`, and the measurement is why.** The rule as first stated — every executable
basename resolves — reports 78 findings out of 109 basenames, of which **two** are real; the other
76 are illustrative code about the reader's own project (`mycli.js`, `my_dag.py`, `auth.service.ts`).
ADR-014 makes `.mjs` this repository's own executable extension, so a `.mjs` named in our text is a
claim about our tree while the rest are examples. An allowlist of 76 would be the stale-inline-list
anti-pattern this file warns about, inverted.

**Scoped to instruction text, not source, and that is a rule the suite asserts about itself.**
`okf.mjs` lives inside the corpus glob and legitimately contains both a retired basename and the
retired marker, because recognising them is its job. A naive scan reports the oracle as two defects.
AC-5 therefore pins that the generator's source is out of the read scope *and* that it really does
carry the strings a narrower scan would trip on — so the exclusion cannot later be mistaken for
dead weight and removed.

Its ceiling: a basename sweep sees only names that were **written**. An instruction omitting the
executable entirely — which is what BUG-145 was filed for — stays invisible to it, and so does a
retired `.sh` or `.py` helper, which ADR-014 makes acceptable here.

AC-7 and AC-8 are R-97's graduation condition: a fixture carrying a retired executable name and a
drifted generation marker fires both rules, and AC-9's benign control fires neither. AC-10 proves the
one exemption is scoped to the single file entitled to it by aiming it at the wrong file and watching
the mention reappear.

### BUG-007 · A skill may not mint indexes the owner it names refuses

`doc-this-promote`'s `references/okf-conformance.md` shipped a fallback hand-written-index template
stamping the retired `okf-index-gen.mjs` marker, so every index that skill hand-wrote was born
permanently foreign to `okf-maintain` — which the same skill body names as the owner of the index
grammar. Two paragraphs in the same reference depended on the retired name and were false with it:
the promise that the first real regeneration heals any drift, and the `## Existing-index safety`
rule, which keyed "hand-authored" off *the* generator marker while naming only the deleted one.
`references/id-assignment.md` and `SKILL.md` were the second and third consumers of that singular
phrase. All four now name the **set** of markers and the adoption rule FR-OKF-7 actually implements.

Ordering was the whole constraint: the template had to name a marker the shipped tool honours, so it
lands **after** the renderer. Fixed first, it would have minted a second class of index nothing
regenerates.

### BUG-008 · A reference may not name a file at the path a layout change moved it from

`doc-this-viewer`'s `references/maintaining.md` and `references/manifest-schema.md` named
`test-build-manifest.mjs`; FR-LAYOUT-1 moved every harness out of the plugin payload — because
anything under a plugin root is a candidate for the publish pack — and the real file is
`tests/test-doc-this-build-manifest.mjs`. Found by FR-CORPUS-1's first run, which is the point of it.

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

`.tessl-plugin/plugin.json` manifests **are** committed — **nine of them since FR-TESSL-3**, one
per `plugins/*`; the repo-root one was deleted with the bundle it described. They
originally existed for one reason: `tessl skill lint` hard-refuses without one (`Not a Tessl
plugin: no .tessl-plugin/plugin.json or tile.json found in the package root`). They now also carry
the published plugins. Lint is not a quality review
and costs nothing: it runs the publisher's pack step offline and reports per-skill context cost,
orphaned files, skill files outside the spec directories, and credential-denylist exclusions. That
is worth the manifests. The earlier position — that `--context <path>` reaches the same result — was
about *evals*, where it still holds; it never covered lint, which has no `--context`.

**Superseded in part by FR-TESSL-3.** The refusal's stated price — extra hand-synced semvers — was
once avoided by carrying no `version` at all, on the grounds that a field nothing reads and no
harness checks is exactly the drift this repo has been bitten by. Publishing changed both halves of
that: `tessl plugin pack` **hard-refuses** a manifest without a version (stricter than lint, which
only warns `No version set`), and `tests/test-tessl-publish.mjs` now checks every one. A version
that a packer reads and a harness pins is not the drift the objection was about. There are now nine
`.tessl-plugin` manifests, each carrying its own — see **Versioning**.

### FR-TESSL-2 · A score is never hand-written, and this repo no longer keeps one

**The record is gone; the rule that produced it stands.** `tests/tessl-scores.json`,
`tests/tessl-scores.mjs` and `tests/test-tessl-scores.mjs` were removed on 2026-09-07. What
remains binding: **prose may carry *why* a dimension sits where it does; it may not carry the
number.** Not in this file, not in README, not in the memory index. The registry page for each
published plugin is the score of record.

**The defect this fixed, kept because it recurs.** The record used to be hand-written prose here
and in the memory index, and by 2026-09-04 it had drifted **10 points in both directions** —
`postmortem` recorded 100 against an actual 90, `doc-this-viewer` 99 against 93, `doc-this-reviewer`
79 against 89 — while `platform-sre-kubernetes` had fallen from 89 to 80 with no entry at all. A
number written by hand is never re-derived, so the record decayed silently in exactly the direction
that flatters it.

**Why the generated replacement was removed rather than repaired.** It had no free way to stay
current, which was only discovered when FR-LAYOUT-1 invalidated every row at once:

- Rows key on the repo-relative subject path, so any move empties the file, and the generator
  refuses to write an empty record rather than silently blanking it.
- **A publish does not refill it.** Measured 2026-09-07 against `tessl review list --limit 100`:
  all 73 `subject.type: "skill"` rows are manual `review run` invocations from 08-20, 08-24 and
  09-04. The nine Action publishes that day produced **zero**. The single publish-time row that
  does exist — from the accidental CLI publish of `platform-sre-kubernetes@1.0.0` — carries
  `subject.type: "tile_skill"` and `path: "SKILL.md"` with a `tileRef`, not a repo-relative path,
  so it fails both the type filter and the existence filter. Correct the earlier claim wherever it
  survives: publishing puts a score on the **registry**, not into `review list --mine`.
- Refilling therefore costs one `review run quality` per **skill** path — the command takes a skill
  directory, not a plugin root, so 22 runs at 10 credits — repeated with `--force` after every
  edit, because the cache is not content-addressed. A record that stays true only through recurring
  manual payment is the same failure mode it was built to kill, one step removed.

**What was kept, and where.** `tests/lib/tessl.mjs` and `tests/test-tessl-score-parse.mjs` stay:
they pin how a score is read from three different envelopes and are used by the quality gate. The
old AC-4 — no run or workspace id in a public tree — moved into
`tests/test-publication-safety.mjs` as Rule 3, where it now covers **any** tracked file rather than
one generated JSON, since these ids arrive in any pasted API envelope. A first group of all zeros
is a redacted id by construction and is allowed; the rule is mutation-tested, and removing it flips
a split-literal canary.

**Two findings worth not relearning.** A rubric must be named beside a number or two scores cannot
be compared: the same `okf-maintain` bytes scored **87** on `tessl/default-skill-review@0.2.0` and
**95** on a local `review-plugin/` fork forty minutes apart. That fork was removed — a published
registry score is always Tessl's standard rubric, so a custom `--review-plugin` could never move
the number that matters. And **`rules` are not a substitute**: `configuration.md` calls them
*"always-loaded guidance for agents"*; they ship context at install time and have no effect on
review scoring. There is no documented way to change what a *published* score means. Do not
re-propose one.

### FR-TESSL-3 · A skill is published from the repository that owns it, or it is a duplicate

Owned by `scripts/tessl-publish.mjs`, `.github/workflows/tessl-publish.yml` and
`tests/test-tessl-publish.mjs`. Tessl had already crawled this public repo and listed all 22 skills
as unowned `git-skill` rows with null scores. Six parts:

1. **Only the GitHub Action may publish.** `promote-or-claim-a-skill-you-have-created.md`: *"Using
   the GitHub action will automatically link your plugin to the repository, and all skills we
   previously indexed in the repository will be hidden and redirected to the plugins."* A CLI
   publish instead produces *"two versions, in two different workspaces"*, fixable only by
   contacting support. This was **verified the hard way**: `scripts/tessl-publish.mjs` was run by
   hand as a "quick check" on 2026-09-06, published `platform-sre-kubernetes` for real, and had to
   be unpublished inside the 2-day window. The script grew `--dry-run` for exactly that reason — a
   script whose only mode is the irreversible one will eventually be run by hand. Version `1.0.0`
   was reusable afterwards, so an unpublish frees the version rather than burning it.

2. **Nine plugins, because release is the coupling — reviews never were.** All reviews carry
   `metadata.subject.type: "skill"` with a per-skill path; none is `type: "plugin"`. But
   `publish-and-update.md` has no per-skill versioning, so one `version` covers every skill in its
   plugin and a one-skill fix republishes the lot. `create-a-plugin.md`: *"Keep a plugin focused on
   one responsibility; unrelated work belongs in separate plugins"*, and the promote page names the
   old bundle as the anti-pattern — *"avoid throwing in the kitchen sink!"*. So the eight unrelated
   skills are solo plugins at `plugins/<name>/.tessl-plugin/plugin.json`, each starting at
   `1.0.0` and moving independently. The manifests originally declared `"skills": ["."]`, putting
   `SKILL.md` at the plugin root; that spelling lints but is not in the documented schema, and
   FR-LAYOUT-1 replaced it with the convention path `plugins/<name>/skills/<name>/SKILL.md` and no
   `skills` key at all. `doc-this` stays **one** plugin: its 14 skills share 9
   enforcement hooks and a `hooks/lib/`, which are plugin-level and have no per-skill home.

3. **Discovery is anchored on git, not a filesystem walk.** A plain walk for
   `.tessl-plugin/plugin.json` also finds `.tessl/plugins/<vendor>/…` — a plugin installed by
   `tessl install`, belonging to another workspace, still on disk because it is gitignored rather
   than deleted. Publishing that pushes somebody else's plugin out of this one.
   `git ls-files --cached --others --exclude-standard` is the FR-OKF-3 flag combination for the
   same two reasons: `--exclude-standard` hides the vendored copy, `--others` still sees a manifest
   added in the commit being published. AC-7a canaries it. Found by review, not by running.

4. **The publish is idempotent so the pipeline can be unconditional.** The script asks the registry
   before publishing, so every push runs and only a real bump ships — a runtime check, never a
   `paths:` filter. Proven in practice: a transient `✘ undefined (status undefined)` on
   `okf-maintain` was cleared by a bare re-run in which all eight others reported *"already
   published, nothing to do"*. **A "could not find plugin" exit is the publish signal; any other
   non-zero exit is an error** — conflating them turns an outage into a spurious publish.
   `--version` is never passed: the CLI refuses it when the manifest declares one.

5. **Undocumented packer behaviour that silently breaks a plugin: any directory named `dist/` is
   dropped.** Isolated with a minimal probe — `assets/spa/index.html` packs, `assets/dist/index.html`
   does not — and `.tesslignore` negation cannot override it. `doc-this` was about to ship 20 files
   of Svelte source and **zero** runtime bundle, so every install would have hit `launch.mjs`'s own
   `error: prebuilt viewer missing`. The viewer's output is therefore `assets/viewer/`, and the
   name is load-bearing. This is why `create-a-plugin.md`'s rule is not optional: *"Confirm what
   will actually ship by packing it and inspecting the archive, not just linting… Lint alone can
   pass on a plugin that would drop content when packaged."* Pack and read the archive before every
   first publish.

6. **What publishing costs and what it exposes.** Publishing triggers a server-side review whose
   score lands on the registry — and it is **free**: 22 skills published with credits unchanged at
   1484.46, against 10 credits for a manual `review run`. That score reaches the **registry page**
   and nothing else: it does not appear in `tessl review list --mine`, so it cannot feed any local
   record (FR-TESSL-2). `"private": false` is **irreversible**
   (*"you cannot make it private again"*); `unpublish` works only within 2 days, after which only
   `plugin archive` remains. An `evals/` inside the pack becomes input to the judge grading that
   same skill, so every plugin root's `.tesslignore` names it — and since 2026-09-07 that is the
   only thing the ignore line does, because publish also **uploads** those scenarios through a
   separate reader that never consults the pack. Both facts are load-bearing at once; see **Evals**.
   The measurement above was taken with `--skip-evals`, which `scripts/tessl-publish.mjs` no longer
   passes, so "publishing is free" is now the cost of a review **plus** a publish-time eval run
   over the uploaded scenarios — re-measure the delta rather than quoting 1484.46 forward.
   Unsolved and worth watching: the
   review cache is not content-addressed (CLAUDE.md's own measurement: three rewritten skills came
   back *"reused, 0 credits, byte-identical scores"*) and `plugin publish` has no `--force`, so a
   published score may describe a previous bundle. Splitting does not fix that.

### FR-TESSL-5 · A measurement that is not recorded is a claim

Owned by `scripts/eval-record.mjs`, `tests/test-eval-record.mjs` and
`tests/fixtures/activation-scenarios/`. FR-TESSL-4 paid for a nine-plugin baseline and left
nothing in the tree; four of its plugins failed a scenario each with no classification of why.
Five parts:

1. **The record is projected, never typed.** `plugins/<name>/evals/RESULTS.json`, one row per
   scenario, written by `scripts/eval-record.mjs` from `tessl eval view <id> --json`. `lift_pp` is
   computed from the two arms rather than copied, so a transcribed number cannot survive
   `tests/test-eval-record.mjs` AC-7.

   **Why a run record survives where FR-TESSL-2's score record did not**, since the objection there
   was stated absolutely: a review score is a projection of *current state*, so a row about
   yesterday's bytes is wrong today and only recurring paid re-review keeps it true. An eval run is
   **immutable history** — it happened, at a commit, against a version. It does not decay; it
   becomes *older*, which is a different thing and is why the record can be free. Every row carries
   `plugin_version`, `context_commit`, `skill_tree` and `scenario_tree` so a stale row is visibly
   stale rather than quietly wrong. This does not reopen FR-TESSL-2: no score of record lives here,
   and the registry page is still the only place one does.

   The two `_tree` fields are **git tree object ids**, taken with `git rev-parse <commit>:<path>`.
   A git tree id already *is* the canonical content hash of a directory, computed by git, at the
   commit the run actually evaluated — hand-rolling a sha256 would hash the working tree instead,
   which is a different tree and silently so. They are 40 hex chars, not UUIDs, so
   `test-publication-safety.mjs` Rule 3 does not trip on them (AC-11e pins that).

   Rule 3 needs **no extension** for this record: it already scans every tracked file for
   non-redacted UUIDs, so a leaked run, workspace or user id fails today. The generator drops
   `data.id`, `scenarios[].id`, `createdBy`, `solutions[].id`, `solutionTarGZS3Key` and
   `metadata.cwd` — the last because it is an absolute path carrying a home directory, which AC-5b
   checks separately since it is not UUID-shaped.

2. **The four failures were agent non-completion, and the evidence was already in the envelope.**
   okf-maintain's run read `1 of 6 scenario evaluations failed` with its *baseline* arm stuck at
   `Awaiting results...` while the with-plugin arm scored 42/44 — a scenario that graded fine on the
   arm that finished. **All four retried clean**, every scenario scored on both arms, with
   substantial lift: okf-maintain +34/+44/+57 pp, platform-sre-kubernetes +19/+15/+49, human-cli
   +12/+5/+3, prototype-spike +26/−11/+56. Four for four is itself the finding — not one of the five
   failures was a scenario defect, and none needed a `.learnings` entry, because nothing about a
   skill was wrong. The docs call an agent that does not finish normal behaviour rather than an
   error, and that is exactly what this was.

   `classification` is the one hand-written field in a row — a judgment, not a measurement — and the
   generator leaves it `null` on purpose. An early draft had it default to `agent-non-completion`,
   which made AC-8 assert that this script had filled a field in: every row passed, having said
   nothing. It is the same fail-open as a scan that reads no files, committed by the guard's own
   author.

   Recorded and not softened, three rows of **negative** lift:
   `requirements-elicitation/migration-one-pager-silent-on-cutover` 75.6 → 68.3,
   `prototype-spike/manifest-viewer-controls-from-the-undecided-questions` 91.5 → 80.9, and
   `doc-this/billing-module-handover-for-the-team-inheriting-it` 55.6 → 51.1. A record whose rows
   are all positive is a record that has been curated. Each is a skill making a strong baseline
   worse on one scenario, which is a lead worth keeping, not an embarrassment worth trimming.

3. **The non-activation proof.** Six probes at `tests/fixtures/activation-scenarios/`, one per live
   `WORKERS` member, each `task.md` the most tempting user phrasing for that worker — as close to
   its own description as a real user plausibly gets. They live in `tests/fixtures/`, **not** under
   `plugins/doc-this/evals/`, because anything in a plugin root's `evals/` is uploaded as that
   plugin's eval coverage and would change its published score. The run passes
   `--skip-forced-context-activation` (so activation is a real choice) and `--skip-scoring` (there is
   nothing to grade), and the result arrives in the same envelope as everything else:
   `solutions[].activation.activatedSkills` is already there. No bespoke observation mechanism was
   needed.

   **The trap, and it is the whole proof.** Tessl reports an activated skill as `tessl__<skill>`;
   the gate names it `<plugin>:<skill>`. Compare the two spellings directly and *nothing ever
   matches* — the proof passes having observed nothing, which is this repo's own fail-open family in
   a new costume. AC-2 pins the mapping and AC-11b/AC-11c canary it in both directions.
   AC-10 is the second control: a run in which every probe activated nothing makes AC-9 pass for the
   wrong reason, so "at least one probe activated something" is asserted separately. The probes
   therefore install a real fixture app rather than running in an empty directory.

   **`--context './plugins/doc-this/skills/*'` does not work** — the form §987 planned. The CLI
   answers `There were no files to send for the files you named with --context. No run was
   started.`, and charges nothing, so this is cheap to rediscover and easy to misread as a failed
   run. The context is the plugin root, `--context ./plugins/doc-this`, which is how every other run
   supplies one and still offers the agent all fourteen doc-this skills to choose between.

   **Result, first run, recorded in `tests/fixtures/activation-scenarios/RESULTS.json`: the claim
   holds.** Zero workers activated across six probes, each phrased as temptingly as its own
   description allows. Two probes — `doc-this-writer` and `doc-this-reviewer` — reached for
   `tessl__doc-this`, the orchestrator, which is the routing working rather than a violation, and
   which is also what satisfies AC-10: the other four activated nothing, so without those two the
   run would have proved nothing at all. `trigger_term_quality` being low for these six is now a
   measurement, not an excuse, and the tradeoff recorded under **Known structural tradeoffs** can be
   cited rather than asserted.

   One observation the probes did not set out to make, visible in the record beside them: **the
   plugin-root runs show `doc-this` activating no skill at all.** Every solo plugin's rows carry its
   one skill in the activated column; doc-this's three carry an empty one, with forced activation
   *on*. Its lift on those scenarios came from the injected context, not from a skill being invoked
   — which is worth knowing before reading any doc-this eval number as evidence about a doc-this
   skill.

4. **`tessl.json` has no repo-visible half.** The brief that prompted this asked for its two
   reviewer-related dependencies (`tessl/review-plugin-creator`, `tessl-labs/review-model-performance`)
   to be removed after FR-TESSL-2 dropped the reviewer fork. The file is **untracked and gitignored**
   (`.gitignore:14`) — it is maintainer-local, ships nowhere, and reaches no clone. There is nothing
   to commit; removing them locally changes no tracked byte. Recorded here so the question is not
   re-asked.

5. **What was deliberately not done.** No `RESULTS.json` is refreshed automatically, and nothing
   re-runs an eval to keep one current — that is precisely the treadmill FR-TESSL-2 got off. A row
   is written once, when a run happens, and read forever afterwards as history. `tests/` holds no
   scenario generation, no custom rubric, and no pinned model: every run reports `claude` with the
   CLI default, recorded as `model_reported` rather than requested, because an unlabelled score
   cannot be compared and a pinned one is a different measurement.

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

### FR-HOST-1 · Shared behavior with native host entry points

The public plugins must work without a personal configuration repository, global instruction
file, or Tessl installation. Claude retains its fully namespaced inline `Skill` dispatch and
existing hook registrations. Codex discovers eight standalone skills and four doc-this entry
points; its ten workers remain bundled files, loaded by native subagents through the orchestrator.
Skill instructions are shared, with host differences in progressively disclosed references.
Native Codex text invocation uses the full `$plugin:skill` name, for example `$doc-this:doc-this`;
the loader prefixes plugin skills and explicit selection matches that exact name.

Codex worker dispatch starts with `DOC_THIS_WORKER=<full-skill-name>` on the first message line.
The parent owns interactive questions and `.doc-this/state.json`; workers return results,
checkpoints, pending input, or failures. Core workers run sequentially and inherit the selected
model. Reader fan-out retains user consent and the existing three-reader maximum. Support the
native v1 and v2 tool protocols; never substitute an ungated inline run for unavailable subagents.

`hooks/codex-hooks.json` registers native hooks in doc-this and okf-maintain. Gate evaluators run
in-process behind host-specific I/O; Claude's standalone wrappers retain their behavior. Codex
records successful worker identities and checks continuations, normalizes every file in an
`apply_patch` call, and denies the whole tool call when an applicable gate refuses an edit.
Removed lines are not new content. OKF regeneration resolves the repository from each edited
file, including move source and destination, rather than the session working directory.

Author transport normalization in `scripts/lib/codex-tools.mjs`; distribute identical copies with
`node scripts/sync-host-adapters.mjs`. Installed plugins import only their own payload. The tests
reject drift, preserve Claude contracts, and exercise Codex dispatch, patches, and regeneration.
Run `node scripts/verify-native-hosts.mjs` separately for native CLI installation and loader
checks. Hook trust is a host prerequisite; do not persist trust bypasses in user configuration.

Tessl's generic hook dispatcher can translate Codex blocking output, but preserves raw patch and
worker payloads (verified with Tessl 0.109.0). Its `nativeHooks` manages installation wiring; it
does not implement this pipeline's semantics. Keep the existing Tessl distribution/review channel
optional, and do not add its runtime to native hook commands.

### FR-FARLEY-1 · A ported plugin keeps its runtime, and loses its dead links

`plugins/farley-score/` ports Bernard McCarty's MIT Farley Score plugin (the upstream `msec`,
now `cd-training-courses/farley_score_plugin`); the notice and Laforgia's methodology attribution
are in `THIRD-PARTY-NOTICES.md`. Four decisions, each a departure from the rest of this tree or
from upstream:

1. **It ships Python.** The calculator stays the upstream stdlib-only `cli_calculator.py`, run by
   `python3`. This is a scoped exception to ADR-014 granted for this plugin only — not a rule that
   a Python original may stay Python. `tests/test-farley-score-calc.mjs` owns its own 77 when
   `python3` is absent, and asserts every `scripts/*.py` a skill document names, because
   FR-CORPUS-1 scans only `.mjs` and would never see one renamed.
2. **The name is `farley-score`, never `msec`.** `msec` now names Continuous Delivery Ltd's paid
   course plugin; installing both would collide.
3. **Upstream's `/msec:tdd` and `/msec:tdd-coach` are gone.** No public source defines them, so
   they were steering into nothing; they became prose naming no tool (BUG-006 rule 1).
4. **Upstream's path lookup is gone.** `find ~/.claude/plugins -name cli_calculator.py | head -1`
   picked whichever installed copy sorted first and could not work under Codex; paths resolve
   from the installed `SKILL.md` (`references/host-runtime.md`).

Two upstream claims are recorded rather than fixed: the scoring reference promises P90 for
negative signals, while the CLI's `aggregate-file` computes a mean and its P90 variant is
unexposed (`references/calculator.md`); and `aggregate-suite` used to `zip`-truncate mismatched
inputs, which now refuses. The calculator's `--version` reads the plugin manifest.

### FR-FARLEY-2 · Jev judges signals per method; it never produces a score

`farley-score/skills/farley-score/scripts/jev_judge.py` is an opt-in step inside Phase 2. It asks
TypeSafe's Jev eight Noul questions per test method, and code turns the answers into signal counts
for the calculator's **static** leg. Six parts:

1. **Signals only, never scores.** The first design also asked Jev for five per-method 0-10
   Scores and blended them into the LLM leg. That was cut after a Codex review. Jev's own
   documentation warns against reading magnitudes between Score levels, and feeding one model into
   both legs would erase the deterministic/semantic separation the 60/40 blend rests on
   (`scoring.py:77`).
2. **Consent is per run, not per key.** The judge requires `TYPESAFE_API_KEY`, `uv` and an explicit
   yes on that run, because a global key would otherwise ship client test source off-machine.
   `SECURITY.md` names the egress.
3. **Python with a real dependency, through PEP 723.** `typesafe-sdk` is pinned inline and resolved by
   `uv run` into uv's own cache, never into the analysed project. This is part of FR-FARLEY-1's
   scoped Python exception. Pure functions (`build_questions`, `state_for`, `compose`) import
   nothing from the SDK, so `tests/test-farley-score-jev.mjs` runs on stdlib Python with no uv,
   no SDK, no network, and no key.
4. **Codex-review corrections, all kept.**
   - The "delete all production code" counterfactual became "would the assertions fail if the
     real code under test did nothing", because Jev reads literally and deleting code breaks
     imports. The first live run proved the wording matters. An earlier draft asked whether the
     assertions checked "a real production object's result", and it fired on
     interaction-verifying tests that do run production code. Those tests took N and T tautology
     penalties they had not earned. Assertions on how real code called its mocks now count as
     dependent. The corrected run's answers are recorded in
     `tests/fixtures/farley-score/jev-sample-suite.json`, and AC-9 re-runs `compose` over them.
     Result: all six planted tautologies are labelled, with 7 of 21 methods escalated.
   - Setup and fixtures are part of the state.
   - Trivial tautologies stay in regex.
   - Redundancy, test-first chronology, R, A and F are never asked of Jev.
5. **One defect counts once.** A property gains at most one Jev negative and one positive per
   method, so the three overlapping tautology questions cannot triple-count one test. Any answer in
   [0.35, 0.65], or a method sent without setup, escalates to the host model and stays out of the
   counts. AC-8 mutation-tests both the dedup and the escalation gate.
6. **Pinned `jev-1.13.0`, not `jev-latest`.** An alias move would silently change counts.

### FR-LEARN-1 · Learning capture is reachable without the lifecycle plugin

`plugins/learning-capture/` carries the capture half of a learnings system: the workflow, the three
`.learnings/` templates, the examples, the skill-extraction scaffold, and one `PostToolUse` Bash
nudge, self-gated on `.learnings/`. Scoring, surfacing and reconciliation belong to whichever
consumer reads the entries, not to this plugin. Five rules:

1. **The name is not `self-improving-agent`.** `tests/test-fr-bundle-3.mjs` asserts that directory
   absent as a core skill that left. A name that flipped that assertion would say the core skill
   came back.
2. **It names no consumer.** Its description, body, scripts and hooks never name the plugin that
   scores or reconciles entries. `tests/test-learning-capture.mjs` scans the plugin tree for those
   names, with a canary and a read-count control. `**Skill**` is still recorded as
   `<plugin>:<name>`, because a finding against any plugin's skill is recorded the same way.
3. **The entry format is a contract.** `skills/learning-capture/references/entry-format.md` states
   the grammar, and `references/fixtures/` holds one case per shape, each with an expected parse
   written by hand. A consumer vendors that corpus at a commit. The contract suite asserts count,
   ids and fields per fixture. It also runs a broken reader that must fail, because a parser that
   drops an unrecognised heading returns nothing rather than failing. `Scenario`, `Verdict` and
   `Activation` are reserved: a consumer writes them and capture never does.
4. **An absent, gitignored corpus is a decision.** `scripts/bootstrap.mjs` refuses to create
   `.learnings/` when `.gitignore` lists it and the directory is missing (exit 3), and the skill
   captures to machine-local memory instead. The rule is stated and enforced here, with no import.
5. **One hook, two hosts, no session-start hook.** Both `hooks.json` and `codex-hooks.json`
   register `hooks/error-detector.mjs` on `Bash`. Codex maps its shell to `Bash`, but sends
   `tool_response` as a bare output string with no exit code. There the nudge therefore rests on
   output patterns alone: the exit-code silence BUG-005 added cannot apply. The description is
   already read at session start, and injecting more there costs every session.

The regressions travelled with the code. The source repository's error-detector assertions
(BUG-005's exit-code and isError silence, BUG-031's subagent silence, the self-gate, fail-open, and
the nudge naming all three attribution fields) are ported to Node in
`tests/test-learning-capture.mjs`.

## Repository Structure

```
.claude-plugin/          # marketplace.json ONLY — 9 entries, each source ./plugins/<name>.
                         #   There is no plugin.json here: the repo root is not a plugin root
.agents/plugins/        # Codex marketplace.json; other .agents content remains local/ignored
scripts/
  tessl-publish.mjs      # FR-TESSL-3 — git-anchored plugin discovery + idempotent publish.
                         #   --dry-run exists because its other mode is irreversible
  eval-record.mjs        # FR-TESSL-5 — projects `tessl eval view <id> --json` into
                         #   plugins/<name>/evals/RESULTS.json. Scores are computed, never typed;
                         #   run/workspace/user ids and the local cwd are dropped. Importable
                         #   core behind an import.meta.url guard, as okf.mjs is
plugins/                 # ONE DIRECTORY PER PLUGIN (FR-LAYOUT-1). Each holds .tessl-plugin/,
                         #   .claude-plugin/, .codex-plugin/, skills/, .tesslignore, and evals/.
                         #   EVERY solo plugin carries evals/ with exactly THREE scenario dirs —
                         #   the coverage threshold that lifts the registry's 80% no-eval discount.
                         #   Named by slug, never scenario-N: a re-download merges over those.
                         #   doc-this carries three too, since 358d3ff.
                         #   RESULTS.json beside them is the run record (FR-TESSL-5) — no task.md,
                         #   so the publisher's scenario walker skips it
 doc-this/               # The reverse-engineering suite — the one plugin that bundles many skills
  .claude-plugin/        # Its plugin.json; the plugin name IS the Skill-tool prefix
  hooks/                 # All 9 doc-this gates + hooks.json + lib/. The harnesses live in tests/:
                         #   everything under a plugin root is a candidate for the pack, and a
                         #   harness outside tests/ is one the runner cannot reach
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
                           #   (no scripts/ — index generation is a Skill dispatch to okf-maintain:okf-maintain)
    doc-this-tracer/       # Optional dynamic analysis (logs/traces/error exports) — resolves 🔴 gaps
    doc-this-visor/        # Optional UI extraction from screenshots
    doc-this-data-master/  # Optional database analysis with ownership branching (owned/external/mixed/none)
      references/          # ownership-branching-guide, db-business-logic-extraction (per-engine recipes)
    doc-this-design-system/ # Optional design-token extraction (CSS/Tailwind/MUI/Chakra/styled-components)
    doc-this-help/         # Analogy-driven guide to all 12 doc-this agents
    doc-this-viewer/       # Optional user-triggered browser viewer for doc-this output (NOT a pipeline worker)
      app/                 # Svelte+Vite SOURCE (committed for maintenance)
      assets/viewer/       # PREBUILT static SPA served at runtime (no npm install for the user).
                           #   NOT named dist/ — tessl's packer silently drops that name (FR-TESSL-3)
      scripts/             # build-manifest.mjs, serve.mjs + launch.mjs (localhost server), build.mjs, test harness (all zero-dep Node)
      references/          # manifest-schema.md (viewer-manifest.json contract)
 airflow-dags/           # Apache Airflow 3 DAG authoring with 12 reference docs
  skills/airflow-dags/   # SKILL.md + references/ (authoring, scheduling, testing, etc.)
 agent-cli/              # Build and evaluate CLIs for AI agent consumption
  skills/agent-cli/      # SKILL.md + references/ (command design, output design, input security,
                         #   discoverability, composability, agent knowledge, scoring rubric,
                         #   framework patterns)
 human-cli/              # Design and evaluate CLIs for human users
  skills/human-cli/      # SKILL.md + references/ (ergonomics, visual output, interactive input,
                         #   help docs, performance, polish, human rubric, framework UX patterns)
 platform-sre-kubernetes/ # SRE-focused Kubernetes production deployments and manifest review
 requirements-elicitation/ # Analyze PRDs/specs for gaps, generate clarifying questions, assess risk
  skills/requirements-elicitation/ # SKILL.md + references/ (elicitation framework, question templates)
 prototype-spike/        # Requirement prototypes that double as design spikes — one self-contained
                         #   HTML file, high-fidelity rebuild from the app's own source,
                         #   controls = the open questions (FR-PROTO-1)
  skills/prototype-spike/
    SKILL.md             # Thesis + 3 fidelity axes (UI/token/data) + ANCHOR->HARVEST->FRAME->BUILD->DRIVE->CLOSE + 13 hard rules
    references/          # anatomy, ui-fidelity, harvest-playbook, control-derivation, fidelity-tiers, verification, exemplar walkthrough
 okf-maintain/           # Adopt and maintain an Open Knowledge Format v0.2 doc bundle — frontmatter,
                         #   chained root indexes, no log.md / no in-doc history (git owns it),
                         #   agent-entry wiring (FR-OKF-1)
  hooks/                 # The plugin's one hook, auto-loaded via hooks/hooks.json
    okf-index-regen.mjs  # PostToolUse Write|Edit — regenerates an adopted bundle's index.md files
                         #   from the EDITED file's repository; refuses on version skew, foreign
                         #   indexes, unadopted repos, .okfignore hits (FR-OKF-6)
  skills/okf-maintain/
    SKILL.md             # Profile-manifest reading + the two workflows (adopt / maintain)
    references/          # frontmatter (field families, actors, trust tiers), index-format (frozen grammar), adoption
    scripts/             # okf.mjs — zero-dep Node (runs on node/bun/deno), importable core plus a
                         #   guarded CLI; `index` (generate, every tracked .md listed, minus plugin
                         #   payload) / `check` (§11, fail-closed frontmatter reader, no YAML lib) /
                         #   `coverage` (git ls-files vs the indexes, crediting only ones the root
                         #   index reaches — FR-OKF-5) / `wire` (entry blocks). Rows pointing at a
                         #   document git will not commit are named dangling-row (FR-OKF-6). A
                         #   declared profile is reported, never a refusal (FR-OKF-3);
                         #   commands//agents//skills/ at a plugin root belong to Claude Code and
                         #   are pruned (FR-OKF-4). Renders TWO dialects from one generator, chosen
                         #   by the manifest's required_keys, and adopts a retired-marker catalog
                         #   only where every concept document is expressible (FR-OKF-7)
 farley-score/           # Test-quality scoring against Farley's 8 Properties (FR-FARLEY-1) — a port
  skills/farley-score/   # Read-only reviewer: signals per method, static+semantic legs, Farley Index
    scripts/             # cli_calculator.py + core.py + scoring.py — stdlib Python, the ONLY place
                         #   the index is computed. The one non-Node runtime in the tree
    references/          # scoring rubric, signal patterns, report format, calculator, host-runtime
    assets/examples/     # upstream's deliberately flawed sample suite + its report (demo, quizzes)
  skills/farley-score-coach/ # Socratic coach; reads farley-score's references by relative path
 learning-capture/       # Structured .learnings/ capture (FR-LEARN-1); no scorer, names no consumer
  hooks/                 # error-detector.mjs on PostToolUse Bash, registered for Claude and Codex
  skills/learning-capture/
    references/          # entry-format.md (THE contract) + fixtures/ (hand-written expectations),
                         #   examples, host-runtime
    scripts/             # entries.mjs (reader + next-id), bootstrap.mjs (absent-by-decision),
                         #   extract-skill.mjs
    assets/              # the three corpus templates
 postmortem/             # Production-incident postmortems — numbered spine, machine-readable frontmatter
  evals/                 # postmortem-checkout-latency-spike — the first tessl eval scenario.
                         #   Inside the plugin root, so `tessl eval run ./plugins/postmortem`
                         #   supplies the plugin as context with no --context flag
  skills/postmortem/
    SKILL.md             # Machine contract (frontmatter severity, finding-id stability) + per-section discipline + evidence rules
    references/          # full-template (long form), quick + Investigation variants
tests/                   # Repo-level harnesses owned by no plugin
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
  test-shipped-names-resolve.mjs # FR-CORPUS-1 — every .mjs the shipped INSTRUCTION text names
                         #   resolves, and every marker it stamps is imported from okf.mjs. Scoped
                         #   to .md/.json on purpose: okf.mjs is inside the corpus and legitimately
                         #   carries the retired name, so a naive scan reports the oracle as a defect
  test-no-shell-invocation.mjs  # the viewer launcher opens a URL on darwin/linux/win32 without
                         #   a shell, plus a repo-wide scan: no .mjs reaches one
  test-suite-discovery.mjs # no tracked test-*.mjs sits outside tests/ — the invariant that makes
                         #   run-all.mjs's single discovery rule sufficient. Canaried both ways
  test-eval-record.mjs    # the eval record + the non-activation proof (FR-TESSL-5). Zero credits:
                         #   it asserts the projection is self-consistent, carries no id, and that
                         #   no WORKERS member activated — reading WORKERS from the gate, never
                         #   restating it. AC-10 is the control: a run where nothing activated
                         #   proved nothing
  fixtures/activation-scenarios/ # six probes, one per live Discovery worker, each task.md the most
                         #   tempting user phrasing for it. NOT under plugins/doc-this/evals/ —
                         #   anything there is uploaded as that plugin's coverage
  test-doc-this-*-gate.mjs # the 5 doc-this gate harnesses (artifact-completeness, checkpoint,
                         #   coverage, describe-only, dispatch). They live HERE, not beside the
                         #   gates: FR-LAYOUT-1 moved the plugin and left the runner's probes
                         #   pointing at the old path, so all of them went unrun and CI stayed
                         #   green over the hole
  test-doc-this-backfill-coverage.mjs  # the doc-this skills' own script harnesses, moved out of
  test-doc-this-cross-review.mjs       #   the payload for the same reason; each anchors its
  test-doc-this-build-manifest.mjs     #   subject on the repo root, never on its own directory
  lib/tessl.mjs           # reviewScoreFrom / reviewIdFrom / resolveTessl / workspaceFrom — the
                         #   parsing and resolution rules the tessl harnesses share
  test-tessl-score-parse.mjs # those rules, asserted with no account and no credits. AC-3 pins
                         #   that reviewScore 0 is a score; AC-7 mutation-checks it
  test-eval-scenarios.mjs # eval scenario shape + AC-6b, which REPRODUCES `tessl eval lint`'s
                         #   fail-open (a dir without task.md lints green) so the guard can't be lost
  fixtures/tessl/         # real 0.105.0 review envelopes, ids replaced, judge prose elided
  test-tessl-quality-gate.mjs
  test-tessl-publish.mjs  # the publish manifests + discovery AC matrix (FR-TESSL-3). AC-2/AC-7a
                         #   canary that a gitignored vendored manifest is NEVER discovered
                         #   (no score record here any more — the registry page is the score of
                         #   record; FR-TESSL-2 says why the generated one was removed)
.github/                 # CI (test.yml: ubuntu + macOS, both blocking) + templates
                         #   tessl-publish.yml — push-to-master only; the ONLY route that may
                         #   publish, because a CLI publish makes a duplicate (FR-TESSL-3)
CONTRIBUTING.md          # Contributor entry point: prereqs, version-bump rules, skill conventions
LICENSE                  # MIT — matches the "license" field in every .claude-plugin/plugin.json
THIRD-PARTY-NOTICES.md   # MIT notices for Svelte + marked (compiled into the viewer's bundle)
README.md                # Public entry point: per-plugin install, the plugin table, dev commands
SECURITY.md              # Reporting address + what the hooks and skills do locally vs off-machine
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
- **Describe-only pact** — the canonical policy at `plugins/doc-this/skills/doc-this/references/describe-only-pact.md` mandates that every Discovery agent documents what exists and never proposes, judges, or invents. No technical-debt registers, no fabricated ADR Alternatives/Consequences, no NFR inference from middleware/timeout patterns, no bug labels. The pact is multilingual: rules apply by **meaning** across whatever language `doc_language` selected (en, pt-BR, or other) — mechanical enforcement is best-effort en + pt-BR; semantic enforcement is the real gate.
- All orchestration prompts in English; spec output language follows `doc_language` (English and pt-BR are the exercised paths)
- Output staged in `.doc-this-sdd/` (hidden + auto-gitignored on first run, beside the `.doc-this/` state dir) so a normal coding session never mistakes unpromoted specs for real docs — agents are non-destructive
- `doc-this-promote` is the ONLY skill that writes to `docs/` — one bridge into the SDLC tree, so Discovery output can never be confused with hand-authored requirements
- **Promoted output is born OKF-conformant** (FR-DOC-OKF-1) — promote stamps frontmatter (`id`/`type`/`status: Documented`/`description` + `adrs`/`specs` relation keys; `Done` is reserved for observed-GREEN acceptance runs — reverse-engineered specs describe behavior, they do not verify it), silently bootstraps `docs/okf.yaml` in legacy repos (never with `traceability: generated`), regenerates per-folder/root `index.md` by dispatching `okf-maintain:okf-maintain` — the skill that owns the OKF index grammar and ships the generator — appends curated TRACEABILITY rows, and suggests `docs(FR-NNN)` commits
- Public/private API classification (Detective) — only public APIs get `@api` ATDD scenarios; private APIs covered transitively via `@browser`/`@cli`
- Database ownership branching (Data Master) — `owned` / `external` / `mixed` / `none` flows through every downstream agent; `external`/`mixed` produces `@database` scenarios with `IDatabaseContractDriver` interfaces
- Schema-versioning gate (Reviewer) — refuses coverage completion when schema is unversioned and no baseline DDL exists
- **Binary confidence** on every claim: 🟢 CONFIRMED (with citation) / 🔴 GAP (recorded in `questions.md`). 🟡 INFERRED is **retired** — pattern-based guesses do not produce facts; either find direct evidence (🟢) or record a gap (🔴).
- **Total Source Coverage** (BUG-003) — a 🔴 must be *earned by reading*: it records what the repository cannot answer, never what the pipeline did not read. Scout emits a deterministic `file-manifest.json` (every file classified source/vendored/generated/binary; markup IS source); the Code Analyst routes every source file by subclass (markup/SQL/other = full Read; LSP only accelerates code files) and appends to an append-only `coverage-ledger.json` with a file-level resume cursor; the Architect emits `kind:ui` entries one-per-page; the Writer's `code-spec-matrix.md` is manifest-driven; the Reviewer hard-REJECTs ledger/manifest mismatches, sampling phrases, grouped UI entries, and spot-checks gaps for answers sitting in unread files. `doc-this-coverage-gate.mjs` enforces it mechanically at phase transitions; `--backfill-coverage` migrates legacy runs. Token pressure is absorbed by checkpoint-and-resume, never by skipping. On large codebases the Code Analyst may also, with explicit user consent, fan out the reading to ≤3 `model: sonnet` reader subagents (FR-DOC-FANOUT-1) — it stays the merger and single ledger-writer while readers only transcribe to staging under `.doc-this-sdd/.analyst-staging/`; the shared protocol lives in `plugins/doc-this/skills/doc-this/references/sonnet-reader-fanout.md` and is reused by `--backfill-coverage` (zero hook changes — readers are Agent dispatches the dispatch gate ignores, and the describe-only gate fires on their staging writes).
- **Evidence provenance + fossil-evidence path** (FR-DOC-FOSSIL-1) — every 🟢 scenario carries an `Evidence:` line (`static` from the Writer; the Tracer's corroboration sweep upgrades telemetry-matched scenarios to `static + runtime (<artifact cite>)`); the Reviewer validates the format and reports per-unit corroboration rates in `confidence-report.md`; promote carries the line into `.feature` stubs as `# Evidence:` comments. Confidence stays binary — Evidence is provenance metadata on facts, never a third color. `state.json.legacy_runnable` (`yes`/`prod-only`/`no`, collected at first run) makes the Tracer **hard-advisory** when the system can't be run live, and the Data Master mines actual data distributions (`database/data-profile.md`) as fossil runtime evidence.
- Mechanical enforcement: the `doc-this-describe-only-gate.mjs` PreToolUse hook on Edit|Write blocks pact violations (🟡, judgment phrases en + pt-BR, fabricated ADR sections, technical-debt headers, NFR-from-pattern phrases) when targeting `.doc-this-sdd/**` — the staging tree only (BUG-005). The promoted `docs/` tree (requirements/adr/bugs) is the shared SDLC namespace co-owned by forward-design work (legitimate `## Consequences`/`## Alternatives`, "should be" requirements, bug reports) and is deliberately NOT policed; promote copies from already-gated staging. Per-artifact escape: `<!-- DOC-THIS-EXEMPT : reason="..." -->`. Per-session: `/tmp/.claude-doc-this-bypass-${CLAUDE_SESSION_ID}`.

**To use**: `/doc-this` in any legacy project. The orchestrator handles first-run handshake (project name, language, doc level, database context) and dispatches the pipeline.

**For an analogy-driven guide to all 12 agents**: `/doc-this-help`.

## Plugin Convention

- **Plugin root**: `plugins/<name>/` — every plugin, both channels (FR-LAYOUT-1)
- **Plugin manifests**: `plugins/<name>/.claude-plugin/plugin.json` and
  `plugins/<name>/.tessl-plugin/plugin.json`, carrying the SAME version
- **Marketplace**: `.claude-plugin/marketplace.json` at the REPO root, one entry per plugin with
  `"source": "./plugins/<name>"`. There is no `plugin.json` beside it — the repo root is not a
  plugin root
- **Hooks**: `plugins/<name>/hooks/hooks.json` — auto-loaded, never reference in plugin.json
- **Skills**: `plugins/<name>/skills/<skill>/SKILL.md` — one SKILL.md per skill folder
- **Commands**: `commands/<name>.md` — slash-command wrappers; auto-discovered, never reference in plugin.json. **Caveat**: in current Claude Code (verified 2026-05-31), if a plugin contains both a skill named `X` and a command named `X`, the bare `/X` slot stops resolving in the slash autocomplete — only the namespaced `/<plugin>:X` works. (The command does NOT take the bare slot; the collision suppresses it entirely.) For pure passthrough wrappers (`Invoke the <plugin>:X skill via the Skill tool. Pass through $ARGUMENTS`), this means **adding the command file makes the skill LESS reachable, not more**. Skills auto-expose at the bare `/X` path when no same-name command file exists — which is why `commands/doc-this.md` was removed (2026-05-31) so `/doc-this` resolves bare like its command-less siblings — and why `commands/doc-this-promote.md` was removed (2026-08-23) for the same reason, one sweep late. **No plugin here ships a `commands/` directory; every slash entry point is a bare skill.** When this rule is applied, sweep *every* passthrough wrapper in the tree, not just the one that was reported.
- **Script paths**: Use `${CLAUDE_PLUGIN_ROOT}` in hooks — resolves to install location

### Commands vs skills

- A **skill** is invoked by Claude (auto-trigger on description match, or via the Skill tool).
- A **slash command** is invoked by the user typing `/<name>`.
- **Empirical behavior (verified 2026-05-10):** Skills auto-expose as bare `/<name>` in the slash autocomplete when no same-name command file exists — examples in this plugin: `/doc-this-scout`, `/doc-this-code-analyst`, `/doc-this-detective`, etc., all reachable bare with `(doc-this)` attribution. Adding a `commands/<name>.md` file forces the skill to namespaced-only `/<plugin>:<name>`. The earlier guidance ("a command file is *required* for `/<name>` to work") was incorrect — keep command files only when they add real logic beyond `Invoke ... Pass through $ARGUMENTS` (e.g., model selection, multi-step bash, references that the skill itself doesn't pull in).
- **When you DO need a command file**: it owns the bare slot. Skills with the same name retreat to the namespaced form. Plan accordingly.
- **Argument passing for bare-slash skills**: skills invoked via the bare `/<name>` slot still receive the rest of the user's input as conversational context — the Skill tool pattern handles it. If a skill needs strict argv-style parsing (`--resume`, `--regenerate=<phase>`), test the bare form with that exact invocation before deleting any wrapper command file that previously declared `argument-hint`.

### When dispatching from one skill to another

Use the **fully namespaced name** with the Skill tool — the prefix is the **plugin** name, not the repo: `doc-this:<name>` for anything in the Discovery pipeline, and for a solo plugin the prefix and the skill are the same word — `postmortem:postmortem`, `okf-maintain:okf-maintain`, `agent-cli:agent-cli`. Bare short names will not resolve. The `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` file-read path is a fallback only for non-Claude-Code harnesses.

### Description classes: user-triggered vs orchestrator-dispatched

Two contracts, two description shapes:

- **User-triggered skills** (orchestrator `/doc-this`, bridges `doc-this-promote`/`doc-this-help`, optional agents tracer/visor/data-master/design-system, and every standalone skill): pushy descriptions with explicit user trigger phrases, per skill-creator guidance.
- **Orchestrator-dispatched workers** (Discovery: scout, code-analyst, detective, architect, writer, reviewer): called **objectively** by their orchestrator via the Skill tool with the exact namespaced name — never by circumstantial user phrasing. Their descriptions carry the canonical dispatch-contract sentence ("Dispatched programmatically by <orchestrator> after <predecessor> — never auto-triggered by user phrasing; direct '/<name>' is for resume/debug…") plus NOT-for disambiguation clauses. **Never add user-intent trigger keywords to a worker** — a worker auto-triggered outside its pipeline runs unanchored (no manifest, no ledger, the ordering gates no-op without state) and reproduces the BUG-003 failure mode.
- Frontmatter flags cannot express this contract (docs-verified 2026-06-10): `disable-model-invocation: true` blocks ALL model invocation including the orchestrator's Skill-tool dispatch ("Claude can invoke: No"); `user-invocable: false` does not stop description-based auto-triggering. Enforcement is therefore mechanical: `hooks/doc-this-dispatch-gate.mjs` denies worker activation when the pipeline anchor is missing.
- Subagent (`agents/*.md`) conversion was evaluated and rejected for the workers: plugin agents are also description-auto-delegated, cannot pause for user input mid-run (the pipeline's checkpoints/handshakes are interactive), and plugin-provided agents ignore `hooks`/`mcpServers`/`permissionMode` frontmatter.

### Pipeline enforcement hooks

The doc-this pipeline is enforced by the hooks below (wired in `plugins/doc-this/hooks/hooks.json`, scripts in `plugins/doc-this/hooks/`, shared lib in `plugins/doc-this/hooks/lib/doc-this-checks.mjs`). They ship with the `doc-this` plugin, so they exist only while it is enabled. All are no-ops in projects that don't use doc-this (i.e., have no `.doc-this/state.json`) — EXCEPT the dispatch gate, which exists precisely to fire in that case for pipeline workers.

| Hook script | Event | What it blocks |
|---|---|---|
| `doc-this-dispatch-gate.mjs` | `Skill` | **Unanchored Discovery worker activation**: the 7 Discovery workers (incl. legacy `doc-this-archaeologist` name) denied when `.doc-this/state.json` is absent in cwd. Workers are dispatched objectively by `/doc-this` — circumstantial activation would run them without manifest/ledger/gates (BUG-003 failure mode). `/doc-this`, promote, help, optional agents, and non-pipeline skills pass through. Runs FIRST in the Skill matcher. Harness: `tests/test-doc-this-dispatch-gate.mjs` (11 cases). |
| `doc-this-phase-gate.mjs` | `Skill` | `doc-this:doc-this-code-analyst` activation (legacy alias `doc-this-archaeologist` also matched) when `state.json.doc_level` or `state.json.database_ownership` is null. Hard deny (`exit 2`). |
| `doc-this-checkpoint-gate.mjs` | `Skill` | Any `doc-this:doc-this-<agent>` activation when the predecessor phase has no checkpoint in `state.json.checkpoints` (legacy key `archaeologist` accepted alongside `code_analyst`). Optional agents (tracer, visor, data-master, design-system, promote, help) exempt. Hard deny. |
| `doc-this-coverage-gate.mjs` | `Skill` | **Total Source Coverage** (BUG-003) at phase transitions, derived from `.doc-this/context/file-manifest.json`: detective denied while any manifest `source` file is missing from `coverage-ledger.json` or unassigned (no `all_files`/`exclusions` home); writer denied while any manifest markup page lacks a per-page `kind:ui` entry in `external-surface.json`; reviewer denied while `code-spec-matrix.md` misses source-file rows. Legacy runs (no manifest) get an advisory pointing at `/doc-this --backfill-coverage` — never denied. Hard deny (`exit 2`), capped 20-path lists, `Set`-difference set math. Regression harness: `tests/test-doc-this-coverage-gate.mjs` (15 cases). |
| `doc-this-artifact-completeness-gate.mjs` | `Skill` | **Per-module doc_level artifact completeness** (BUG-004) at the analysis→interpretation transition (`doc_level ∈ {standard, detailed}`): detective denied while any `modules.json` module with entities lacks a non-empty `data-dictionary/[module].md`, or with functions/algorithms lacks `flowcharts/[module].md`. `doc_level=minimal` passes; legacy runs (no `modules.json`) get an advisory. Hard deny (`exit 2`). Regression harness: `tests/test-doc-this-artifact-completeness-gate.mjs` (14 cases). |
| `doc-this-promote-warning.mjs` | `Edit\|Write` | Nothing — advisory only. Injects `additionalContext` when the staging tree (`.doc-this-sdd/`, or legacy `_doc_this_sdd/`) exists and the target is `docs/requirements/*.md`, `docs/adr(s)/*.md`, or `docs/TRACEABILITY.md`. |
| `doc-this-describe-only-gate.mjs` | `Edit\|Write` | Pact violations in `.doc-this-sdd/**` **only** — the staging tree where the agents write (BUG-005; legacy `_doc_this_sdd/**` is still matched for in-flight runs). The promoted `docs/` tree (requirements/adr/bugs) is the shared SDLC namespace co-owned by forward-design work and is NOT policed (a forward ADR's `## Consequences`, a "should be" requirement, and bug files are all legitimate there); promote copies from already-gated staging, so nothing is lost. The regex layer is an **English tripwire, not the rule**: 🟡 markers (language-independent), judgment verbs at line start (`should be / recommend / propose / consider refactoring / better approach`), Technical-debt headers, fabricated ADR sections (`Alternatives considered / Consequences`), NFR-from-pattern phrases (`inferred from middleware`), and sampling-phrases disclosing unread source (`not read in full / read by sampling / skimmed`). Output written in another `doc_language` is caught by **meaning**, by the agents applying the pact — the regex deliberately no longer carries per-language word-lists, because a literal list silently passes every phrasing outside it. Per-artifact escape via `<!-- DOC-THIS-EXEMPT : reason="..." -->`. Best-effort safety net — primary enforcement is the agents' semantic application of `plugins/doc-this/skills/doc-this/references/describe-only-pact.md`. Hard deny (`exit 2`). Regression harness: `tests/test-doc-this-describe-only-gate.mjs` (24 cases). |
| `doc-this-lsp-budget.mjs` | `LSP` (PreToolUse) | Per-agent, per-operation LSP call budgets. The Code Analyst gets unlimited `documentSymbol` but near-zero `incomingCalls` (5) since that's Detective's job. Soft limits at ~50% inject advisory; hard limits deny (`exit 2`). Tracker: `os.tmpdir()/.claude-doc-this-lsp-${SESSION_ID}.json` (a legacy `/tmp` tracker from an in-flight pre-port session is still read). |
| `doc-this-lsp-timing.mjs` | `LSP` (PostToolUse) | Nothing — advisory only. Tracks per-call duration, warns on slow calls (>15s) and cumulative LSP time (>5min). Logs to `~/.claude/logs/doc-this-lsp.log`. |

**Bypass**: `touch /tmp/.claude-doc-this-bypass-${CLAUDE_SESSION_ID}` in a prior turn (the same marker name under `os.tmpdir()` is also honored — that is the portable form denial messages advertise, and the only one that exists on native Windows). Inline `SKIP_*` env vars do NOT work — Claude Code spawns the hook in a separate process so the env var never reaches it. Per-session marker file is the only reliable bypass.

**Logs**: `~/.claude/logs/doc-this-gates.log`. Format: `TIMESTAMP | VERSION | SESSION | PROJECT | DECISION | TARGET | REASON | DUR_S`. One line per decision (allow/deny/advise/exempt/skip).

**Adding a new hook**: write a zero-dep Node `.mjs` script under `hooks/` (only `node:fs`/`node:path`/`node:os`/`node:url`), import the canonical I/O helpers from `hooks/lib/doc-this-checks.mjs` (`readHookInput`, `parseInput`, `bypassActive`, `bypassHint`, `statePath`, `resolveProject`, `stateField`, `log`, `allow`, `deny`, `advise`, `advisePost`, `lspTrackerPath`, `phaseToAgent`, `failOpen`), wrap the body in `failOpen(main)`, append a `node "${CLAUDE_PLUGIN_ROOT}/hooks/X.mjs"` command to `hooks/hooks.json`, `chmod +x` the script (verify `git ls-files -s` shows `100755`). Node ≥18 required; hooks fail-open if `node` is missing (command error → non-blocking) or the script throws. Its harness is a zero-dep `.mjs` too — the tree is shell-free — and it belongs in `tests/`, never beside the hook: everything under a plugin root is a candidate for the pack, and `tests/test-suite-discovery.mjs` fails on a harness the runner cannot reach.

## Adding a New Skill

A standalone skill is a new **plugin root**, not a folder inside an existing one.

1. `plugins/<name>/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`)
2. `plugins/<name>/.tessl-plugin/plugin.json` (`name: wagneripjr/<name>`, `version`,
   `description`, `private: false`; **no `skills` key** — convention discovery finds `./skills/`)
   and `plugins/<name>/.claude-plugin/plugin.json` carrying the same `version`
3. `plugins/<name>/.tesslignore` naming `evals/`
4. A `.plugins[]` entry in `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`
5. Supporting files under the skill folder: `references/`, `scripts/`, `assets/`
6. Hooks, if any, in `plugins/<name>/hooks/hooks.json` — plugin-level, never inside `skills/`
7. Add the name to `PUBLIC_8` in `tests/test-fr-bundle-3.mjs` (an allowlist, deliberately)
8. Commit and push — the Action publishes to Tessl; marketplace users run
   `claude plugin marketplace update` to sync

## SKILL.md Writing Rules

- **Description** (frontmatter): Third-person, pushy — list all trigger conditions explicitly. **Hard limit: 1024 characters** — the review's `description_field` validation aborts above this, skipping both LLM judges and returning `reviewScore: 18` with no useful feedback. Verify before any other review iteration: a wordy `Triggers on '...', '...'` + multi-clause `NOT for ...` description hits 1024 fast.
- **Body**: Imperative/infinitive form ("Log to..." not "You should log to...")
- **Target**: 1,500–2,000 words body; offload heavy reference to bundled files
- **Explain why**: Every instruction should make clear why it matters
- Use `skill-creator:skill-creator` to test, evaluate, and iterate on skills

## Testing Skills

Author and iterate through `skill-creator:skill-creator`. **Measure** with Tessl evals — write
scenarios under `plugins/<name>/evals/<scenario>/` and run `tessl eval run ./plugins/<name>`, which
supplies the plugin as context with no `--context` flag. See **Evals** below for the layout, the
`eval lint` fail-open, the coverage threshold, and the budget.

**Three scenarios per skill is the floor, not a nice-to-have** — below three the registry discounts
the published score and the search ranking with it. All nine plugins now carry exactly three,
`doc-this` included since `358d3ff`. Note what that does and does not buy: the threshold counts
scenarios **per plugin**, so `doc-this`'s three cover a bundle of fourteen skills and the registry
is satisfied while twelve of them have never been exercised by an eval. The discount is lifted; the
measurement is not there. Its workers are dispatched by exact name and need a legacy-codebase
fixture, so per-worker scenarios remain a real design problem rather than an afternoon — the
`tests/fixtures/activation-scenarios/` probes (FR-TESSL-5) exercise their *routing*, deliberately
outside `evals/` and deliberately unscored, and are not a substitute.

The older method — prompts in `plugins/<name>/skills/<name>/evals/evals.json`, run with and without
the skill in parallel subagents, judged by eye — is gone, not merely superseded. Both remaining
files were deleted on 2026-09-07 once real scenarios existed. They were unrepeatable, produced no
comparable number, and — the part that finally settled it — contributed **nothing to eval
coverage**, so keeping them meant paying the registry's discount while believing the skill was
measured. `tests/test-fr-proto-1.mjs` AC-8 used to count `prototype-spike`'s prose assertions and
now asserts the scenario threshold instead. Do not reintroduce the format.

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
2. `mcp__tessl__review_run` — `path: ./plugins/<plugin-name>`, `kind: "quality"`. Async: returns a
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
node tests/test-tessl-quality-gate.mjs ./plugins/<plugin-name> 90
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

### Prices, measured 2026-09-04 on the Team plan

| Thing | Credits |
|---|---|
| `review run quality` | **10** |
| `review run quality`, served from cache | **0** — `credits: null`, `metadata.reusedFromReviewRunId` |
| `review run security` (Snyk) | **0** |
| `review fix --max-iterations 1` | **100** (2026-08-23) |

**The cache is not content-addressed — a re-review after an edit needs `--force`.** Measured
2026-09-04: `agent-cli`, `human-cli` and `airflow-dags` were re-reviewed straight after commit
`8160b4e` rewrote their SKILL.md bodies (126 insertions, 95 deletions) and renamed their
`reference/` directory, and all three came back **reused, 0 credits, byte-identical scores**. The
earlier wording here said cached-means-unchanged; it does not. A refresh without `--force`
returns a score for the *old* bundle, at no cost, and looks exactly like a pass.

`tessl org usage --json` reports `credits.{limit,used,remaining,resetsAt,overageAllowed}`, free.
Team plan: 5000/window, **overage still not allowed** — work simply stops. Read it before and
after anything paid; the delta is the real price. `--review-plugin` (custom rubric) needs a paid
plan and is therefore available, but **this tree no longer carries one** — the local fork was
removed under FR-TESSL-3, because a published registry score is always Tessl's standard rubric and
a custom one could never move it. There is no local quality bar; the bar is the registry number.

**A publish-time review is free, and it lands only on the registry.** `reviewing-skills.md`:
*"When you publish a plugin to the registry, Tessl lints and reviews it automatically, and the
score appears on the registry."* Measured 2026-09-07: nine plugins covering 22 skills published
with `credits.used` unchanged at 1484.46. That is the cheap way to get a score, and the only way to
get the *published* one — but it produces no row in `tessl review list --mine`, which is why no
local score record can be kept current for free (FR-TESSL-2).

Every skill now uses `references/` **plural**, the name tessl's packer and the validation check both
recognise. `agent-cli`, `human-cli` and `airflow-dags` were the last three on `reference/` singular,
which made their files invisible to the bundle and produced a false-low `progressive_disclosure`;
a `progressive_disclosure` score on those three from before the rename is not comparable to one
after it.

**"MCP and CLI scores are not one scale" is settled: they are one scale, and the gap was noise.**
Measured 2026-09-04 on `okf-maintain`, unchanged bytes, same rubric: **87, 91, 91**, with
`conciseness` moving 2↔3, `progressive_disclosure` 4↔5 and `specificity` 4↔5 between runs. The
2026-08-23 MCP-89-vs-CLI-93 gap sits inside that spread, so it never needed two scales to explain
it. Consequence, and it is the part that matters: **a single run is not a measurement.** Any
recorded delta smaller than about 5 points — every "regression" and "improvement" the old
score prose carried — is indistinguishable from judge noise.

Fix any criterion scoring below 3/3 unless it's an intentional design tradeoff (document why) — and
confirm it with a second run first. Per-dimension scores move ±1 between identical runs, so a single
low dimension is a hypothesis, not a finding. `airflow-dags` scored `workflow_clarity` **3** on
2026-09-04 and **4** on the next run; it was never worth chasing.

**Scores live on each plugin's registry page.** Nothing in this repository records one, and no
prose here may restate one (FR-TESSL-2).

**Known structural tradeoffs (do not chase):**
- `descriptionJudge.trigger_term_quality` is **low-by-design for orchestrator-dispatched workers** (see "Description classes" above) — they are invoked by exact name, not by user phrasing; expected score 1–2. Never add user-intent keywords to lift it: that creates unanchored-run risk (the 2026-06-10 architect episode — keywords added to chase the judge had to be reverted). **No longer an assertion**: measured under FR-TESSL-5 — six probes, each the most tempting user phrasing for one worker, activated zero workers; two reached the orchestrator instead. `tests/fixtures/activation-scenarios/RESULTS.json` is the record and `tests/test-eval-record.mjs` re-checks it for free.
- `contentJudge.conciseness` may stay 2 (or 1 for doc-this-code-analyst) where inline commands and restated discipline rules are load-bearing for actionability=3. Verify judge claims before reacting (e.g., judge line-count assertions have been wrong).
- `validation.relative_links` on **okf-maintain** flags a missing `index.md`. It is a false positive and must not be "fixed": the link sits inside a fenced block quoting `okf.mjs`'s `ENTRY_BLOCK` verbatim, `tests/test-okf-maintain.mjs` AC-17 pins that quote byte-identical to what the script writes, and the link is relative to the *target* repo — it can never resolve from the skill directory. Editing it breaks AC-17 and makes the doc lie about what `wire` emits. The same block is quoted in `references/adoption.md` and carries the same warning.

## Evals

A review grades the skill; an **eval** grades its *effect*. `tessl eval run` solves each scenario
twice — baseline and with the skill injected — and scores the difference against a per-scenario
rubric. That delta is what the skill is worth, and it replaces the old
`evals/evals.json` + parallel-subagents + eyeball method as the measurement of record.

**Never invoke a bare `tessl eval`.** It is not a command group that prints its subcommands the way
`tessl scenario` and `tessl project` do — `run` is its default subcommand, so `tessl eval` resolves
to `tessl eval run` with `<source>` defaulting to `.` and **submits a real, billed run**. Measured
2026-09-07: exactly 10 credits, and from the repository root it buys nothing at all, because the
root is not a plugin root and the run comes back `arms: [{label:"baseline", includeContext:false}]`
— baseline only, no context, nothing compared. There is no `eval cancel`. Read the surface with
`tessl eval run --help`, never by probing the group.

**Eval coverage is not optional cosmetics — its absence is a scored penalty.** From the Tessl web
changelog, 2026-05-13: *"tiles and skills with no eval coverage now show an adjusted score: 80% of
the review-based score at zero evals, ramping to full weight at three or more. Search ranking and
score badges reflect this change."* So the number on a registry page is still the **review** score
— an eval never produces a score of its own — but a skill with no scenarios is displayed at 80% of
it and ranked lower in search. **Three scenarios per skill** is the threshold that clears it, which
is why the target here is three and not one. Three steps get there and all three are required:
scenarios in `plugins/<name>/evals/`, **no `--skip-evals`** on publish, and a version bump, because
the registry is version-keyed and an unbumped publish uploads nothing.

A second cap sits beside the credit cap: **300 evals per day**, printed by the CLI as
`Daily eval usage: N/300`.

### Layout — inside the plugin root it grades

```
plugins/<name>/evals/<scenario>/
  task.md        # the ONLY thing the agent sees
  criteria.json  # {context, type:"weighted_checklist", checklist:[{name,description,max_score}]}
  resources/     # optional, auto-copied into the working dir
  scenario.json  # optional; fixtures: directory | commit, plus include[] / setup[]
```

This is the layout the docs give for a repository holding several plugins — *"put `evals/` inside
each plugin root, as a sibling of `.tessl-plugin/`"* — and it is what makes
`tessl eval run ./plugins/<name>` supply the plugin as context with no `--context` flag. The
troubleshooting page attributes *"baseline results only, no with-context column"* to `evals/` not
sharing a plugin root, which is precisely what the old repo-root placement was.

**The don't-feed-the-judges rule still holds, and `.tesslignore` is what enforces it.** A quality
review bundles the whole plugin, so an `evals/` inside one would be uploaded to the judges as part
of the thing it grades — verified, not theoretical: the packs shipped `evals/evals.json` and the
whole `judgment-fixture/` app until `.tesslignore` stopped them. Every plugin root therefore
carries a `.tesslignore` naming `evals/`, and `tests/test-tessl-publish.mjs` AC-5 asserts it.
Confirmed by packing all nine and reading the archives: no `evals` path in any of them.

**That rule and uploading scenarios are not in tension, which is the non-obvious part.** Publishing
reads `evals/` through the *same scenario reader* `tessl eval lint` uses, never through the pack —
read out of the 0.105.0 binary, where the publish path takes an `evalsDir` and calls the scenario
walker on it directly, then prints `Uploaded N eval scenarios`. So `.tesslignore` keeps scenarios
out of the review bundle **and** they still reach the registry as coverage. Do not "fix" the
apparent contradiction by removing either one; removing the `.tesslignore` line hands a judge the
answer key to the skill it is grading, and adding `--skip-evals` back reinstates the 80% haircut.
The publisher also honours a workspace-level switch — with evals disabled on the workspace it
prints `Skipping eval scenarios — workspace "<name>" has evals disabled` and uploads none.

`tests/test-tessl-publish.mjs` AC-5 checks **both** levels, plugin root and in-skill. It once
checked only the in-skill spelling, which meant it silently stopped proving anything the day
scenarios moved up to the plugin root — the pack stayed protected by each plugin's bare `evals/`
line, but no test said so. A guard scoped to the old location is a guard that reads nothing.

**`.okfignore` needs a line per plugin with scenarios** — it matches a path prefix, not a glob. A
plugin that gains scenarios without gaining a line is reported by `okf.mjs coverage` as
`unindexed`, so the omission is loud rather than silent.

Hazards: `tessl scenario download` writes into the plugin root's `evals/` and its default
`--strategy merge` overwrites the canonical generated directory names — **`scenario-0/`,
`scenario-1/`, …, zero-indexed**, not the `scenario-1/`-first spelling the docs show. Every
hand-written scenario here therefore carries a descriptive slug (`postmortem-checkout-latency-spike`,
`adopt-a-drifting-docs-tree`): a name the generator will never mint is a name a re-download cannot
silently overwrite, which is cheaper than remembering not to point it at the real tree. And a
scenario's **`setup.sh` is auto-run if present**; this repo does not author shell scripts
(ADR-014), so declare `scenario.json`'s `setup: ["node ..."]` instead.

**`tessl scenario generate` costs 300 credits per plugin** — measured 2026-09-07 on `agent-cli`,
which returned 3 scenarios after ~9 minutes. That is 30× an eval run, and it buys **no score**: the
coverage that lifts the 80% haircut counts scenarios, not their provenance, so a hand-written
scenario is worth exactly as much. What it does buy is a good first-draft brief, and even that
arrives needing curation — two of `agent-cli`'s three came back flagged *"references a path outside
the evaluated workspace; scoring cannot observe writes there"* (false positives on fictional spec
prose, but the flag is emitted either way). Generate to break a blank page, never to reach a number.

Fixture shapes, from `eval lint --help`:
`{"type":"commit","repoUrl","ref","installPath?","include?","exclude?"}` and
`{"type":"directory","path","installPath"}`.

`criteria.json` items are `{name, description, max_score}` **only** — read out of 0.105.0's own zod
schema, alongside `context: min(1)` and `checklist: min(1)`. The `category` enum
(INTENT/DESIGN/MUST_NOT/MINIMALITY/REUSE/INTEGRATION/EDGE_CASE) **is** documented by Tessl, so the
docs and the CLI disagree and the CLI is the one that runs: an extra key is a **warning**
(`⚠ Extra checklist fields: category`), not an error. `tests/test-eval-scenarios.mjs` AC-3 is
therefore stricter than lint on purpose, and it stays that way — the generator does not emit
`category` (verified on `agent-cli`'s three), so nothing in this tree pays for the strictness, and
a warning nobody reads is how an unknown key gets normalised into the corpus.

### `tessl eval lint` fails open — this is the trap

Its own help says so: a directory is a scenario only if it holds `task.md`, and one without is
"silently skipped and recursed into". Verified: a folder holding only `criteria.json` lints as
`✔ 0 scenarios valid`, exit 0. A renamed or mistyped brief therefore deletes a scenario from every
future run while every signal stays green. `tests/test-eval-scenarios.mjs` pairs the two files
(AC-1), compares its own walk against lint's count (AC-5), and **reproduces the fail-open as a
canary** (AC-6b) so the guard cannot be quietly lost. Never rely on `eval lint` alone.

### Running one

Eval runs are saved to a Tessl project, resolved **server-side from the git remote** — this repo's
is `skills`, in workspace `wagneripjr`, `sourceUri: github.com/wagneripjr/skills`. `tessl project
create <name> --workspace <name>` mints one if it is missing, and `tessl project repair` re-links a
broken one.

**`tessl.json` is NOT that link.** It is a dependency manifest — `{name, mode, dependencies}`, and
here `mode: "vendored"` with a `tessl/review-plugin-creator` entry. It carries no workspace or
project field at all. The earlier claim that `tessl project create` writes it, and the matching
comment in `.gitignore`, were both wrong.

**Tessl's own docs disagree, and they are the ones to distrust here.** The eval page's plugin
diagram annotates `tessl.json` as *"links the directory to a Tessl project"*, and `tessl project
--help` says it repairs "a missing or broken reference in tessl.json". Neither matches this file,
which is gitignored and would therefore carry no link into CI or a fresh clone even if it could.
Resolution is server-side from the git remote: `tessl project list` returns project `skills`,
`sourceUri: github.com/wagneripjr/skills`, and eval runs submitted from here attach to it with no
local link of any kind. Verified 2026-09-07 — do not "repair" a link that nothing is missing.

```bash
tessl org usage --json                        # credits.used BEFORE
tessl eval lint ./plugins/postmortem          # free
tessl eval run ./plugins/postmortem --wait
tessl org usage --json                        # the delta is the price
tessl eval view --last
```

No `--context`: the path is a plugin root, so the plugin *is* the context. `--wait` is required —
a non-interactive run without it submits and exits 0 without waiting, reporting success for a run
that has not started.

**Tessl recommends no agent or model.** Every documented eval command omits `--agent`/`--model`,
so the CLI default applies (`deepseek-v4-flash`; `--list-agents` prints the full matrix). Its only
stated tuning guidance is **`--runs 3` to average out model variance before drawing conclusions**,
and `--count 5` for broader scenario *generation*. If a model is pinned, record it beside the
number — an unlabelled score cannot be compared, which is the FR-TESSL-2 rule.

`tessl scenario generate` and generated scenarios remain unused: if they are ever wanted, do it in
a **throwaway copy outside this repo** (`tessl skill import` → `scenario generate` →
`scenario download --output` → curate → copy the good ones in).

**There is no dry-run.** `tessl eval run --json` *submits* — by the time it prints
`estimatedCredits` you have paid. Budget a priori from `tessl org usage --json`, before invoking.
Cheap levers: `--skip-baseline` (halves it when the baseline is meaningless), `--skip-scoring` (no
scorer model runs at all), `-n 1` while exploring and `-n 3` only for probabilistic properties.
`-f/--force` re-runs previously solved cases; `--context-commit <ref>` sources a local `--context`
from a commit instead of the working tree, which is the honest way to compare two versions of a
skill; `--skill <name>` narrows a local plugin context; `tessl eval retry <id>|--last` re-runs a
scenario that did not complete, which the docs call normal agent behaviour rather than an error.

### The non-activation proof

Shipped under **FR-TESSL-5**; read that section for the mechanics and the two traps. In short:
`--skip-forced-context-activation --skip-scoring` observes whether an agent reaches for a skill on
its own, so "`trigger_term_quality` is N/A by design" stops being an excuse and becomes a
measurement.

```bash
tessl eval run tests/fixtures/activation-scenarios --context ./plugins/doc-this \
  --skip-forced-context-activation --skip-scoring --allow-unsafe-fixture-paths --wait
node scripts/eval-record.mjs --out tests/fixtures/activation-scenarios/RESULTS.json <run-id>
```

Pass condition: across every run, **no member of the `WORKERS` set in
`plugins/doc-this/hooks/doc-this-dispatch-gate.mjs`** appears in the activated column — the
orchestrator `doc-this` activating is expected and allowed. `tests/test-eval-record.mjs` reads that
set out of the gate file and never restates it, normalises `<plugin>:<skill>` to Tessl's
`tessl__<skill>` (without which the comparison silently matches nothing), and fails a run in which
nothing activated at all. Costs no credits to check; the record is committed.

Correct the earlier plan wherever it survives: `--context './plugins/doc-this/skills/*'` matches no
files and starts no run.

### Not worth doing

- **Any tessl step in `.github/workflows/test.yml`.** Fork PRs cannot read secrets, so the job
  either fails on every fork PR — contradicting "no PR is blocked on a score" — or exits 77, and
  `run-all.mjs` turns any skip into INCOMPLETE + exit 1, making **every fork PR red**. Keys also
  expire silently after 30 days, credits are finite and PR volume is not, and `test.yml` currently
  carries no secrets at all. If a score must ever attach to a commit SHA, use `workflow_dispatch`.
  That objection is scoped to `test.yml` and its `pull_request` trigger; it does **not** reach
  `tessl-publish.yml`, which runs only on `master` where secrets exist and no fork can trigger it.
  The trailing `workflow_dispatch` clause is the one part that does bite, since publishing
  auto-reviews and that score attaches to a SHA — accepted deliberately: publishing is a *release*
  whose score is a by-product, and the registry check means a push with no version bump publishes
  and scores nothing.
- **`tessl schedule *`** — unattended burn against a hard cap with no overage.
- **`tessl skill publish` for a one-off** — still refused. But **`tessl plugin publish` from CI is
  now how these skills are claimed**; see FR-TESSL-3. The three grounds this bullet used to give
  are gone: the version is read by the packer and pinned by a harness, the repo and its listings
  were already public, and the benefit is ownership of 22 rows that were otherwise unowned and
  unscored. Never publish from a laptop — that is what makes a duplicate.

## Versioning

Versions are maintained **by hand** — there is no hook automation. Plugins are version-keyed in
the plugin cache, so a bump is mandatory to ship anything: `update` silently no-ops otherwise.

### Commit → Version Bump Mapping

| Commit prefix | Version bump | Example |
|---------------|-------------|---------|
| `fix:` | Patch (0.1.0 → 0.1.1) | Bug fixes in skills |
| `feat:` | Minor (0.1.0 → 0.2.0) | New skills, new features |
| `feat!:` or `BREAKING CHANGE:` | Major (0.1.0 → 1.0.0) | Breaking changes |
| `docs:`, `chore:`, `ci:`, `test:` | No bump | Non-functional changes |

### Version Files

**One granularity since FR-LAYOUT-1.** A change to one plugin touches four fields, all carrying
the **same** number:

| File | Field |
|---|---|
| `plugins/<name>/.claude-plugin/plugin.json` | `.version` |
| `plugins/<name>/.tessl-plugin/plugin.json` | `.version` |
| `plugins/<name>/.codex-plugin/plugin.json` | `.version` |
| `.claude-plugin/marketplace.json` | that plugin's `.plugins[*].version` |

Current: seven solo plugins at **1.2.0**, `okf-maintain` at **1.3.0**, `doc-this` at **1.3.0**,
`farley-score` at **1.1.0**, `learning-capture` at **1.0.0**, Claude marketplace metadata **7.5.0**.

Note what earned that 1.1.1: adding `evals/` changes nothing an installed plugin executes, so by the
table above it is a `test:` change and no bump at all. The bump is not describing the change, it is
the **mechanism** — the registry is version-keyed, `already published, nothing to do` skips an
unbumped plugin, and the scenarios would therefore never upload. When shipping is the point, bump
even where the mapping says otherwise.

The manifests must agree: `manifestOf` in `scripts/tessl-publish.mjs` refuses to publish a
plugin whose `.claude-plugin` twin declares a different version, and
`tests/test-tessl-publish.mjs` mutation-tests that guard. `version` is **required** in a Tessl
manifest — `tessl plugin pack` hard-refuses without it, stricter than lint, which only warns.

**Never let `marketplace.json` fall behind `plugin.json`.** The marketplace entry is what the
client compares against; if it advertises a lower version, `claude plugin update` is a permanent
no-op and nothing you ship reaches the cache. Realign both and move on — there is no hook left to
re-sync them for you.

**Absence has two spellings, and only one was known before the first bump.** A plugin nobody has
published answers `plugin info` with "Could not find plugin"; one that exists at an older version
answers `Plugin "w/p" exists, but it has no version "1.1.0"`. Reading the second as an outage makes
every bump after the initial publish refuse to ship — which is exactly what the 1.0.0 → 1.1.0
repackaging hit, on all nine plugins at once. `classifyInfo` accepts both; AC-7f2 pins it.

### Gotchas

- **zsh and `!`**: zsh escapes `!` to `\!` in double-quoted strings. Use single quotes for breaking change commits: `git commit -m 'feat!: breaking change'`.

## Installation

Local development:
```bash
claude --plugin-dir ./plugins/doc-this --plugin-dir ./plugins/okf-maintain
```

Via marketplace — install only what you want; there is no bundle:
```bash
claude plugin marketplace add wagneripjr/skills
claude plugin install postmortem@wagner-skills-marketplace
claude plugin install okf-maintain@wagner-skills-marketplace
claude plugin install doc-this@wagner-skills-marketplace     # only for a discovery run

codex plugin marketplace add wagneripjr/skills --ref master
codex plugin add doc-this@wagner-skills-marketplace
```

## Updating After Changes

Each plugin is version-keyed in the cache — bump its three manifests and its Claude `marketplace.json`
entry, or `update` no-ops.

```bash
claude plugin marketplace update wagner-skills-marketplace
claude plugin update <name>@wagner-skills-marketplace

codex plugin marketplace upgrade wagner-skills-marketplace
codex plugin add <name>@wagner-skills-marketplace
```

Then restart Claude Code to apply. After a rename or a layout change, `claude plugin uninstall`
the old entries first — the cache is keyed on the old name and will not migrate itself.
Restart Codex after its updates and review changed hooks with `/hooks`. See README for prerequisites
and CODEX-MIGRATION.md for the handoff from copied configuration adaptations.

## Commands

```bash
# Verify plugins load
claude plugin list

# Every suite in the repo — what CI runs. Exit 0 only if none skipped.
node tests/run-all.mjs

# Repo-wide scan for credential-shaped material (also in CI)
node tests/test-publication-safety.mjs

# Run the tree/closure acceptance matrix (asserts plugins/ holds exactly the expected 9)
node tests/test-fr-bundle-3.mjs

# What the publish workflow would do, without publishing
node scripts/tessl-publish.mjs --dry-run

# Record a finished eval run into plugins/<name>/evals/RESULTS.json (free; reads, never runs)
node scripts/eval-record.mjs <run-id> [<run-id>...]
```

<!-- okf:entry -->
## Documentation

Start at [index.md](index.md). Every documentation folder carries a generated `index.md` listing
each document's title and one-line description — answer "which doc covers X" and "does a doc for Y
exist" from that index in one read, and open a document only after the index names it. Do not grep
`docs/` for a document's identity; grep stays correct only for a literal phrase inside a body that
the index cannot carry.
<!-- /okf:entry -->

@AGENTS.md
