# Skill estate review notes

## Repo shape

- Two skill packages: repo root (`wagneripjr/wagner-skills`, 8 skills under `skills/`) and
  `doc-this/` (`wagneripjr/doc-this`, 14 skills under `doc-this/skills/`).
- 22 skills total, no duplicate copies, no discovery failures.
- Repo also ships Claude Code plugin metadata in `.claude-plugin/plugin.json` at both roots;
  those files are separate from the Tessl manifests and must not be edited by review work.

## READ CLAUDE.md BEFORE PLANNING ANY REVIEW WORK

`CLAUDE.md` (around lines 540-610) holds the repo's own rules for `tessl review`, measured
prices, and a list of deliberate score tradeoffs. I planned a fix batch in 2026-09-04 that
violated three of them at once. Read that section first, every time.

### Rule: `tessl review fix` is report-only in this repo

Never pass `--yes`, and never call the MCP `review_view` with `apply: true`. The documented
reason: the judge writes its own preferences to disk and has no idea the repo's tradeoffs are
deliberate. Precedent — a single fix pass on `okf-maintain` proposed trimming exactly the
rationale paragraphs that carry the *why*. Correct workflow is: run the fix, read
`summaryOfChanges`, apply the parts you agree with **by hand**.

This matters most for `conciseness` findings, which is the judge making that same cut.

### Rule: low `trigger_term_quality` is BY DESIGN for orchestrator-dispatched workers

`CLAUDE.md`: expected score **1-2** for agents invoked by exact name rather than user phrasing.
"Never add user-intent keywords to lift it: that creates unanchored-run risk (the 2026-06-10
architect episode — keywords added to chase the judge had to be reverted)."

So `doc-this-architect`, `doc-this-code-analyst`, `doc-this-detective`, and `doc-this-writer`
scoring **3** on that dimension are ABOVE expectation, not failing. Do not report these as
critical findings, and do not fix them.

General rule from CLAUDE.md: fix any criterion below 3/3 *unless* it's an intentional design
tradeoff (which is documented).

## Budget: Team plan as of 2026-09-04 (was Free)

`tessl org usage --json`: plan `team-v1`, limit **5000**, used ~1012, remaining ~3988,
`overageAllowed: false` (work still stops at the limit, there is just far more headroom).

**This unlocks `--review-plugin`**, which the Free plan blocked. A custom rubric is now the
correct fix for the recurring false alarms below, instead of filtering them by hand after
every run.

## Budget rules (still apply)

Check `tessl org usage --json` before and after anything paid; the delta is the real price.

Overage is not allowed on Team either, so check `tessl org usage --json` before and after
anything paid; the delta is the real price.

Measured prices (from CLAUDE.md, 2026-09-04):
- `review run quality`: **10** credits
- `review run quality` cached (no `--force`, unchanged skill): **0** — reuses prior run
- `review run security` (Snyk): **0**
- `review fix --max-iterations 1`: **100** credits — and omitting `--max-iterations` allows
  more loops, so cost per skill is unbounded from the caller's side

`--force` defeats the free cache, so re-verification is 10 credits per skill, not 0.

Never plan a multi-skill fix batch without checking the balance first. A full 22-skill review
is ~220 credits; a 5-skill fix batch is 500+ and unbounded without `--max-iterations`.

## Known false positives in validation warnings

Both remaining warnings are target-repo runtime paths, not real defects:

- `skills/okf-maintain` "relative_links: 1 missing" — `SKILL.md:202` and
  `references/adoption.md:211` both contain `[index.md](index.md)` inside a fenced block quoting
  `okf.mjs`'s `ENTRY_BLOCK`. `okf.mjs:77` emits that line byte-for-byte and
  `tests/test-okf-maintain.mjs` AC-17 pins the quote identical to what the script writes. The
  link is relative to the *target* repo and can never resolve from the skill directory. Fixing
  it breaks AC-17.
- `doc-this/skills/doc-this-viewer` "referenced_paths_exist: 1 missing" — same class. Every
  non-existent path in that bundle is a target-project runtime path
  (`.doc-this/state.json`, `.doc-this-sdd/external-surface.json`, `docs/TRACEABILITY.md`).

The reviewer's warning message does not name which path it flagged, so confirming a specific one
needs `tessl review view <runId>`.

## Packaging gotcha (resolved 2026-09-04)

`tessl skill lint` / `tessl review` need a Tessl manifest at `.tessl-plugin/plugin.json`
(or `tile.json`). The repo originally had only Claude plugin manifests, so lint failed with
"Not a Tessl plugin" at both roots and blocked every quality review. Tessl manifests were added
at `./.tessl-plugin/plugin.json` and `./doc-this/.tessl-plugin/plugin.json`.

Remaining lint warnings: no version set in the Tessl manifests (publishing needs
`--version`/`--bump`), and `skills/okf-maintain/SKILL.md` is ~6.3k tokens vs the 5k
recommendation.

## Repo's own review harness — prefer it over raw CLI calls

```bash
export TESSL_WORKSPACE=wagneripjr        # no default; the harness SKIPs rather than guess
node tests/test-tessl-quality-gate.mjs ./skills/<skill-name> 90
# exit 0 pass · 1 below floor · 77 skipped
```

It runs a **free** `tessl review list` preflight first, so a logged-out or misnamed workspace
skips *before* paying for a review. Score extraction is in `tests/lib/tessl.mjs`.

Also relevant: every skill now uses `references/` **plural**. A `progressive_disclosure` score on
`agent-cli`, `human-cli`, or `airflow-dags` from before that rename is not comparable to one
after it.

## Review results, 2026-09-04, all 22 reviewed

Workspace `wagneripjr`. Backgrounded `tessl review run quality <dir> -w wagneripjr --json
--threshold 0`, 10 at a time, all exit 0. Score at `.review.reviewScore`; per-dimension scores
under `.judges.<content|description>.evaluation.scores`.

Scores 79-97. Run IDs are recorded in the session; re-fetch with `tessl review view <runId>`.

Real findings after discounting the documented tradeoffs:
- `conciseness` is the weakest content dimension repo-wide; `okf-maintain` scored **2**. But per
  the report-only rule, any conciseness fix is hand-applied, and the okf-maintain rationale
  paragraphs are deliberate.
- `airflow-dags` scored **3** on `workflow_clarity` — the one finding not explained by a
  documented tradeoff or a false positive.
- Four doc-this workers scored 3 on `trigger_term_quality`: expected by design, not findings.

## User preferences observed

- Prefers to apply structural/packaging fixes themselves via Claude Code rather than have me edit.
- Wants the widest review scope (chose "every discovered skill" both times).
- Expects budget to be checked before proposing paid work, and expects repo rules in `CLAUDE.md`
  to be honored over generic skill guidance.
