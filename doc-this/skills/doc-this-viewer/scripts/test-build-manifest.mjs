#!/usr/bin/env node
// Test suite for build-manifest.mjs + launch.mjs (doc-this-viewer).
// Run: node doc-this/skills/doc-this-viewer/scripts/test-build-manifest.mjs
//
// Unit tests need only node. Server smoke tests are skipped when the prebuilt
// app (assets/dist/index.html) is missing.
//
// The bash original needed an eval() shim to query the manifest from the shell;
// here the manifest is just parsed and asserted directly.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Harness } from '../../../../tests/lib/harness.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(SCRIPT_DIR, '..');
const BUILDER = join(SCRIPT_DIR, 'build-manifest.mjs');
const LAUNCH = join(SCRIPT_DIR, 'launch.mjs');
const DIST = join(SKILL_DIR, 'assets', 'dist', 'index.html');

const h = new Harness('Unit Tests: build-manifest.mjs');
let skipped = 0;
const skip = (name, why) => { skipped++; process.stdout.write(`  SKIP: ${name} — ${why}\n`); };

const WORK = h.mkTemp('viewer-test-');
const build = (root, out) => spawnSync(process.execPath, [BUILDER, root, '-o', out], { encoding: 'utf8' }).status ?? 1;
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };

// ============================================================================
// Fixture
// ============================================================================
const ROOT = join(WORK, 'proj');
const SDD = join(ROOT, '.doc-this-sdd');
for (const d of [join(ROOT, '.doc-this', 'context'), join(SDD, 'orders'), join(SDD, 'billing'),
  join(ROOT, 'docs', 'requirements'), join(ROOT, 'docs', 'adr'), join(ROOT, 'tests', 'features')]) {
  mkdirSync(d, { recursive: true });
}

write(join(ROOT, '.doc-this', 'state.json'), JSON.stringify({
  project: 'fixture-app',
  doc_language: 'Portuguese',
  doc_level: 'standard',
  database_ownership: 'external',
  phase: 'review',
  output_folder: '.doc-this-sdd',
  coverage: { files_total_source: 10, files_analyzed: 8, files_pending: 2 },
}, null, 2));

write(join(ROOT, '.doc-this', 'context', 'file-manifest.json'),
  '{ "counts": { "source": 10, "generated": 3, "vendored": 2, "binary": 1 } }\n');

write(join(SDD, 'inventory.md'), '# Inventory\nThe system has modules. 🟢 confirmed at app.cs:1\n');
write(join(SDD, 'dependencies.md'), '# Dependencies\nlib a\n');
write(join(SDD, 'architecture.md'), '# Architecture\noverview\n');
write(join(SDD, 'c4-context.md'), '# C4 Context\n```mermaid\ngraph TD\nA-->B\n```\n');
write(join(SDD, 'domain.md'), '# Domain\nrules\n');
write(join(SDD, 'questions.md'), '# Questions\n🔴 Q-001 unknown owner\n');

write(join(SDD, 'external-surface.json'), JSON.stringify({
  database_ownership: 'external',
  entries: [
    { kind: 'http', name: 'POST /api/orders', path: '/api/orders', method: 'POST', visibility: 'public', confidence: 'confirmed', consumed_by: [] },
    { kind: 'http', name: 'GET /api/admin', path: '/api/admin', method: 'GET', visibility: 'private', confidence: 'confirmed', consumed_by: [] },
    { kind: 'http', name: 'GET /api/x', path: '/api/x', method: 'GET', visibility: 'public', confidence: 'unknown', consumed_by: [] },
    { kind: 'ui', name: '/orders/new', route: '/orders/new', visibility: 'public', confidence: 'confirmed', consumed_by: [] },
    { kind: 'database', name: 'dbo.usp_X', type: 'stored_procedure', schema_object: 'dbo.usp_X', visibility: 'external_dependency', confidence: 'confirmed', consumed_by: [] },
  ],
}, null, 2));

write(join(SDD, 'orders', 'requirements.md'),
  '# Orders — Requirements\nRule one 🟢 at OrderService.cs:10\nRule two 🟢 ok\nRule three 🟢 ok\nA gap 🔴 here\n');
write(join(SDD, 'orders', 'design.md'), '# Orders — Design\n');
write(join(SDD, 'orders', 'tasks.md'), '# Orders — Tasks\n');
write(join(SDD, 'billing', 'requirements.md'), '# Billing — Requirements\n🟢 a\n🟢 b\n');
write(join(SDD, 'billing', 'design.md'), '# Billing — Design\n');
write(join(SDD, 'billing', 'tasks.md'), '# Billing — Tasks\n');

write(join(ROOT, 'docs', 'requirements', 'FR-001-login.md'), '# FR-001 Login\nUser logs in.\n');
write(join(ROOT, 'docs', 'adr', 'ADR-001-auth.md'), '# ADR-001 Auth\nWe use JWT.\n');
write(join(ROOT, 'docs', 'TRACEABILITY.md'), '# Traceability\n| FR | spec |\n');
write(join(ROOT, 'tests', 'features', 'login.feature'), 'Feature: Login\n  Scenario: ok\n    Given a user\n');

const MANIFEST = join(WORK, 'manifest.json');
const buildRc = build(ROOT, MANIFEST);

h.check('test_builder_succeeds', buildRc === 0 && existsSync(MANIFEST),
  `rc=${buildRc}, manifest exists=${existsSync(MANIFEST) ? 'y' : 'n'}`);

let m = null;
try { m = load(MANIFEST); h.ok('test_valid_json'); }
catch { h.bad('test_valid_json', 'JSON.parse rejected the manifest'); }

