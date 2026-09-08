#!/usr/bin/env node
// Every harness in this repository must be reachable by tests/run-all.mjs.
//
// The runner discovers exactly one thing: tests/test-*.mjs. It used to also probe two
// paths inside a plugin directory, and FR-LAYOUT-1 moved that directory without moving
// the probes — so eight harnesses (138 assertions) stopped running while CI kept
// reporting ALL SUITES PASSED. Nothing failed, because the probes were `existsSync`
// guards: a discovery rule that finds nothing looks exactly like a tree with nothing
// to find.
//
// This asserts the invariant that makes the runner's single rule sufficient: no file
// named test-*.mjs is tracked outside tests/. A harness placed anywhere else fails
// here instead of disappearing.
//
// Zero dependencies. Node >= 18.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Harness, skip } from './lib/harness.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// git is the enumerator on purpose: the question is which harnesses ship, and a
// filesystem walk would also count throwaway files no clone ever receives.
let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
} catch {
  skip('git is unavailable; there is no way to enumerate what this repository ships');
}

const h = new Harness('suite discovery — no harness lives where the runner cannot see it');

const HARNESS = /(^|\/)test-[^/]*\.mjs$/;
const strays = tracked.filter((p) => HARNESS.test(p) && dirname(p) !== 'tests');

for (const p of strays) process.stdout.write(`  stray harness: ${p}\n`);
h.check(
  'AC-1 every tracked test-*.mjs sits directly in tests/',
  strays.length === 0,
  `${strays.length} outside tests/ — run-all.mjs would never invoke them`,
);

// The canary: the check must be able to fail. A path that IS a stray proves the
// matcher fires, and one that merely resembles it proves the matcher is not
// indiscriminate. Both directions, because a pattern matching everything and a
// pattern matching nothing look identical from the green side.
h.check(
  'AC-2a the matcher flags a harness outside tests/',
  HARNESS.test('plugins/doc-this/hooks/test-doc-this-dispatch-gate.mjs'),
);
h.check(
  'AC-2b the matcher ignores a file that merely contains the prefix',
  !HARNESS.test('tests/fixtures/okf-frontmatter/latest-test-note.md'),
);
h.check(
  'AC-2c the matcher does not treat a nested tests/ directory as this one',
  HARNESS.test('plugins/doc-this/tests/test-something.mjs'),
);

h.done();
