# Wagner Skills Plugin

Claude Code plugin containing personal skills for self-improvement, knowledge capture, and development workflows.

## Repository Structure

```
.claude-plugin/          # Plugin manifest and marketplace config
.githooks/               # Git hooks for semver auto-bump (setup: git config core.hooksPath .githooks/)
  commit-msg             # Parses conventional prefix, bumps version
  post-commit            # Amends commit to include version changes
hooks/                   # Plugin hooks (auto-loaded by convention)
skills/                  # One folder per skill
  self-improving-agent/  # Learning capture and promotion
    SKILL.md             # Main skill file
    scripts/             # Hook scripts and utilities
    assets/              # Templates copied to projects on first use
    references/          # Detailed examples and documentation
  playwright/            # Headless E2E testing and AI-driven test generation
    SKILL.md             # Main skill file
    references/          # CLI commands, agents workflow docs
    templates/           # Project setup scripts, seed test
  gemini-web/            # Web search, research, URL scraping via Gemini API
    SKILL.md             # Main skill file
    gemini-web.sh        # Wrapper script (search, research, scrape modes)
    test-gemini-web.sh   # Unit + integration test suite
  airflow-dags/          # Apache Airflow 3 DAG authoring with 12 reference docs
    SKILL.md             # Main skill file
    reference/           # Deep-dive docs (authoring, scheduling, testing, etc.)
```

## Plugin Convention

- **Plugin manifest**: `.claude-plugin/plugin.json` — name, version, author
- **Marketplace**: `.claude-plugin/marketplace.json` — self-referencing for discovery
- **Hooks**: `hooks/hooks.json` — auto-loaded, never reference in plugin.json
- **Skills**: `skills/<name>/SKILL.md` — one SKILL.md per skill folder
- **Script paths**: Use `${CLAUDE_PLUGIN_ROOT}` in hooks — resolves to install location

## Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`)
2. Add supporting files in `scripts/`, `assets/`, `references/` as needed
3. If the skill needs hooks, append them to `hooks/hooks.json`
4. Version is auto-bumped by git hooks based on commit prefix (see Semantic Versioning)
5. Commit and push — marketplace users run `claude plugin marketplace update` to sync

## SKILL.md Writing Rules

- **Description** (frontmatter): Third-person, pushy — list all trigger conditions explicitly
- **Body**: Imperative/infinitive form ("Log to..." not "You should log to...")
- **Target**: 1,500–2,000 words body; offload heavy reference to bundled files
- **Explain why**: Every instruction should make clear why it matters
- Use `skill-creator:skill-creator` to test, evaluate, and iterate on skills

## Testing Skills

Follow `skill-creator:skill-creator` methodology:
1. Create test prompts in `evals/evals.json`
2. Run with/without skill in parallel subagents
3. Evaluate qualitatively with `generate_review.py`
4. Draft assertions and iterate

## Quality Gate

**MANDATORY**: After writing or modifying any skill, run tessl review before committing:

```bash
# Local review (reads from disk, no push needed)
npx tessl skill review ./skills/<skill-name> --json

# Remote review (after push, verifies published version)
npx tessl skill review github:wagneripjr/skills --skill <skill-name> --json
```

Fix any criterion scoring below 3/3 unless it's an intentional design tradeoff (document why).

## Semantic Versioning

This repository auto-bumps version on every commit via git hooks in `.githooks/`.

### Setup (required once per clone)

```bash
git config core.hooksPath .githooks/
```

### Commit → Version Bump Mapping

| Commit prefix | Version bump | Example |
|---------------|-------------|---------|
| `fix:` | Patch (0.1.0 → 0.1.1) | Bug fixes in skills |
| `feat:` | Minor (0.1.0 → 0.2.0) | New skills, new features |
| `feat!:` or `BREAKING CHANGE:` | Major (0.1.0 → 1.0.0) | Breaking changes |
| `docs:`, `chore:`, `ci:`, `test:` | No bump | Non-functional changes |

### Version Files

Three fields are kept in sync automatically:
- `.claude-plugin/plugin.json` → `.version`
- `.claude-plugin/marketplace.json` → `.metadata.version`
- `.claude-plugin/marketplace.json` → `.plugins[0].version`

**Do NOT edit version fields manually** unless using the `chore(version):` prefix to skip the hook.

### How It Works

1. `commit-msg` hook parses the conventional commit prefix
2. Reads current version from `plugin.json`, computes the new version
3. Updates all three version fields via `jq`, stages the files
4. Writes a flag to `.git/_version_bump_pending`
5. `post-commit` hook detects the flag, amends the commit to include version changes

### Manual Version Override

To set version manually (e.g., for a 1.0.0 release):
```bash
# Edit plugin.json and marketplace.json manually, then:
git commit -m "chore(version): set 1.0.0"
```

### Gotchas

- **Rebase/cherry-pick**: Each replayed commit triggers the hook. Use `SKIP_VERSION_BUMP=1 git rebase ...` to prevent cascading bumps.
- **Amend**: Use `SKIP_VERSION_BUMP=1 git commit --amend` to avoid double-bumping.
- **New clone**: Must run `git config core.hooksPath .githooks/` after cloning — hooks are not active by default.
- **zsh and `!`**: zsh escapes `!` to `\!` in double-quoted strings. Use single quotes for breaking change commits: `git commit -m 'feat!: breaking change'`.
- **Dependency**: `jq` must be on PATH (`brew install jq`).

## Installation

Local development:
```bash
claude plugin add /path/to/this/repo
```

Via marketplace:
```bash
claude plugin marketplace add wagneripjr/skills
claude plugin install wagner-skills@wagner-skills-marketplace
```

## Updating After Changes

```bash
claude plugin marketplace update wagner-skills-marketplace
claude plugin update wagner-skills@wagner-skills-marketplace
```

Then restart Claude Code to apply.

## Commands

```bash
# Verify plugin loads
claude plugin list

# Test hook scripts
skills/self-improving-agent/scripts/activator.sh
CLAUDE_TOOL_OUTPUT="Error: something failed" skills/self-improving-agent/scripts/error-detector.sh

# Test skill extraction (dry run)
skills/self-improving-agent/scripts/extract-skill.sh test-skill --dry-run
```
