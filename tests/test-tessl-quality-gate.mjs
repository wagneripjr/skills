#!/usr/bin/env node
// Optional quality harness: score one skill with `tessl skill review` and fail when the
// score is below a floor.
//
// NOT part of the normal test suite and NOT required to contribute. It needs a tessl
// account, and the review UPLOADS THE SKILL BODY to tessl's hosted service — never point
// it at anything confidential. See "Skill quality review" in README.md.
//
// Usage: test-tessl-quality-gate.mjs <skill-dir> <min-score> [remote]
//
//   local  (default) reviews the working copy on disk.
//   remote           reviews the pushed copy on GitHub. Local review does not bundle
//                    reference/ subdirectories, so judges see broken links and dock
//                    progressive_disclosure/actionability; remote sees the full bundle.
//                    The repo is taken from $TESSL_REPO, else derived from origin.
//
// Exit: 0 score >= min · 1 score < min or bad usage · 77 skipped (prerequisite missing).
// 77 is the same "skipped" code doc-this/hooks/run-all.mjs uses: a review that could not
// run is not a pass, and must never be reported as one.

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const usage = () => {
  process.stderr.write('usage: test-tessl-quality-gate.mjs <skill-dir> <min-score> [remote]\n');
  process.exit(1);
};

const [skillDir, minRaw, mode = 'local'] = process.argv.slice(2);
if (!skillDir || !minRaw) usage();

if (!/^\d+$/.test(minRaw)) {
  process.stderr.write(`error: min-score must be an integer, got '${minRaw}'\n`);
  usage();
}
const min = Number(minRaw);

if (!existsSync(join(skillDir, 'SKILL.md'))) {
  process.stdout.write(`FAIL: ${skillDir} has no SKILL.md\n`);
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (spawnSync(npx, ['--version'], { stdio: 'ignore' }).error) {
  process.stdout.write('SKIP: npx not found — install Node to run the tessl review.\n');
  process.exit(77);
}

let args;
if (mode === 'remote') {
  let repo = process.env.TESSL_REPO ?? '';
  if (!repo) {
    const origin = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout?.trim() ?? '';
    repo = origin
      .replace(/^git@github\.com:/, 'github:')
      .replace(/^https:\/\/github\.com\//, 'github:')
      .replace(/\.git$/, '');
  }
  if (!/^github:[^/]+\/[^/]+$/.test(repo)) {
    process.stdout.write('SKIP: cannot determine the GitHub repo for a remote review.\n');
    process.stdout.write('      Set TESSL_REPO=github:<owner>/<repo>, or use the default local mode.\n');
    process.exit(77);
  }
  process.stdout.write(`note: uploading ${skillDir} to tessl's hosted review service (via ${repo}).\n`);
  args = ['tessl', 'skill', 'review', repo, '--skill', basename(skillDir), '--json'];
} else {
  process.stdout.write(`note: uploading ${skillDir}/SKILL.md to tessl's hosted review service.\n`);
  args = ['tessl', 'skill', 'review', skillDir, '--json'];
}

const out = spawnSync(npx, args, { encoding: 'utf8' }).stdout ?? '';

let score;
try {
  const parsed = JSON.parse(out).review?.reviewScore;
  if (typeof parsed === 'number') score = parsed;
} catch { /* leave undefined */ }

if (score === undefined) {
  process.stdout.write('SKIP: no reviewScore returned — tessl is unavailable, unauthenticated, or offline.\n');
  process.stdout.write(`      Run 'npx tessl login' and retry. Nothing was asserted about ${skillDir}.\n`);
  process.exit(77);
}

if (score >= min) {
  process.stdout.write(`reviewScore ${score} >= ${min} for ${skillDir}\n1 passed, 0 failed\n`);
  process.exit(0);
}

process.stdout.write(`FAIL: reviewScore ${score} < ${min} for ${skillDir}\n0 passed, 1 failed\n`);
process.exit(1);
