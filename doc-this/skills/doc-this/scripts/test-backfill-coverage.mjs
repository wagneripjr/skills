#!/usr/bin/env node
// Regression harness for backfill-coverage.mjs. Runs in a throwaway sandbox project.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness } from '../../../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SUT = join(SCRIPT_DIR, 'backfill-coverage.mjs');

const h = new Harness('backfill-coverage');
const SANDBOX = h.mkTemp('dtbf-test-');

const run = (...args) => {
  const r = spawnSync(process.execPath, [SUT, ...args], { cwd: SANDBOX, encoding: 'utf8' });
  return { rc: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

const sb = (...p) => join(SANDBOX, ...p);
const write = (rel, body) => writeFileSync(sb(rel), body);
const lines = (s) => s.split('\n').filter((l) => l !== '');

function check(desc, expectedExit, actualExit, expectedGrep, output) {
  let good = actualExit === expectedExit;
  if (good && expectedGrep) good = new RegExp(expectedGrep).test(output);
  if (good) h.ok(`${desc} (exit ${actualExit})`);
  else h.bad(`${desc} (exit ${actualExit}, wanted ${expectedExit}; grep ${expectedGrep || '—'})`,
    output.split('\n').map((l) => `| ${l}`).join('\n        '));
}

// --- Fixture project ---------------------------------------------------------
for (const d of ['.doc-this/context', 'Web/registration', 'Web/reports', 'sql']) {
  mkdirSync(sb(...d.split('/')), { recursive: true });
}
write('Web/registration/a.aspx', 'line1\nline2\nline3\nline4\nline5\n');
write('Web/registration/b.aspx', 'x\ny\n');
write('Web/registration/c.aspx', 'x\ny\n');
write('Web/reports/r1.aspx', 'x\ny\n');
write('sql/q1.sql', 'select 1;\n');
write('sql/q2.sql', 'select 2;\n');
write('Global.asax', 'root\n');

write('.doc-this/context/file-manifest.json', JSON.stringify({
  files: [
    { path: 'Web/registration/a.aspx', class: 'source', subclass: 'markup' },
    { path: 'Web/registration/b.aspx', class: 'source', subclass: 'markup' },
    { path: 'Web/registration/c.aspx', class: 'source', subclass: 'markup' },
    { path: 'Web/reports/r1.aspx', class: 'source', subclass: 'markup' },
    { path: 'sql/q1.sql', class: 'source', subclass: 'sql' },
    { path: 'sql/q2.sql', class: 'source', subclass: 'sql' },
    { path: 'Global.asax', class: 'source', subclass: 'markup' },
    { path: 'vendor/lib.min.js', class: 'vendored', subclass: 'code' },
  ],
}));
write('.doc-this/context/coverage-ledger.json', '{"files_analyzed":["sql/q2.sql","Web/reports/r1.aspx"]}');

// --- unread ------------------------------------------------------------------
let r = run('unread');
check('unread: 5 paths, excludes ledgered + vendored', 0, r.rc, '', r.out);
h.check('unread: exact set membership',
  lines(r.out).length === 5 && lines(r.out).includes('Global.asax')
  && !r.out.includes('q2.sql') && !r.out.includes('lib.min.js'), r.out);

r = run('unread', '--counts');
check('unread --counts: total 5', 0, r.rc, 'unread_total: 5', r.out);
check('unread --counts: markup 4', 0, r.rc, 'markup: 4', r.out);
check('unread --counts: sql 1', 0, r.rc, 'sql: 1', r.out);

renameSync(sb('.doc-this/context/coverage-ledger.json'), sb('ledger.bak'));
r = run('unread');
check('unread: missing ledger = all 7 source files', 0, r.rc, '', r.out);
h.check('unread: missing-ledger count', lines(r.out).length === 7, r.out);
renameSync(sb('ledger.bak'), sb('.doc-this/context/coverage-ledger.json'));

// --- chunk -------------------------------------------------------------------
const chunksDir = sb('.doc-this/context/backfill/chunks');
const chunkFiles = () => (existsSync(chunksDir) ? readdirSync(chunksDir).filter((f) => f.endsWith('.txt')) : []);
const chunkLineTotal = () => chunkFiles().reduce((n, f) => n + lines(readFileSync(join(chunksDir, f), 'utf8')).length, 0);

r = run('chunk', '--max-files', '2');
check('chunk: exits 0 with summary', 0, r.rc, 'chunks/001-', r.out);
h.check('chunk: 5 files in 4 chunks, oversize module split (-p2)',
  chunkLineTotal() === 5 && chunkFiles().length === 4 && chunkFiles().some((f) => f.includes('p2')),
  `got ${chunkLineTotal()} files in ${chunkFiles().length} chunks: ${chunkFiles().join(' ')}`);

// Idempotence: grow the ledger, re-chunk → merged file disappears, no stale chunks.
const ledger = JSON.parse(readFileSync(sb('.doc-this/context/coverage-ledger.json'), 'utf8'));
ledger.files_analyzed.push('Web/registration/a.aspx');
write('.doc-this/context/coverage-ledger.json', JSON.stringify(ledger));
run('chunk', '--max-files', '2');
const stale = chunkFiles().some((f) => readFileSync(join(chunksDir, f), 'utf8').includes('a.aspx'));
h.check('chunk: idempotent regen drops newly-ledgered file',
  !stale && chunkLineTotal() === 4, 'stale chunk content after ledger grew');

// --- verify-chunk ------------------------------------------------------------
write('assigned.txt', 'Web/registration/b.aspx\nWeb/registration/c.aspx\n');
write('read-ok.json', '{"files_read":["Web/registration/b.aspx","Web/registration/c.aspx"]}\n');
write('read-missing.json', '{"files_read":["Web/registration/b.aspx"]}\n');
write('read-extra.json', '{"files_read":["Web/registration/b.aspx","Web/registration/c.aspx","sql/q1.sql"]}\n');
write('read-bad.json', 'not json\n');

r = run('verify-chunk', 'assigned.txt', 'read-ok.json');
check('verify-chunk: clean pass', 0, r.rc, 'OK: 2 files verified', r.out);
r = run('verify-chunk', 'assigned.txt', 'read-missing.json');
check('verify-chunk: missing file flagged', 1, r.rc, 'MISSING: Web/registration/c\\.aspx', r.out);
r = run('verify-chunk', 'assigned.txt', 'read-extra.json');
check('verify-chunk: extra file flagged', 1, r.rc, 'EXTRA: sql/q1\\.sql', r.out);
r = run('verify-chunk', 'assigned.txt', 'read-bad.json');
check('verify-chunk: invalid JSON flagged', 1, r.rc, 'INVALID-FILES-JSON', r.out);

// --- check-cites -------------------------------------------------------------
write('staging-good.md', 'The form posts back per `Web/registration/a.aspx:3`. Version v2.6.0:30 and ratio 1.5:1 are not citations.\n');
write('staging-bad.md', 'Claims `Web/registration/missing.aspx:2` and out-of-range `Web/registration/b.aspx:99`.\n');

r = run('check-cites', 'staging-good.md');
check('check-cites: valid cite passes, version strings ignored', 0, r.rc, 'OK: 1 citations verified', r.out);
r = run('check-cites', 'staging-bad.md');
check('check-cites: missing file flagged', 1, r.rc, 'BAD CITE \\(no such file\\): Web/registration/missing\\.aspx:2', r.out);
check('check-cites: out-of-range line flagged', 1, r.rc, 'BAD CITE \\(line out of range\\): Web/registration/b\\.aspx:99', r.out);

// --- check-frag --------------------------------------------------------------
r = run('check-frag', 'Web/registration/a.aspx', '3', 'line3');
check('check-frag: exact line hit', 0, r.rc, 'OK', r.out);
r = run('check-frag', 'Web/registration/a.aspx', '5', 'line3');
check('check-frag: ±2 tolerance hit', 0, r.rc, 'OK', r.out);
r = run('check-frag', 'Web/registration/a.aspx', '1', 'line5');
check('check-frag: outside tolerance fails', 1, r.rc, 'FAIL', r.out);

// --- usage -------------------------------------------------------------------
r = run('bogus');
check('usage: unknown subcommand exits 2', 2, r.rc, 'Subcommands', r.out);

h.done();
