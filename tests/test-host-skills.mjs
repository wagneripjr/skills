#!/usr/bin/env node

import { cpSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness, runNode } from './lib/harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const h = new Harness('shared skills resolve inside independent plugin installations');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const installed = join(h.mkTemp('host-skills-'), 'installed plugins with spaces');
cpSync(join(ROOT, 'plugins'), installed, {
  recursive: true,
  filter: (path) => !path.split(sep).some((part) => part === 'node_modules' || part === '.git'),
});
const skills = walk(installed).filter((path) => path.endsWith(`${sep}SKILL.md`));

h.equal('the complete shared skill corpus is inspected', skills.length, 25);
for (const skill of skills) {
  const source = readFileSync(skill, 'utf8');
  const name = source.match(/^name: (.+)$/m)?.[1];
  const description = source.match(/^description: (.+)$/m)?.[1]?.replace(/^"|"$/g, '');
  h.check(`${name} has portable discovery metadata`,
    name === dirname(skill).split(sep).at(-1) && description?.length > 0 && description.length <= 1024);
}

function bundledPathFindings(pluginRoot) {
  const findings = [];
  for (const path of walk(join(pluginRoot, 'skills')).filter((file) => file.endsWith('.md'))) {
    const source = readFileSync(path, 'utf8');
    let skillDir = dirname(path);
    while (!existsSync(join(skillDir, 'SKILL.md')) && skillDir !== pluginRoot) skillDir = dirname(skillDir);
    for (const match of source.matchAll(/<(plugin-root|skill-dir)>\/([\w./-]+\.(?:md|mjs|json))\b/g)) {
      const target = resolve(match[1] === 'plugin-root' ? pluginRoot : skillDir, match[2]);
      if (!target.startsWith(`${pluginRoot}${sep}`) || !existsSync(target)) findings.push(`${path}: ${match[0]}`);
    }
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+host-runtime\.md)\)/g)) {
      const target = resolve(dirname(path), match[1]);
      if (!target.startsWith(`${pluginRoot}${sep}`) || !existsSync(target)) findings.push(`${path}: ${match[1]}`);
    }
    if (source.includes('${CLAUDE_PLUGIN_ROOT}')) findings.push(`${path}: unresolved Claude environment path`);
  }
  return findings;
}

const pluginRoots = readdirSync(installed).map((name) => join(installed, name));
const findings = pluginRoots.flatMap(bundledPathFindings);
h.check('host-bound paths and runtime references resolve within each relocated plugin', findings.length === 0,
  findings.map((finding) => relative(installed, finding)).join('\n'));

const catalog = new Set();
const knownSkills = new Set(skills.map((path) => readFileSync(path, 'utf8').match(/^name: (.+)$/m)[1]));
const knownPlugins = new Set();
for (const pluginRoot of pluginRoots) {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  knownPlugins.add(manifest.name);
  for (const entry of manifest.skills) {
    const name = readFileSync(join(pluginRoot, entry, 'SKILL.md'), 'utf8').match(/^name: (.+)$/m)[1];
    catalog.add(`${manifest.name}:${name}`);
  }
}
h.equal('the native manifests expose fifteen public plugin skill names', catalog.size, 15);

function invocationFindings(source) {
  return [...source.matchAll(/\$([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)/g)]
    .map((match) => match[1])
    .filter((name) => knownSkills.has(name) || (name.includes(':') && knownPlugins.has(name.split(':')[0])))
    .filter((name) => !catalog.has(name));
}

const invocationErrors = pluginRoots.flatMap((pluginRoot) => walk(join(pluginRoot, 'skills'))
  .filter((path) => path.endsWith('.md'))
  .flatMap((path) => invocationFindings(readFileSync(path, 'utf8')).map((name) => `${relative(installed, path)}: $${name}`)));
h.check('every concrete Codex skill invocation resolves in the native public catalog',
  invocationErrors.length === 0, invocationErrors.join('\n'));
h.equal('a short plugin skill name is rejected instead of assuming suffix resolution',
  invocationFindings('Invoke $doc-this').length, 1);
h.equal('a hidden worker is rejected even with a fully qualified name',
  invocationFindings('Invoke $doc-this:doc-this-scout').length, 1);
h.equal('fully qualified public skills resolve and unrelated shell variables are ignored',
  invocationFindings('Invoke $doc-this:doc-this and $okf-maintain:okf-maintain; inspect $state').length, 0);

const docThis = join(installed, 'doc-this');
const runtime = join(docThis, 'skills', 'doc-this', 'references', 'host-runtime.md');
const runtimeBytes = readFileSync(runtime, 'utf8');
unlinkSync(runtime);
const broken = bundledPathFindings(docThis);
h.equal('removing the shared runtime is detected for all fourteen Doc-This entries', broken.length, 14);
writeFileSync(runtime, runtimeBytes);
h.equal('restoring the packaged runtime clears the broken references', bundledPathFindings(docThis).length, 0);

const okfSkill = join(installed, 'okf-maintain', 'skills', 'okf-maintain');
const okfSource = readFileSync(join(okfSkill, 'SKILL.md'), 'utf8');
const scriptReference = okfSource.match(/node "<skill-dir>\/([^"\n]+\.mjs)"/);
h.check('OKF exposes its installed script address', Boolean(scriptReference));
if (scriptReference) {
  const result = runNode(join(okfSkill, scriptReference[1]), {
    args: ['--version'],
    cwd: h.mkTemp('unrelated project '),
    env: { CLAUDE_PLUGIN_ROOT: '', CODEX_HOME: h.mkTemp('empty-codex-') },
  });
  h.check('the documented OKF script runs from another cwd without either host configuration',
    result.code === 0 && result.stdout.trim().length > 0, result.stderr);
}

h.done();
