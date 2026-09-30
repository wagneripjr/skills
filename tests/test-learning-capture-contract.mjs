#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Harness } from './lib/harness.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(DIR, '..', 'plugins', 'learning-capture');
const SKILL = join(PLUGIN, 'skills', 'learning-capture');
const READER = join(SKILL, 'scripts', 'entries.mjs');
const FIXTURES = join(SKILL, 'references', 'fixtures');
const CONTRACT = join(SKILL, 'references', 'entry-format.md');
const TEMPLATES = ['LEARNINGS.md', 'ERRORS.md', 'FEATURE_REQUESTS.md'].map((n) => join(SKILL, 'assets', n));
const CORPUS_ENTRIES = 27;
const FORBIDDEN = [
  'agentic-sdlc', 'skill-reconcile', '/sdlc', '/deliver', 'acceptance-spec', 'atdd',
  'test-driven-development', 'confidence-score', 'learningsDirectoryDecision', 'skill-reconcile.mjs',
  'hooks/lib/', 'FR-002', 'FR-105', 'R-94', 'R-3', 'ADR-012', 'ADR-022', 'hub',
];
const MUTANTS = [
  { name: 'bold spelling only', from: '|- ([^:]+))', to: ')' },
  { name: 'any level-two heading ends an entry', from: 'const ENTRY_HEADER = /^## \\[/;', to: 'const ENTRY_HEADER = /^## /;' },
  { name: 'header not anchored at column 0', from: 'const ENTRY_HEADER = /^## \\[/;', to: 'const ENTRY_HEADER = /## \\[/;' },
  { name: 'first occurrence wins', from: 'if (FIELDS.includes(name))', to: 'if (FIELDS.includes(name) && !(name in current.fields))' },
  { name: 'values not trimmed', from: '):\\s*(.*?)\\s*$/', to: '):(.*)$/' },
];

const h = new Harness('learning-capture — the entry format is a pinned contract');
const WORK = h.mkTemp('learning-capture-contract-');
const reader = await import(pathToFileURL(READER).href);
const read = (p) => readFileSync(p, 'utf8');
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
const notice = (msg) => process.stdout.write(`  SKIP: ${msg}\n`);
const cli = (...args) => {
  const r = spawnSync(process.execPath, [READER, ...args], { encoding: 'utf8' });
  return { rc: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' };
};

const files = readdirSync(FIXTURES);
const docs = files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -'.md'.length)).sort();
const expectations = files.filter((f) => f.endsWith('.expected.json')).map((f) => f.slice(0, -'.expected.json'.length)).sort();
const cases = docs.filter((stem) => expectations.includes(stem));

h.section('AC-1 every fixture is paired with a hand-written expectation, both directions');
for (const stem of docs) h.check(`AC-1 ${stem}.md has an expectation`, expectations.includes(stem));
for (const stem of expectations) h.check(`AC-1 ${stem}.expected.json has a fixture`, docs.includes(stem));
h.check('AC-1 nothing else sits in the corpus directory',
  files.every((f) => f.endsWith('.md') || f.endsWith('.expected.json')), files.join(', '));

h.section('AC-2 the reader returns exactly what each expectation states');
const want = Object.fromEntries(cases.map((stem) => [stem, JSON.parse(read(join(FIXTURES, `${stem}.expected.json`))).entries]));
const text = Object.fromEntries(cases.map((stem) => [stem, read(join(FIXTURES, `${stem}.md`))]));
for (const stem of cases) {
  const got = reader.parseEntries(text[stem]);
  h.equal(`AC-2 ${stem}: entry count`, got.length, want[stem].length);
  h.check(`AC-2 ${stem}: ids, headings and fields`, isDeepStrictEqual(got, want[stem]),
    `expected ${JSON.stringify(want[stem])}\n        got      ${JSON.stringify(got)}`);
  for (const entry of want[stem]) {
    const stray = Object.keys(entry.fields).filter((k) => !reader.FIELDS.includes(k));
    h.check(`AC-2 ${stem} ${entry.id || '(no id)'}: the expectation names contract fields only`, stray.length === 0, stray.join(', '));
  }
}

