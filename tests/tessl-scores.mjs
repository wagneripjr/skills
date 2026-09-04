#!/usr/bin/env node
// tessl-scores.mjs — rebuild tests/tessl-scores.json from the tessl API (FR-TESSL-2).
//
// MAINTAINER STEP, excluded from tests/run-all.mjs: it needs `tessl login`. It is FREE —
// `tessl review list` reads reviews that were already paid for and submits nothing. The
// committed JSON is what everyone else reads; tests/test-tessl-scores.mjs asserts it without
// an account, a network or a credit.
//
// Why a generated file at all: the hand-written score prose in CLAUDE.md and in the memory
// index drifted by up to 10 points in BOTH directions, because a number written by hand is
// never re-derived. Nothing hand-writes a score any more.
//
// Every row names its RUBRIC. Two are in play — tessl/default-skill-review and a local
// review-plugin that adds a fifth judge — and their numbers are not one scale: the same
// okf-maintain bytes scored 87 on one and 95 on the other, 40 minutes apart.
//
// Run ids and workspace ids are deliberately NOT recorded: this repository is public, and
// CLAUDE.md already states that rule for the evals RESULTS.json. The rubric plus the date is
// what makes two scores comparable, which is the property that was missing.
//
// Known limit: the API identifies a subject by repo-relative path, so a review of
// `skills/postmortem/SKILL.md` run from a DIFFERENT repository is indistinguishable from one
// run here. Rows are filtered to paths that exist in this tree and latest-per-rubric wins,
// which is the best discrimination available.
//
// Usage: tessl-scores.mjs [--check]     --check diffs instead of writing (exit 1 on drift).
//
// Zero dependencies. Node >= 18.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveTessl } from './lib/tessl.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCORES_PATH = resolve(ROOT, 'tests', 'tessl-scores.json');

// A run carries either a published rubric ref or an uploaded local plugin. Name both; an
// unnamed rubric is what made the old record uncomparable.
export function rubricOf(config) {
  if (config?.pluginRef) return config.pluginRef;
  if (config?.reviewPluginName) return config.reviewPluginName;
  if (config?.pluginUploadKey) return 'local:review-plugin';
  return 'unknown';
}

const dimsOf = (judge) => {
  const scores = judge?.evaluation?.scores;
  if (!scores || typeof scores !== 'object') return undefined;
  const out = {};
  for (const key of Object.keys(scores).sort()) {
    const value = scores[key]?.score;
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
};

// Latest completed quality run per (subject path, rubric), restricted to skills that exist here.
export function rowsFrom(reviews, { exists = (p) => existsSync(resolve(ROOT, p)) } = {}) {
  const best = new Map();
  for (const review of reviews) {
    const a = review?.attributes ?? review;
    if (a?.kind !== 'quality' || a?.status !== 'completed') continue;
    if (typeof a.score !== 'number' || !Number.isFinite(a.score)) continue;
    const subject = a?.metadata?.subject;
    if (subject?.type !== 'skill' || typeof subject.path !== 'string') continue;
    if (!exists(subject.path)) continue;
    const rubric = rubricOf(a.config);
    const key = `${subject.path} ${rubric}`;
    const previous = best.get(key);
    if (previous && previous.createdAt >= a.createdAt) continue;
    best.set(key, {
      createdAt: a.createdAt,
      row: {
        skill: subject.name,
        path: subject.path,
        rubric,
        score: a.score,
        date: String(a.createdAt).slice(0, 10),
        judges: {
          content: dimsOf(a?.results?.judges?.content),
          description: dimsOf(a?.results?.judges?.description),
        },
      },
    });
  }
  return [...best.values()]
    .map((entry) => entry.row)
    .sort((x, y) => x.skill.localeCompare(y.skill) || x.rubric.localeCompare(y.rubric));
}

function fetchReviews() {
  const tessl = resolveTessl();
  if (!tessl) return { error: 'tessl CLI not found — install it or set $TESSL_BIN' };
  const r = spawnSync(tessl.cmd, [...tessl.prefix, 'review', 'list', '--limit', '100', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, AGENT: '1' },
  });
  if (r.error || r.status !== 0) {
    return { error: `tessl review list failed: ${(r.stderr || '').trim() || r.status}` };
  }
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return { error: 'tessl review list returned unparseable JSON' }; }
  if (!Array.isArray(parsed?.data)) return { error: 'tessl review list returned no data array' };
  return { data: parsed.data, more: Boolean(parsed?.links?.next) };
}

function main(argv) {
  const check = argv.includes('--check');
  const { data, more, error } = fetchReviews();
  if (error) { process.stderr.write(`${error}\n`); return 1; }
  if (more) process.stderr.write('warning: more reviews exist than one page holds; raise --limit\n');

  const rows = rowsFrom(data);
  if (rows.length === 0) { process.stderr.write('error: no reviews matched a skill in this tree\n'); return 1; }
  const next = `${JSON.stringify({ generator: 'tests/tessl-scores.mjs', rows }, null, 2)}\n`;

  if (check) {
    const current = existsSync(SCORES_PATH) ? readFileSync(SCORES_PATH, 'utf8') : '';
    if (current === next) { process.stdout.write(`up to date: ${rows.length} rows\n`); return 0; }
    process.stdout.write('DRIFT: tests/tessl-scores.json does not match the API — re-run without --check\n');
    return 1;
  }
  writeFileSync(SCORES_PATH, next);
  process.stdout.write(`wrote ${rows.length} rows to tests/tessl-scores.json\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
