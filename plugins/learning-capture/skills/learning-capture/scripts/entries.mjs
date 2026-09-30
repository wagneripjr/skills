#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ENTRY_FORMAT = 1;

export const TYPES = ['LRN', 'ERR', 'FEAT'];

export const FIELDS = [
  'Status',
  'Skill',
  'Fix-type',
  'Review',
  'Promoted',
  'Skill-Path',
  'Scenario',
  'Verdict',
  'Activation',
  'Applications',
  'Confirmations',
  'Contradictions',
  'Confidence',
  'Last-Observed',
  'Logged',
  'Priority',
  'Area',
];

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENTRY_HEADER = /^## \[/;
const ID = /\[([^\]]+)\]/;
const FIELD_LINE = /^(?:\*\*([^*]+)\*\*|- ([^:]+)):\s*(.*?)\s*$/;
const SEQUENTIAL = /^\d{3}$/;

const USAGE = `usage:
  entries.mjs next-id <${TYPES.join('|')}> [dir]   print the next sequential id for today (UTC); dir defaults to .learnings
  entries.mjs list [dir]                    print id<TAB>file<TAB>Status for every entry in the corpus
  entries.mjs --version
exit: 0 ok | 1 error | 2 usage`;

export function parseEntries(text) {
  const entries = [];
  let current = null;
  for (const line of String(text ?? '').split('\n')) {
    if (ENTRY_HEADER.test(line)) {
      const id = ID.exec(line);
      current = {
        id: id ? id[1] : '',
        heading: id ? line.slice(id.index + id[0].length).trim() : '',
        fields: {},
      };
      entries.push(current);
      continue;
    }
    if (current === null) continue;
    const field = FIELD_LINE.exec(line);
    if (field === null) continue;
    const name = field[1] ?? field[2];
    if (FIELDS.includes(name)) current.fields[name] = field[3];
  }
  return entries;
}

export function corpusFiles(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('.')).sort();
  } catch {
    return [];
  }
  return names.filter((n) => {
    try {
      return statSync(join(dir, n)).isFile();
    } catch {
      return false;
    }
  });
}

export function readCorpus(dir) {
  return corpusFiles(dir).flatMap((file) =>
    parseEntries(readFileSync(join(dir, file), 'utf8')).map((entry) => ({ file, ...entry })));
}

export function nextId(type, dir, date = new Date()) {
  if (!TYPES.includes(type)) throw new Error(`unknown entry type ${JSON.stringify(type)} (expected ${TYPES.join('|')})`);
  const prefix = `${type}-${date.toISOString().slice(0, 10).replaceAll('-', '')}-`;
  let max = 0;
  for (const { id } of readCorpus(dir)) {
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    if (SEQUENTIAL.test(suffix)) max = Math.max(max, Number(suffix));
  }
  if (max >= 999) throw new Error(`no sequential id left after ${prefix}999`);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function version() {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

export function main(argv) {
  const [command, ...rest] = argv;
  try {
    if (command === '--version' && rest.length === 0) {
      process.stdout.write(`entries.mjs ${version()} (entry-format ${ENTRY_FORMAT})\n`);
      return 0;
    }
    if (command === 'next-id' && rest.length >= 1 && rest.length <= 2 && TYPES.includes(rest[0])) {
      process.stdout.write(`${nextId(rest[0], rest[1] ?? '.learnings')}\n`);
      return 0;
    }
    if (command === 'list' && rest.length <= 1) {
      const dir = rest[0] ?? '.learnings';
      for (const entry of readCorpus(dir)) {
        process.stdout.write(`${entry.id}\t${join(dir, entry.file)}\t${entry.fields.Status ?? ''}\n`);
      }
      return 0;
    }
  } catch (err) {
    process.stderr.write(`entries.mjs: ${err.message}\n`);
    return 1;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
