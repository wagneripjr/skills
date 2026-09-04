#!/usr/bin/env node
// Optional quality harness: score one skill with Tessl Review (`tessl review run quality`) and
// fail when the score is below a floor.
//
// NOT part of the normal test suite and NOT required to contribute. It needs a tessl account,
// and the review UPLOADS THE WHOLE SKILL DIRECTORY — SKILL.md plus references/, scripts/ and
// assets/ — to tessl's hosted service. Never point it at anything confidential. See "Skill
// quality review" in README.md.
//
// Usage: test-tessl-quality-gate.mjs <skill-dir> <min-score> [--workspace <name>]
//
// The workspace comes from --workspace, else $TESSL_WORKSPACE. There is no default: the value
// is an account name and this repository is public.
//
// `--threshold 0` is passed on purpose. It disables tessl's own gating, so a validation warning
// can never reach this harness as a non-zero exit and be misreported as "below floor" — the
// three outcomes below are decided here, from the score, and nowhere else.
//
// Exit: 0 score >= min · 1 score < min or bad usage · 77 skipped (prerequisite missing).
// 77 is the same "skipped" code doc-this/hooks/run-all.mjs uses: a review that could not run is
// not a pass, and must never be reported as one.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reviewScoreFrom, reviewIdFrom, parseJson, resolveTessl, workspaceFrom } from './lib/tessl.mjs';

const out = (s) => process.stdout.write(s);

const usage = () => {
  process.stderr.write('usage: test-tessl-quality-gate.mjs <skill-dir> <min-score> [--workspace <name>]\n');
  process.exit(1);
};

const skip = (reason, hint) => {
  out(`SKIP: ${reason}\n`);
  if (hint) out(`      ${hint}\n`);
  process.exit(77);
};

const argv = process.argv.slice(2);
const wsIndex = argv.findIndex((a) => a === '--workspace' || a === '-w');
let wsFlag;
if (wsIndex !== -1) {
  wsFlag = argv[wsIndex + 1];
  argv.splice(wsIndex, wsFlag === undefined ? 1 : 2);
}
const [skillDir, minRaw] = argv;
if (!skillDir || !minRaw) usage();

if (!/^\d+$/.test(minRaw)) {
  process.stderr.write(`error: min-score must be an integer, got '${minRaw}'\n`);
  usage();
}
const min = Number(minRaw);

if (!existsSync(join(skillDir, 'SKILL.md'))) {
  out(`FAIL: ${skillDir} has no SKILL.md\n`);
  process.exit(1);
}

const workspace = workspaceFrom({ flag: wsFlag });
if (!workspace) {
  skip('no tessl workspace given — nothing was asserted.',
    'Pass --workspace <name> or set TESSL_WORKSPACE. `tessl workspace list` names yours.');
}

const bin = resolveTessl();
if (!bin) {
  skip('no tessl CLI found — nothing was asserted.',
    'Install it, set $TESSL_BIN, or make `npx` available. See https://docs.tessl.io.');
}

const run = (args) => {
  const r = spawnSync(bin.cmd, [...bin.prefix, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
};

// Free preflight: proves authentication AND workspace resolution without submitting a review.
// Without it the first thing a logged-out run discovers is a wasted review submission.
const pre = run(['review', 'list', '--workspace', workspace, '--json', '--limit', '1']);
if (pre.status !== 0) {
  skip(`tessl is unavailable, unauthenticated, or does not know workspace '${workspace}'.`,
    `Run 'tessl login', then retry. exit=${pre.status} ${(pre.stderr || pre.stdout).trim().split('\n')[0] ?? ''}`);
}

out(`note: uploading ${skillDir}/ (SKILL.md and every bundled file) to tessl's hosted review service.\n`);
const res = run(['review', 'run', 'quality', skillDir, '--workspace', workspace, '--json', '--threshold', '0']);
const parsed = parseJson(res.stdout);
let score = reviewScoreFrom(parsed);

// `run --json` and `view --json` do not return the same envelope. When the run reports only an
// id, read the score back from the review it already paid for rather than submitting another.
if (score === undefined) {
  const id = reviewIdFrom(parsed);
  if (id) {
    const view = run(['review', 'view', id, '--workspace', workspace, '--json']);
    score = reviewScoreFrom(parseJson(view.stdout));
  }
}

if (score === undefined) {
  skip(`no review score returned for ${skillDir} — nothing was asserted.`,
    `exit=${res.status} ${(res.stderr || res.stdout).trim().split('\n').slice(0, 2).join(' | ')}`);
}

if (score >= min) {
  out(`reviewScore ${score} >= ${min} for ${skillDir}\n1 passed, 0 failed\n`);
  process.exit(0);
}

out(`FAIL: reviewScore ${score} < ${min} for ${skillDir}\n0 passed, 1 failed\n`);
process.exit(1);
