#!/usr/bin/env node
// test-tessl-score-parse.mjs — the tessl harness's parsing rules, asserted without an account,
// a network, or a credit. Everything the quality gate decides hangs on reviewScoreFrom, and
// until this suite existed nothing in this repo asserted anything about tessl at all.
//   AC-1 real shapes      — the captured review view / review list envelopes yield their real score
//   AC-2 canaries         — missing, null, string, out-of-range scores all yield undefined
//   AC-3 zero boundary    — reviewScore 0 yields 0, NOT undefined (the `if (!score)` bug)
//   AC-4 run id           — reviewIdFrom finds the id the `view` fallback needs, and only a real one
//   AC-5 resolver         — resolveTessl returns null on an empty environment instead of throwing
//   AC-6 workspace        — flag beats env, blank is undefined (a blank workspace must SKIP, not run)
//   AC-7 discriminating   — a truthiness check in place of the finite-number guard flips AC-3
// The fixtures under tests/fixtures/tessl/ are REAL envelopes captured from tessl 0.105.0, with
// ids replaced by obvious placeholders and judge prose elided. They pin the envelope, not the
// prose: a fixture written from the implementation would be the projection-checked-against-itself
// fail-open in a new costume.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Harness } from './lib/harness.mjs';
import { reviewScoreFrom, reviewIdFrom, parseJson, resolveTessl, workspaceFrom } from './lib/tessl.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(DIR, 'fixtures', 'tessl');
const load = (n) => JSON.parse(readFileSync(join(FIX, n), 'utf8'));

const h = new Harness('tessl score parsing, binary resolution, workspace resolution');

// AC-1 real shapes
const view = load('review-view.json');
const list = load('review-list.json');
h.equal('AC-1a review view envelope yields review.reviewScore', reviewScoreFrom(view), 93);
h.equal('AC-1b review list envelope yields data[0].attributes.score', reviewScoreFrom(list), 93);
h.equal('AC-1c a single JSON:API row yields attributes.score', reviewScoreFrom(list.data[0]), 93);

// AC-2 canaries — each of these must NOT be read as a score
const canaries = [
  ['empty object', {}],
  ['empty review', { review: {} }],
  ['string score', { review: { reviewScore: '93' } }],
  ['null score', { review: { reviewScore: null } }],
  ['out of range high', { review: { reviewScore: 105 } }],
  ['out of range low', { review: { reviewScore: -1 } }],
  ['NaN', { review: { reviewScore: Number.NaN } }],
  ['Infinity', { review: { reviewScore: Number.POSITIVE_INFINITY } }],
  ['boolean', { score: true }],
  ['undefined input', undefined],
  ['null input', null],
  ['array input', []],
];
let a2 = true;
for (const [name, input] of canaries) {
  if (reviewScoreFrom(input) !== undefined) { process.stdout.write(`    canary read as a score: ${name}\n`); a2 = false; }
}
h.check(`AC-2 ${canaries.length} canaries all yield undefined`, a2);

// AC-3 zero boundary — the exact defect an `if (!score)` refactor introduces
h.equal('AC-3a reviewScore 0 is a score, not a miss', reviewScoreFrom({ review: { reviewScore: 0 } }), 0);
h.equal('AC-3b attributes.score 0 is a score, not a miss', reviewScoreFrom({ attributes: { score: 0 } }), 0);
h.equal('AC-3c score 100 is in range', reviewScoreFrom({ score: 100 }), 100);

// AC-4 run id — the `review view <id>` fallback is worthless without it
h.equal('AC-4a reviewIdFrom reads reviewRunId', reviewIdFrom(view), '00000000-0000-7000-8000-000000000001');
h.equal('AC-4b reviewIdFrom reads a JSON:API row id', reviewIdFrom(list.data[0]), '00000000-0000-7000-8000-000000000001');
h.equal('AC-4c an empty id is not an id', reviewIdFrom({ id: '' }), undefined);
h.equal('AC-4d a numeric id is not an id', reviewIdFrom({ id: 7 }), undefined);
h.equal('AC-4e parseJson survives garbage', parseJson('not json'), undefined);

// AC-5 resolver — probe is injected so this asserts the resolution ORDER, not the machine
const seen = [];
const never = (cmd) => { seen.push(cmd); return false; };
h.equal('AC-5a nothing resolvable yields null, not a throw', resolveTessl({ env: {}, probe: never }), null);
h.equal('AC-5f allowNpx:false refuses the registry fallback (no network in the default suite)',
  resolveTessl({ env: {}, probe: (c) => c.startsWith('npx'), allowNpx: false }), null);
h.check('AC-5b it tried the PATH binary and npx before giving up', seen.includes('tessl') && seen.some((c) => c.startsWith('npx')));
h.equal('AC-5c $TESSL_BIN wins when it probes clean',
  resolveTessl({ env: { TESSL_BIN: '/opt/tessl' }, probe: (c) => c === '/opt/tessl' })?.cmd, '/opt/tessl');
h.equal('AC-5d an unusable $TESSL_BIN falls through to PATH',
  resolveTessl({ env: { TESSL_BIN: '/opt/gone' }, probe: (c) => c === 'tessl' })?.cmd, 'tessl');
const viaNpx = resolveTessl({ env: {}, probe: (c) => c.startsWith('npx') });
h.check('AC-5e the npx fallback carries the tessl argv prefix', viaNpx?.prefix?.[0] === 'tessl', JSON.stringify(viaNpx));

// AC-6 workspace — a blank workspace must be undefined so the gate SKIPs rather than running
h.equal('AC-6a the flag wins over the env', workspaceFrom({ flag: 'a', env: { TESSL_WORKSPACE: 'b' } }), 'a');
h.equal('AC-6b the env is used when no flag is given', workspaceFrom({ env: { TESSL_WORKSPACE: 'b' } }), 'b');
h.equal('AC-6c whitespace is not a workspace', workspaceFrom({ env: { TESSL_WORKSPACE: '   ' } }), undefined);
h.equal('AC-6d absent is undefined', workspaceFrom({ env: {} }), undefined);

// AC-7 discriminating — a truthiness guard in place of the finite-number check must flip AC-3.
// Mutation-testing the guard itself: a green suite proves nothing about a fresh guard.
const truthy = (o) => (o?.review?.reviewScore ? o.review.reviewScore : undefined);
h.check('AC-7 a truthiness guard would misread score 0 (AC-3 is discriminating)',
  truthy({ review: { reviewScore: 0 } }) === undefined && reviewScoreFrom({ review: { reviewScore: 0 } }) === 0,
  'AC-3 would not catch the truthiness bug');

if (h.fail === 0) process.stdout.write('\ntessl score-parse suite: GREEN\n');
h.done();
