// Shared helpers for the tessl harnesses. Pure functions plus one binary resolver, so the
// parsing rules can be asserted (tests/test-tessl-score-parse.mjs) without an account, a
// network, or a credit.

import { spawnSync } from 'node:child_process';

// `tessl review run quality --json` and `tessl review view --json` do not return the same
// envelope, and `tessl review list --json` returns a third (JSON:API). Rather than guess one,
// read whichever is present. A score is a finite number in 0..100 — the string "93" is not a
// score, and neither is null, undefined, NaN or 105. Zero IS a score: `if (!score)` is the bug
// this guard exists to prevent.
const CANDIDATES = [
  (o) => o?.review?.reviewScore,
  (o) => o?.attributes?.score,
  (o) => o?.data?.attributes?.score,
  (o) => o?.data?.[0]?.attributes?.score,
  (o) => o?.score,
];

export function reviewScoreFrom(obj) {
  for (const pick of CANDIDATES) {
    let value;
    try { value = pick(obj); } catch { continue; }
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value < 0 || value > 100) continue;
    return value;
  }
  return undefined;
}

// `tessl review run --json` may report an id without a score. That review is already paid for,
// so the fallback is `tessl review view <id> --json`, whose shape is verified.
export function reviewIdFrom(obj) {
  const value = obj?.reviewRunId ?? obj?.review?.id ?? obj?.id ?? obj?.data?.id;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

// $TESSL_BIN, then a `tessl` already on PATH, then `npx tessl` — verified 2026-09-04 to resolve
// the same 0.105.0 with the same review flags. PATH first because npx refetches on every call and
// pins nothing: gating on an unpinned CLI means gating on a rubric that can move under you.
// `allowNpx: false` is for suites that run in the default test run: npx would fetch tessl from
// the registry on a cold CI machine, turning a local structural check into a network call.
export function resolveTessl({ env = process.env, probe = defaultProbe, allowNpx = true } = {}) {
  const override = env.TESSL_BIN;
  if (override && probe(override, ['--version'], env)) return { cmd: override, prefix: [] };
  if (probe('tessl', ['--version'], env)) return { cmd: 'tessl', prefix: [] };
  if (!allowNpx) return null;
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  if (probe(npx, ['--version'], env)) return { cmd: npx, prefix: ['tessl'] };
  return null;
}

function defaultProbe(cmd, args, env) {
  const r = spawnSync(cmd, args, { stdio: 'ignore', env });
  return !r.error && r.status === 0;
}

export function workspaceFrom({ flag, env = process.env } = {}) {
  const value = flag ?? env.TESSL_WORKSPACE ?? '';
  return value.trim() || undefined;
}
