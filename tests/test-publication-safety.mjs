#!/usr/bin/env node
// test-publication-safety.mjs — repo-wide scan for material that must not be published.
//
// Generalizes AC-7 of tests/test-fr-proto-1.mjs from one skill directory to every tracked file.
//
// Two rules, both STRUCTURAL — this file never lists the literal strings it guards against.
// A guard that names its targets becomes the sole carrier of them (the defect
// test-fr-bundle-3.mjs AC-2 already fixed), and a literal list goes stale the moment the tree
// grows. See CLAUDE.md, "Writing a scanning check".
//
//   1. Provider-shaped credentials — vendor prefixes and key headers whose SHAPE is the
//      evidence. Near-zero false positives, so any hit fails.
//   2. Credential-key assignments — a password/secret/token-ish key assigned a literal. Fails
//      only when that literal is long AND mixes character classes, i.e. it looks generated.
//      `password: test_pass` in an Airflow tutorial is not a leak, and failing on it would
//      teach contributors to ignore a red suite.
//
// Values carrying a placeholder marker are allowed: that marker is the industry convention for
// "deliberately fake" (AWS publishes AKIAIOSFODNN7EXAMPLE in its own documentation).
//
// Every rule is proven against a canary before any verdict is trusted. A scan that silently
// reads nothing reports a clean tree.
//
// Optional: SKILLS_DENYLIST=/path/to/terms.txt adds a maintainer-only term list, kept outside
// the repo. Absent, that check SKIPs — never fails.
//
// Exit: 0 clean · 1 findings, or a canary that did not trip.
//
// Zero dependencies. Node >= 18.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Deliberately-fake markers. Structural: any value announcing itself as an example is allowed.
const PLACEHOLDER = /example|placeholder|notreal|changeme|redacted|dummy|sample|your[_-]?|xxxx/i;

// Rule 1 — the shape IS the evidence.
const PROVIDER = [
  ['private key header', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ['GitHub token',       /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ['GitHub PAT',         /\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['Slack token',        /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Anthropic key',      /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['OpenAI key',         /\bsk-[A-Za-z0-9]{32,}\b/],
  ['AWS access key id',  /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key',     /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['JWT',                /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];

// Rule 2 — a credential-ish key assigned a literal. $VAR, <..>, {..} are references, not values.
const ASSIGNMENT =
  /[A-Za-z0-9_-]*(?:passwd|password|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)[A-Za-z0-9_-]*\s*[:=]\s*["']?([^"'$<{\s,)]+)/i;

// A generated credential is long and mixes classes. Prose examples are short, or one class.
const looksGenerated = (v) =>
  v.length >= 20 && /[A-Za-z]/.test(v) && /[0-9]/.test(v) && !PLACEHOLDER.test(v);

function scanLine(line) {
  for (const [label, re] of PROVIDER) {
    const m = line.match(re);
    if (m && !PLACEHOLDER.test(m[0])) return label;
  }
  const a = line.match(ASSIGNMENT);
  if (a && looksGenerated(a[1])) return 'high-entropy credential assignment';
  return null;
}

// --- canaries: prove both directions before trusting a verdict -------------------------------
const MUST_FLAG = [
  'AKIA' + 'QRSTUVWX' + 'YZ234567',
  'api_key: ' + 'a9f3' + 'c1d84b26e07f5' + '3ab19d2',
  'ghp_' + 'aB3'.repeat(12),
  '-----BEGIN RSA ' + 'PRIVATE' + ' KEY-----',   // split: a literal here would flag this file
];
const MUST_NOT_FLAG = [
  'password: test_pass',
  'MYCLI_PASSWORD=hunter2',
  'conn_password: password123',
  '"login": "AKIAIOSFODNN7EXAMPLE",',
  'api_key: ${MY_TOKEN}',
  'client_secret: <your-secret-here>',
  '- `login(email: string, password: string): Promise<AuthToken>`',
];

let broken = 0;
for (const c of MUST_FLAG) {
  if (!scanLine(c)) { console.log(`  FAIL  canary not flagged — the scan is inert: ${c.slice(0, 24)}…`); broken++; }
}
for (const c of MUST_NOT_FLAG) {
  const hit = scanLine(c);
  if (hit) { console.log(`  FAIL  control flagged as [${hit}] — the scan is too broad: ${c}`); broken++; }
}
if (broken) {
  console.log(`\npublication-safety: ${broken} canary failure(s) — verdict UNVERIFIED`);
  process.exit(1);
}
console.log(`  PASS  scan verified against ${MUST_FLAG.length} canaries and ${MUST_NOT_FLAG.length} controls`);

// --- the scan --------------------------------------------------------------------------------
// Tracked files PLUS untracked-but-not-ignored ones. Scanning only `ls-files` means a new file
// reads as clean until the moment it is staged — which is the moment it is too late to be useful
// locally. `--exclude-standard` still honours .gitignore, so build output stays out.
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

const findings = [];
let scanned = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(`${ROOT}/${f}`, 'utf8'); } catch { continue; }
  if (text.includes('\0')) continue;               // binary
  scanned++;
  text.split('\n').forEach((line, i) => {
    const hit = scanLine(line);
    if (hit) findings.push(`${f}:${i + 1}: [${hit}] ${line.trim().slice(0, 100)}`);
  });
}
if (scanned === 0) {
  console.log('  FAIL  no files were read — verdict UNVERIFIED');
  process.exit(1);
}

if (findings.length) {
  console.log(`  FAIL  ${findings.length} finding(s) across ${scanned} files:`);
  for (const f of findings) console.log(`        ${f}`);
} else {
  console.log(`  PASS  ${scanned} tracked files, zero credential-shaped material`);
}

// --- optional maintainer denylist --------------------------------------------------------------
const denylist = process.env.SKILLS_DENYLIST;
let denyHits = 0;
if (!denylist) {
  console.log('  SKIP  no SKILLS_DENYLIST set — maintainer-only term check not run');
} else {
  let terms = [];
  try {
    terms = readFileSync(denylist, 'utf8').split('\n')
      .map((t) => t.trim()).filter((t) => t && !t.startsWith('#'));
  } catch {
    console.log(`  SKIP  SKILLS_DENYLIST unreadable at ${denylist} — term check not run`);
  }
  for (const term of terms) {
    const lower = term.toLowerCase();
    for (const f of files) {
      let text;
      try { text = readFileSync(`${ROOT}/${f}`, 'utf8'); } catch { continue; }
      if (text.toLowerCase().includes(lower)) { console.log(`        denylisted term in ${f}`); denyHits++; break; }
    }
  }
  if (terms.length) {
    console.log(denyHits ? `  FAIL  ${denyHits} denylisted-term hit(s)` : `  PASS  zero denylisted terms (${terms.length} checked)`);
  }
}

const failed = findings.length + denyHits;
console.log(`\npublication-safety: ${failed ? `${failed} finding(s)` : 'CLEAN'}`);
process.exit(failed ? 1 : 0);
