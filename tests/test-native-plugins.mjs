#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness } from './lib/harness.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const h = new Harness('Native plugin packaging');
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const claude = json('.claude-plugin/marketplace.json');
const codex = json('.agents/plugins/marketplace.json');
const expected = ['agent-cli', 'airflow-dags', 'doc-this', 'human-cli', 'okf-maintain', 'platform-sre-kubernetes', 'postmortem', 'prototype-spike', 'requirements-elicitation'];
const names = value => value.plugins.map(item => item.name).sort().join(',');
h.equal('Claude marketplace carries all nine plugins', names(claude), expected.join(','));
h.equal('Codex marketplace carries the same nine plugins', names(codex), names(claude));
h.equal('marketplace identity is shared', codex.name, claude.name);
h.equal('marketplace release is current', claude.metadata.version, '7.2.0');
const contained = (base, path) => typeof path === 'string' && path.startsWith('./') && resolve(base, path).startsWith(`${resolve(base)}/`);
h.check('path guard rejects escape canary', !contained(root, './../outside'));
h.check('path guard accepts packaged path', contained(root, './plugins/doc-this'));
for (const entry of claude.plugins) {
  const base = join(root, entry.source);
  const version = ['doc-this', 'okf-maintain'].includes(entry.name) ? '1.3.0' : '1.2.0';
  const native = codex.plugins.find(item => item.name === entry.name);
  h.equal(`${entry.name} uses local public source`, native?.source?.source, 'local');
  h.equal(`${entry.name} source is shared`, native?.source?.path, entry.source);
  h.check(`${entry.name} source stays inside repository`, contained(root, native?.source?.path));
  h.equal(`${entry.name} catalog version`, entry.version, version);
  for (const host of ['claude', 'codex', 'tessl']) {
    const manifest = json(`${entry.source}/.${host}-plugin/plugin.json`);
    h.equal(`${entry.name} ${host} identity`, host === 'tessl' ? manifest.name.split('/').at(-1) : manifest.name, entry.name);
    h.equal(`${entry.name} ${host} version`, manifest.version, version);
  }
  const manifest = json(`${entry.source}/.codex-plugin/plugin.json`);
  const skills = entry.name === 'doc-this' ? ['doc-this', 'doc-this-help', 'doc-this-promote', 'doc-this-viewer'] : [entry.name];
  h.equal(`${entry.name} exposes only public skills`, JSON.stringify(manifest.skills), JSON.stringify(skills.map(name => `./skills/${name}`)));
  for (const path of manifest.skills) h.check(`${entry.name} skill root exists: ${path}`, contained(base, path) && existsSync(join(base, path, 'SKILL.md')));
  h.check(`${entry.name} has no portable manifest overriding skill selection`, !existsSync(join(base, 'plugin.json')));
  if (['doc-this', 'okf-maintain'].includes(entry.name)) {
    h.equal(`${entry.name} selects native hook adapter`, manifest.hooks, './hooks/codex-hooks.json');
    h.check(`${entry.name} native hooks exist`, existsSync(join(base, manifest.hooks)));
    h.check(`${entry.name} Claude hooks remain available`, existsSync(join(base, 'hooks/hooks.json')));
  }
}
h.equal('doc-this retains all fourteen skill payloads', readdirSync(join(root, 'plugins/doc-this/skills')).filter(name => existsSync(join(root, 'plugins/doc-this/skills', name, 'SKILL.md'))).length, 14);
h.done();