h.section('AC-3 the corpus is not empty, and its size is stated, not counted');
const total = cases.reduce((n, stem) => n + want[stem].length, 0);
h.check('AC-3 the corpus holds entries at all', total > 0, `${total}`);
h.equal('AC-3 the corpus holds the stated number of entries', total, CORPUS_ENTRIES);
h.equal('AC-3 the reader finds the same number', cases.reduce((n, stem) => n + reader.parseEntries(text[stem]).length, 0), CORPUS_ENTRIES);

h.section('AC-4 the corpus discriminates: every planted reader defect fails at least one fixture');
const source = read(READER);
const failures = async (src, tag) => {
  const path = join(WORK, `reader-${tag}.mjs`);
  write(path, src);
  const variant = await import(pathToFileURL(path).href);
  return cases.filter((stem) => !isDeepStrictEqual(variant.parseEntries(text[stem]), want[stem]));
};
const control = await failures(source, 'control');
h.check('AC-4 control: an unmutated copy passes every fixture', control.length === 0, control.join(', '));
for (const [i, m] of MUTANTS.entries()) {
  if (!h.check(`AC-4 mutant applies: ${m.name}`, source.includes(m.from), `pattern not found: ${m.from}`)) continue;
  const failed = await failures(source.replace(m.from, () => m.to), `mutant-${i}`);
  h.check(`AC-4 mutant is caught: ${m.name}`, failed.length > 0, 'every fixture still passes');
}

h.section('AC-5 the shipped templates are preamble only');
const templates = TEMPLATES.filter((p) => existsSync(p));
if (templates.length === 0) notice(`no templates under ${join(SKILL, 'assets')} yet — nothing to check`);
for (const p of TEMPLATES.filter((t) => !templates.includes(t))) notice(`template absent: ${p}`);
for (const p of templates) h.equal(`AC-5 ${p.split('/').pop()} parses to zero entries`, reader.parseEntries(read(p)).length, 0);

h.section('AC-6 nextId is sequential per type and UTC date, and reads ids from headers only');
const DAY = new Date('2025-01-15T12:00:00Z');
const empty = join(WORK, 'empty');
mkdirSync(empty, { recursive: true });
h.equal('AC-6 an empty corpus starts at 001', reader.nextId('LRN', empty, DAY), 'LRN-20250115-001');
h.equal('AC-6 a missing corpus starts at 001', reader.nextId('ERR', join(WORK, 'absent'), DAY), 'ERR-20250115-001');
const busy = join(WORK, 'busy');
write(join(busy, 'LEARNINGS.md'), [
  '## [LRN-20250115-001] insight', '**Status**: pending',
  '## [LRN-20250115-007] insight', '- See Also: LRN-20250115-040',
  '## [LRN-20250115-A3F] insight', '## [LRN-20250115-0099] insight',
  '## [LRN-20250114-050] insight', '',
].join('\n'));
write(join(busy, 'ERRORS.md'), '## [ERR-20250115-020] build\n## [LRN-20250115-009] filed in the wrong file\n');
write(join(busy, '.draft.md'), '## [LRN-20250115-060] never counted\n');
h.equal('AC-6 next after the highest numeric suffix, across files', reader.nextId('LRN', busy, DAY), 'LRN-20250115-010');
h.equal('AC-6 other types do not count', reader.nextId('ERR', busy, DAY), 'ERR-20250115-021');
h.equal('AC-6 a type with no entries today starts at 001', reader.nextId('FEAT', busy, DAY), 'FEAT-20250115-001');
h.equal('AC-6 other dates do not count', reader.nextId('LRN', busy, new Date('2025-01-14T12:00:00Z')), 'LRN-20250114-051');
h.equal('AC-6 the date is UTC, not local', reader.nextId('LRN', empty, new Date('2025-01-15T23:30:00-05:00')), 'LRN-20250116-001');
const full = join(WORK, 'full');
write(join(full, 'LEARNINGS.md'), '## [LRN-20250115-999] insight\n');
h.check('AC-6 an exhausted day throws rather than mint a four-digit id',
  (() => { try { reader.nextId('LRN', full, DAY); return false; } catch { return true; } })());
h.check('AC-6 an unknown type throws',
  (() => { try { reader.nextId('BUG', empty, DAY); return false; } catch { return true; } })());

