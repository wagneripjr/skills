# Wagner Skills Plugin

Claude Code plugin containing personal skills for self-improvement, knowledge capture, and development workflows.

## Repository Structure

```
.claude-plugin/          # Plugin manifest and marketplace config
hooks/                   # Plugin hooks (auto-loaded by convention)
skills/                  # One folder per skill
  self-improving-agent/  # First skill: learning capture and promotion
    SKILL.md             # Main skill file
    scripts/             # Hook scripts and utilities
    assets/              # Templates copied to projects on first use
    references/          # Detailed examples and documentation
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
4. Update version in `.claude-plugin/plugin.json`
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
