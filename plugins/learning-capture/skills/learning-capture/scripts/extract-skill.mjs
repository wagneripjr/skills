#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const NC = '\x1b[0m';

const self = basename(process.argv[1] ?? 'extract-skill.mjs');

function usage() {
  process.stdout.write(`Usage: ${self} <skill-name> [options]

Create a new skill scaffold from a learning entry.

Arguments:
  skill-name     Name of the skill (lowercase, hyphens for spaces)

Options:
  --dry-run      Show what would be created without creating files
  --output-dir   Relative output directory (default: ./skills)
  -h, --help     Show this help message

Examples:
  ${self} docker-m1-fixes
  ${self} api-timeout-patterns --dry-run
  ${self} pnpm-setup --output-dir ./my-skills

The skill will be created in: <output-dir>/<skill-name>/
`);
}

const info = (msg) => process.stdout.write(`${GREEN}[INFO]${NC} ${msg}\n`);
const error = (msg) => process.stderr.write(`${RED}[ERROR]${NC} ${msg}\n`);
const say = (msg = '') => process.stdout.write(`${msg}\n`);

function fail(msg, withUsage = false) {
  error(msg);
  if (withUsage) usage();
  process.exit(1);
}

let skillsDir = './skills';
let skillName = '';
let dryRun = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--dry-run') dryRun = true;
  else if (arg === '--output-dir') {
    const next = args[i + 1];
    if (next === undefined || next === '' || next.startsWith('-')) fail('--output-dir requires a relative path argument', true);
    skillsDir = next;
    i += 1;
  } else if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  } else if (arg.startsWith('-')) fail(`Unknown option: ${arg}`, true);
  else if (skillName === '') skillName = arg;
  else fail(`Unexpected argument: ${arg}`, true);
}

if (skillName === '') fail('Skill name is required', true);

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
  error('Invalid skill name format. Use lowercase letters, numbers, and hyphens only.');
  fail("Examples: 'docker-fixes', 'api-patterns', 'pnpm-setup'");
}

if (skillsDir.startsWith('/')) fail('Output directory must be a relative path under the current directory.');
if (/(^|\/)\.\.(\/|$)/.test(skillsDir)) fail("Output directory cannot include '..' path segments.");

skillsDir = `./${skillsDir.replace(/^\.\//, '')}`;
const skillPath = `${skillsDir}/${skillName}`;

if (existsSync(skillPath) && !dryRun) {
  error(`Skill already exists: ${skillPath}`);
  fail('Use a different name or remove the existing skill first.');
}

const skillTitle = skillName
  .split('-')
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

const template = `name: ${skillName}
description: "[TODO: Add a concise description of what this skill does and when to use it]"
---

# ${skillTitle}

[TODO: Brief introduction explaining the skill's purpose]

## Quick Reference

| Situation | Action |
|-----------|--------|
| [Trigger condition] | [What to do] |

## Usage

[TODO: Detailed usage instructions]

## Examples

[TODO: Add concrete examples]

## Source Learning

This skill was extracted from a learning entry.
- Learning ID: [TODO: Add original learning ID]
- Original File: .learnings/LEARNINGS.md
`;

if (dryRun) {
  info('Dry run - would create:');
  say(`  ${skillPath}/`);
  say(`  ${skillPath}/SKILL.md`);
  say();
  say('Template content would be:');
  say('---');
  process.stdout.write(template);
  say('---');
  process.exit(0);
}

info(`Creating skill: ${skillName}`);
mkdirSync(skillPath, { recursive: true });
writeFileSync(`${skillPath}/SKILL.md`, `---\n${template}`);
info(`Created: ${skillPath}/SKILL.md`);

say();
info('Skill scaffold created successfully!');
say();
say('Next steps:');
say(`  1. Edit ${skillPath}/SKILL.md — fill TODO sections from your learning`);
say('  2. Test, evaluate, and iterate it with your skill-authoring workflow');
say('  3. Run description optimization for triggering accuracy');
say('  4. Update original learning: Status -> promoted_to_skill');
say(`     Add: Skill-Path: ${skillPath.replace(/^\.\//, '')}`);