h.section('AC-7 corpusFiles is the documented file set');
const tree = join(WORK, 'tree');
write(join(tree, 'b.md'), '');
write(join(tree, 'a.md'), '');
write(join(tree, '.hidden.md'), '## [LRN-20250115-001] hidden\n');
write(join(tree, 'notes.txt'), '## [LRN-20250115-002] not markdown\n');
write(join(tree, 'dir.md', 'inner.md'), '## [LRN-20250115-003] a directory named like a file\n');
write(join(tree, 'sub', 'c.md'), '## [LRN-20250115-004] nested\n');
h.check('AC-7 regular top-level .md files only, sorted', isDeepStrictEqual(reader.corpusFiles(tree), ['a.md', 'b.md']),
  JSON.stringify(reader.corpusFiles(tree)));
h.check('AC-7 a missing directory is an empty corpus', isDeepStrictEqual(reader.corpusFiles(join(WORK, 'absent')), []));
const corpus = reader.readCorpus(busy);
h.check('AC-7 readCorpus reads every corpus file and names each entry\'s file',
  isDeepStrictEqual(corpus.map((e) => `${e.file}:${e.id}`), [
    'ERRORS.md:ERR-20250115-020', 'ERRORS.md:LRN-20250115-009',
    'LEARNINGS.md:LRN-20250115-001', 'LEARNINGS.md:LRN-20250115-007', 'LEARNINGS.md:LRN-20250115-A3F',
    'LEARNINGS.md:LRN-20250115-0099', 'LEARNINGS.md:LRN-20250114-050',
  ]), JSON.stringify(corpus.map((e) => `${e.file}:${e.id}`)));

h.section('AC-8 the CLI');
let r = cli('next-id', 'LRN', empty);
h.check('AC-8 next-id prints a sequential id for today', r.rc === 0 && /^LRN-\d{8}-001\n$/.test(r.out), `rc=${r.rc} out=${r.out}`);
r = cli('list', busy);
h.check('AC-8 list prints id, file and Status per entry', r.rc === 0
  && r.out.split('\n')[2] === `LRN-20250115-001\t${join(busy, 'LEARNINGS.md')}\tpending`, r.out);
for (const args of [[], ['next-id'], ['next-id', 'BUG'], ['bogus'], ['list', 'a', 'b']]) {
  r = cli(...args);
  h.check(`AC-8 usage error exits 2 with usage on stderr: [${args.join(' ')}]`, r.rc === 2 && r.err.includes('usage:') && r.out === '',
    `rc=${r.rc} err=${r.err}`);
}
const manifest = join(PLUGIN, '.claude-plugin', 'plugin.json');
if (existsSync(manifest)) {
  r = cli('--version');
  h.check('AC-8 --version prints the plugin version', r.rc === 0 && r.out.includes(JSON.parse(read(manifest)).version), `rc=${r.rc} ${r.out}${r.err}`);
} else {
  notice(`no manifest at ${manifest} yet — --version not checked`);
}

h.section('AC-9 the contract document names what the reader extracts');
const contract = read(CONTRACT);
for (const field of reader.FIELDS) h.check(`AC-9 the field table names ${field}`, contract.includes(`| \`${field}\` |`));
h.check('AC-9 the document states the reader\'s contract version', contract.includes(`\`entry-format: ${reader.ENTRY_FORMAT}\``));
h.check('AC-9 the document names the reader and the corpus', contract.includes('scripts/entries.mjs') && contract.includes('](fixtures/)'));

h.section('AC-10 the contract names no consumer');
const hits = (body) => FORBIDDEN.filter((s) => body.includes(s));
h.check('AC-10 canary: the scan flags a planted consumer name', hits('reads .learnings like agentic-sdlc does').length > 0);
h.check('AC-10 control: the scan passes benign text', hits('## [LRN-20250115-001] insight\n**Status**: pending\n').length === 0);
for (const p of [...files.map((f) => join(FIXTURES, f)), CONTRACT, READER]) {
  const found = hits(read(p));
  h.check(`AC-10 ${p.slice(PLUGIN.length + 1)} names no consumer`, found.length === 0, found.join(', '));
}

h.done();