if (m) {
  const src = (id) => m.sources.find((s) => s.id === id) ?? null;
  const grp = (sid, gid) => src(sid)?.groups.find((g) => g.id === gid) ?? null;

  h.equal('test_project', m.project, 'fixture-app');
  h.equal('test_doc_language', m.doc_language, 'Portuguese');

  // 🟢: 1 inventory + 3 orders + 2 billing = 6; 🔴: 1 orders + 1 questions = 2
  h.equal('test_confirmed_total', m.confidence.confirmed_total, 6);
  h.equal('test_gap_total', m.confidence.gap_total, 2);
  h.equal('test_coverage_percent', m.coverage.percent, 80);
  h.equal('test_manifest_counts', m.manifest_counts.source, 10);
  h.equal('test_has_surface', m.has_surface, true);
  h.equal('test_two_sources', m.sources.length, 2);

  const discoveryGroups = src('discovery').groups.map((g) => g.id);
  h.check('test_units_group_present', discoveryGroups.includes('units'), `groups=${discoveryGroups.join(',')}`);

  h.equal('test_surface_group_kind', grp('discovery', 'surface').kind, 'surface');
  h.check('test_surface_source_path', grp('discovery', 'surface').source.endsWith('external-surface.json'));
  h.equal('test_coverage_group_kind', grp('discovery', 'coverage').kind, 'coverage');

  const units = grp('discovery', 'units');
  h.equal('test_units_count', units.subgroups.length, 2);

  const orders = units.subgroups.find((s) => s.label === 'orders');
  h.equal('test_unit_file_order',
    orders.items.map((i) => i.path.split('/').pop()).join(','),
    'requirements.md,design.md,tasks.md');

  const ordersReq = orders.items.find((i) => i.path.endsWith('requirements.md'));
  h.equal('test_unit_confirmed', ordersReq.confirmed, 3);
  h.equal('test_unit_gaps', ordersReq.gaps, 1);

  h.check('test_path_project_relative', grp('discovery', 'overview').items[0].path.startsWith('.doc-this-sdd/'));

  h.equal('test_sdlc_groups', src('sdlc').groups.map((g) => g.id).sort().join(','),
    'adrs,features,requirements,trace');
  h.equal('test_feature_lang', grp('sdlc', 'features').items[0].lang, 'feature');
  h.equal('test_title_from_h1', grp('sdlc', 'requirements').items[0].title, 'FR-001 Login');
}

// test_missing_output_exit2
const empty = join(WORK, 'empty');
mkdirSync(empty, { recursive: true });
const emptyRc = build(empty, join(WORK, 'none.json'));
h.equal('test_missing_output_exit2', emptyRc, 2);

// test_output_folder_honored (custom output_folder in state.json)
const custom = join(WORK, 'custom');
write(join(custom, '.doc-this', 'state.json'), '{"project":"c","output_folder":"_sdd_x"}\n');
write(join(custom, '_sdd_x', 'orders', 'requirements.md'), '# Orders\n🟢 ok\n');
build(custom, join(WORK, 'custom.json'));
const customLabel = load(join(WORK, 'custom.json')).sources.find((s) => s.id === 'discovery').label;
h.check('test_output_folder_honored', customLabel.includes('_sdd_x'), `label='${customLabel}'`);

// test_idempotent (two runs → identical bytes)
build(ROOT, join(WORK, 'm1.json'));
build(ROOT, join(WORK, 'm2.json'));
h.check('test_idempotent',
  readFileSync(join(WORK, 'm1.json'), 'utf8') === readFileSync(join(WORK, 'm2.json'), 'utf8'),
  'two runs differ');

// test_legacy_no_coverage (state without a coverage block → coverage null)
const legacy = join(WORK, 'legacy');
write(join(legacy, '.doc-this', 'state.json'), '{"project":"L","output_folder":".doc-this-sdd"}\n');
write(join(legacy, '.doc-this-sdd', 'orders', 'requirements.md'), '# Orders\nx\n');
build(legacy, join(WORK, 'legacy.json'));
h.equal('test_legacy_no_coverage', load(join(WORK, 'legacy.json')).coverage, null);

// ============================================================================
process.stdout.write('\n=== Integration Tests: launch.mjs ===\n');
// ============================================================================
const launch = (...args) => spawnSync(process.execPath, [LAUNCH, ...args], { encoding: 'utf8' });

if (!existsSync(DIST)) {
  skip('serve smoke', `prebuilt app missing (${DIST}) — run build.mjs first`);
  skipped++;
} else {
  const r = launch('--no-open', ROOT);
  const url = (r.stdout ?? '').split('\n').find((l) => l.startsWith('VIEWER_URL='))?.slice('VIEWER_URL='.length);
  if (r.status === 0 && url) {
    const status = async (u) => { try { return (await fetch(u)).status; } catch { return 0; } };
    const indexCode = await status(url);
    h.equal('test_serve_index_200', indexCode, 200);
    const base = url.replace(/\/index\.html$/, '');
    const manifestCode = await status(`${base}/viewer-manifest.json`);
    h.equal('test_serve_manifest_200', manifestCode, 200);
  } else {
    h.bad('test_serve_starts', `rc=${r.status}, stderr: ${(r.stderr ?? '').split('\n')[0]}`);
    skipped++;
  }
  launch('--stop', ROOT);
}

process.stdout.write(`\n=== Results ===\n  ${h.pass} passed, ${h.fail} failed, ${skipped} skipped\n`);
h.cleanup();
process.exit(h.fail > 0 ? 1 : 0);
