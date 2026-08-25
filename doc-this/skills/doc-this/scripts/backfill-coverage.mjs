#!/usr/bin/env node
// backfill-coverage.mjs — deterministic set-math for doc-this coverage fan-out.
//
// Despite the historical name, this is the SHARED coverage/fan-out helper: both
// `/doc-this --backfill-coverage` and the normal-run Code Analyst Sonnet fan-out
// (references/sonnet-reader-fanout.md) use the same unread/chunk/verify-chunk/
// check-cites subcommands.
//
// One stable command path for everything coverage fan-out needs from the shell, so the
// orchestrator never improvises compound bash (redirects, cd, xargs, process
// substitution) that trips the permission layer. Run from the project root.
//
// Subcommands:
//   unread [--counts]                  manifest source ∖ ledger (paths; --counts = summary only)
//   chunk [--max-files N]              group unread by module prefix into chunk lists (default 40)
//   verify-chunk <chunk.txt> <files.json>   assigned set == files_read[]? (exit 1 + MISSING/EXTRA)
//   check-cites <staging.md>           every file:line citation exists and is in range (exit 1 + BAD CITE)
//   check-frag <file> <line> <frag>    verbatim fragment within ±2 lines of the cited line (exit 0/1)
//
// Zero dependencies. Exit codes: 0 ok, 1 check failed, 2 usage/environment error.

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MANIFEST = '.doc-this/context/file-manifest.json';
const LEDGER = '.doc-this/context/coverage-ledger.json';
const BACKFILL_DIR = '.doc-this/context/backfill';

const out = (s) => process.stdout.write(s);
const die = (msg) => { process.stderr.write(`backfill-coverage: ${msg}\n`); process.exit(2); };

const USAGE = `backfill-coverage.mjs — deterministic set-math for doc-this coverage fan-out.

Subcommands:
  unread [--counts]                  manifest source ∖ ledger (paths; --counts = summary only)
  chunk [--max-files N]              group unread by module prefix into chunk lists (default 40)
  verify-chunk <chunk.txt> <files.json>   assigned set == files_read[]? (exit 1 + MISSING/EXTRA)
  check-cites <staging.md>           every file:line citation exists and is in range (exit 1 + BAD CITE)
  check-frag <file> <line> <frag>    verbatim fragment within ±2 lines of the cited line (exit 0/1)

Exit codes: 0 ok, 1 check failed, 2 usage/environment error.`;

const usage = () => { out(USAGE + '\n'); process.exit(2); };

// Byte-order comparison, matching `LC_ALL=C sort`.
const byteCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortU = (arr) => [...new Set(arr)].sort(byteCmp);

function readJson(path, what) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { die(`could not parse ${what}: ${path}`); }
}

function requireEnv() {
  if (!existsSync('.doc-this')) die('no .doc-this/ here — run from the project root of an initialized doc-this run');
  if (!existsSync(MANIFEST)) die(`missing ${MANIFEST} — run Scout's manifest command first (step-06 §1)`);
}

function manifestSources() {
  const m = readJson(MANIFEST, 'manifest');
  return (m.files ?? []).filter((f) => f.class === 'source');
}

function computeUnread() {
  const manifest = sortU(manifestSources().map((f) => f.path));
  let ledger = [];
  if (existsSync(LEDGER)) {
    try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')).files_analyzed ?? []; } catch { ledger = []; }
  }
  const seen = new Set(ledger);
  return manifest.filter((p) => !seen.has(p));
}

function cmdUnread(args) {
  const wantCounts = args[0] === '--counts';
  requireEnv();
  const unread = computeUnread();
  if (!wantCounts) { if (unread.length) out(unread.join('\n') + '\n'); return 0; }
  out(`unread_total: ${unread.length}\n`);
  if (unread.length === 0) return 0;
  const subclassOf = new Map(manifestSources().map((f) => [f.path, f.subclass ?? 'other']));
  const counts = new Map();
  for (const p of unread) {
    const s = subclassOf.get(p) ?? 'other';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const s of [...counts.keys()].sort(byteCmp)) out(`${s}: ${counts.get(s)}\n`);
  return 0;
}

// Module prefix = first two path segments (one for root-level dirs, _root_ for bare files).
function modulePrefix(p) {
  const seg = p.split('/');
  if (seg.length <= 1) return '_root_';
  if (seg.length === 2) return seg[0];
  return `${seg[0]}/${seg[1]}`;
}

function cmdChunk(args) {
  let maxFiles = 40;
  if (args[0] === '--max-files') {
    const n = Number(args[1]);
    if (!Number.isInteger(n) || n < 1) die('--max-files needs a positive integer');
    maxFiles = n;
  }
  requireEnv();
  const unread = computeUnread();
  const chunksDir = join(BACKFILL_DIR, 'chunks');
  rmSync(chunksDir, { recursive: true, force: true });
  mkdirSync(chunksDir, { recursive: true });
  if (unread.length === 0) { out('0 unread files; nothing to chunk\n'); return 0; }

  const grouped = unread
    .map((p) => [modulePrefix(p), p])
    .sort((a, b) => byteCmp(a[0], b[0]) || byteCmp(a[1], b[1]));

  const files = [];
  let chunkIdx = 0, curMod = null, curCount = 0, curPart = 1, cur = null;
  for (const [mod, fpath] of grouped) {
    if (mod !== curMod || curCount >= maxFiles) {
      curPart = mod !== curMod ? 1 : curPart + 1;
      curMod = mod; curCount = 0; chunkIdx++;
      const slug = mod.replace(/\//g, '-').replace(/[^A-Za-z0-9._-]+/g, '-');
      let name = `${String(chunkIdx).padStart(3, '0')}-${slug}`;
      if (curPart > 1) name += `-p${curPart}`;
      cur = { path: join(chunksDir, `${name}.txt`), lines: [] };
      files.push(cur);
    }
    cur.lines.push(fpath);
    curCount++;
  }

  for (const f of files) writeFileSync(f.path, f.lines.join('\n') + '\n');
  for (const name of readdirSync(chunksDir).filter((n) => n.endsWith('.txt')).sort(byteCmp)) {
    const p = join(chunksDir, name);
    const count = readFileSync(p, 'utf8').split('\n').filter((l) => l !== '').length;
    out(`${p}\t${count}\n`);
  }
  return 0;
}

function cmdVerifyChunk(args) {
  const [chunkFile, filesJson] = args;
  if (!chunkFile || !filesJson) usage();
  if (!existsSync(chunkFile)) die(`chunk file not found: ${chunkFile}`);
  if (!existsSync(filesJson)) { out(`MISSING-FILES-JSON: ${filesJson}\n`); return 1; }

  const assigned = sortU(readFileSync(chunkFile, 'utf8').split('\n').filter((l) => l.trim() !== ''));
  let parsed;
  try { parsed = JSON.parse(readFileSync(filesJson, 'utf8')); }
  catch { out(`INVALID-FILES-JSON: ${filesJson}\n`); return 1; }

  const read = sortU(parsed.files_read ?? []);
  const readSet = new Set(read), assignedSet = new Set(assigned);
  const missing = assigned.filter((p) => !readSet.has(p));
  const extra = read.filter((p) => !assignedSet.has(p));

  for (const p of missing) out(`MISSING: ${p}\n`);
  for (const p of extra) out(`EXTRA: ${p}\n`);
  if (missing.length || extra.length) return 1;
  out(`OK: ${assigned.length} files verified\n`);
  return 0;
}

// file:line citations — extension must start with a letter, so "v2.6.0:30" / "1.5:1" don't match.
const CITE_RE = /`?[A-Za-z0-9_./-]+\.[A-Za-z][A-Za-z0-9]*:[0-9]+/g;

function cmdCheckCites(args) {
  const staging = args[0];
  if (!staging) usage();
  if (!existsSync(staging)) die(`staging file not found: ${staging}`);
  const text = readFileSync(staging, 'utf8');
  const cites = sortU((text.match(CITE_RE) ?? []).map((c) => c.replace(/`/g, '')));
  let bad = false;
  for (const cite of cites) {
    const idx = cite.lastIndexOf(':');
    const cfile = cite.slice(0, idx);
    const cline = Number(cite.slice(idx + 1));
    if (!existsSync(cfile)) { out(`BAD CITE (no such file): ${cite}\n`); bad = true; continue; }
    const total = readFileSync(cfile, 'utf8').split('\n').length - 1;
    if (cline > total) { out(`BAD CITE (line out of range): ${cite}\n`); bad = true; }
  }
  if (bad) return 1;
  out(`OK: ${cites.length} citations verified\n`);
  return 0;
}

function cmdCheckFrag(args) {
  const [cfile, clineRaw, frag] = args;
  if (!cfile || !clineRaw || !frag) usage();
  if (!existsSync(cfile)) { out(`FAIL (no such file): ${cfile}\n`); return 1; }
  const cline = Number(clineRaw);
  if (!Number.isInteger(cline) || cline < 1) die('line must be a positive integer');
  const lines = readFileSync(cfile, 'utf8').split('\n');
  const lo = Math.max(1, cline - 2), hi = cline + 2;
  const window = lines.slice(lo - 1, hi).join('\n');
  if (window.includes(frag)) { out(`OK: fragment found at ${cfile}:${cline} (±2)\n`); return 0; }
  out(`FAIL (fragment not within ±2 lines): ${cfile}:${cline}\n`);
  return 1;
}

const [cmd, ...rest] = process.argv.slice(2);
const dispatch = {
  'unread': cmdUnread,
  'chunk': cmdChunk,
  'verify-chunk': cmdVerifyChunk,
  'check-cites': cmdCheckCites,
  'check-frag': cmdCheckFrag,
};
if (!cmd || !dispatch[cmd]) usage();
process.exit(dispatch[cmd](rest));
