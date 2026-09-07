#!/usr/bin/env node
// Build viewer-manifest.json for the doc-this-viewer Svelte app. Zero-dependency Node.
//
// Walks a doc-this output tree (the rich `.doc-this-sdd/` staging folder and/or the
// promoted `docs/` SDLC folder) and emits `.doc-this/viewer/viewer-manifest.json` — the
// single contract the viewer fetches to render its sidebar.
//
// Contract: skills/doc-this-viewer/references/manifest-schema.md
// Deterministic: no wall-clock fields, everything sorted -> idempotent over the same tree.
//
// Usage:
//     build-manifest.mjs [PROJECT_ROOT]   # default: current working directory
//     build-manifest.mjs -o PATH [ROOT]   # write the manifest somewhere else (tests)
//
// Exit codes: 0 ok · 2 no doc-this output found · 1 unexpected error.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, basename, relative, sep } from 'node:path';

const SCHEMA_VERSION = 1;

const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bin', 'obj', 'dist', 'build',
  '.doc-this', '__pycache__', '.venv', 'venv', '.idea', '.vs',
]);

const DISCOVERY_GROUPS = {
  overview:  ['Overview', '📄', 10],
  units:     ['Units', '📦', 20],
  surface:   ['Surface Catalog', '🔌', 30],
  diagrams:  ['Diagrams', '🧭', 40],
  domain:    ['Domain & Rules', '📐', 50],
  datadict:  ['Data Dictionary', '📚', 55],
  database:  ['Database', '🗄️', 60],
  ui:        ['UI', '🖼️', 70],
  design:    ['Design System', '🎨', 80],
  adrs:      ['ADRs', '🏛️', 85],
  trace:     ['Traceability', '🔗', 90],
  openapi:   ['OpenAPI', '📘', 95],
  coverage:  ['Coverage', '📊', 100],
  questions: ['Questions & Gaps', '❓', 110],
};

const SDLC_GROUPS = {
  requirements: ['Requirements', '📋', 10],
  adrs:         ['ADRs', '🏛️', 20],
  design:       ['Design', '📐', 30],
  features:     ['Feature Specs', '🥒', 40],
  trace:        ['Traceability', '🔗', 50],
  docs:         ['Docs', '📄', 60],
};

const UNIT_FILE_ORDER = {
  requirements: 0, design: 1, tasks: 2, contracts: 3, flows: 4,
  'edge-cases': 5, decisions: 6, questions: 7, screens: 8,
};

const FEATURE_SEARCH_ROOTS = ['docs', 'features', 'tests', 'test', 'specs', 'spec'];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Python sorts Path objects segment-wise, not by the joined string: 'a/b' < 'a-c'
// because '/' never participates in the comparison. A plain string sort inverts that.
function cmpPath(a, b) {
  const pa = a.split(sep);
  const pb = b.split(sep);
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    const c = cmp(pa[i], pb[i]);
    if (c) return c;
  }
  return pa.length - pb.length;
}

const posix = (p) => p.split(sep).join('/');
const cps = (s) => Array.from(s);

// Python's round() is half-to-even on the exact binary value; JS Math.round and
// toFixed both round ties away from zero, which diverges on values like 6.25.
function round1(x) {
  if (!Number.isFinite(x)) return x;
  const s = x.toFixed(20);
  const dot = s.indexOf('.');
  const kept = Number(s.slice(0, dot)) * 10 + Number(s[dot + 1]);
  const rest = s.slice(dot + 2);
  let n;
  if (rest[0] === '5' && /^0*$/.test(rest.slice(1))) n = kept % 2 === 0 ? kept : kept + 1;
  else if (rest[0] >= '5') n = kept + 1;
  else n = kept;
  return n / 10;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function countConfidence(text) {
  return [text.split('🟢').length - 1, text.split('🔴').length - 1];
}

function extractTitle(text, fallback) {
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (s.startsWith('# ')) return s.slice(2).trim();
  }
  const stem = fallback.replace(/\.(md|feature|yaml|yml)$/, '');
  return stem.replace(/-/g, ' ').replace(/_/g, ' ').trim() || fallback;
}

function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text;
  const m = /\n---[ \t]*\n/.exec(text);
  return m ? text.slice(m.index + m[0].length) : text;
}

function makeExcerpt(text, limit = 160) {
  const body = [];
  let running = 0;
  for (const line of stripFrontmatter(text).split('\n')) {
    let s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('```') || s.startsWith('|')) continue;
    s = s.replace(/[`*_>#\-\u{1F7E2}\u{1F534}]/gu, '');
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    s = s.replace(/\s+/g, ' ').trim();
    if (s) { body.push(s); running += cps(s).length; }
    if (running >= limit) break;
  }
  const joined = body.join(' ');
  if (cps(joined).length > limit) return cps(joined).slice(0, limit).join('').replace(/\s+$/, '') + '…';
  return joined;
}

function makeItem(projectRoot, absPath, lang) {
  const text = readText(absPath);
  const [green, red] = countConfidence(text);
  const item = {
    path: posix(relative(projectRoot, absPath)),
    title: extractTitle(text, basename(absPath)),
    confirmed: green,
    gaps: red,
    excerpt: makeExcerpt(text),
  };
  if (lang) item.lang = lang;
  return item;
}

function walkFiles(folder, keep) {
  const out = [];
  const visit = (dirpath) => {
    let entries;
    try { entries = readdirSync(dirpath, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isFile() && keep(e.name)) out.push(join(dirpath, e.name));
    const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
      .map((e) => e.name).sort(cmp);
    for (const d of dirs) visit(join(dirpath, d));
  };
  visit(folder);
  return out;
}

const walkMarkdown = (folder) => walkFiles(folder, (n) => n.endsWith('.md')).sort(cmpPath);

function classifyDiscovery(relParts, unitNames) {
  const first = relParts[0];
  const name = relParts[relParts.length - 1];
  if (relParts.length > 1 && unitNames.includes(first)) return ['units', first];
  if (first === 'flowcharts') return ['diagrams', null];
  if (first === 'data-dictionary') return ['datadict', null];
  if (first === 'decision-traces' || first === 'user-stories') return ['domain', null];
  if (first === 'database') return ['database', null];
  if (first === 'ui') return ['ui', null];
  if (first === 'design-system') return ['design', null];
  if (first === 'traceability') return ['trace', null];
  if (first === 'adrs' || first === 'adr') return ['adrs', null];
  if (relParts.length === 1) {
    if (/^c4-.*\.md$/.test(name) || /^erd-.*\.md$/.test(name) || name === 'state-machines.md') {
      return ['diagrams', null];
    }
    if (name === 'domain.md' || name === 'permissions.md') return ['domain', null];
    if (name === 'data-dictionary.md') return ['datadict', null];
    if (name === 'questions.md' || name === 'gaps.md' || name === 'confidence-report.md') {
      return ['questions', null];
    }
    return ['overview', null];
  }
  return ['overview', null];
}

const byOrder = (registry) => Object.keys(registry).sort((a, b) => registry[a][2] - registry[b][2]);

function buildDiscoverySource(projectRoot, outFolder) {
  const folder = join(projectRoot, outFolder);
  if (!isDir(folder)) return null;

  let children = [];
  try { children = readdirSync(folder, { withFileTypes: true }); } catch { children = []; }
  const unitNames = children
    .filter((c) => c.isDirectory() && isFile(join(folder, c.name, 'requirements.md')))
    .map((c) => c.name).sort(cmp);

  const flat = new Map();
  const units = new Map();
  for (const md of walkMarkdown(folder)) {
    const relParts = relative(folder, md).split(sep);
    const [gid, unit] = classifyDiscovery(relParts, unitNames);
    const item = makeItem(projectRoot, md);
    if (gid === 'units' && unit) {
      if (!units.has(unit)) units.set(unit, []);
      units.get(unit).push([relParts[relParts.length - 1], item]);
    } else {
      if (!flat.has(gid)) flat.set(gid, []);
      flat.get(gid).push(item);
    }
  }

  const oa = join(folder, 'openapi');
  if (isDir(oa)) {
    const yamls = walkFiles(oa, (n) => n.endsWith('.yaml') || n.endsWith('.yml'))
      .filter((p) => dirname(p) === oa).sort(cmpPath);
    for (const y of yamls) {
      if (!flat.has('openapi')) flat.set('openapi', []);
      flat.get('openapi').push(makeItem(projectRoot, y));
    }
  }

  const groups = [];
  const surfacePath = join(folder, 'external-surface.json');

  for (const gid of byOrder(DISCOVERY_GROUPS)) {
    const [label, icon] = DISCOVERY_GROUPS[gid];
    if (gid === 'units') {
      if (!units.size) continue;
      const subgroups = [];
      for (const uname of [...units.keys()].sort(cmp)) {
        const files = units.get(uname);
        files.sort((a, b) => {
          const oa2 = UNIT_FILE_ORDER[a[0].replace(/\.md$/, '')] ?? 99;
          const ob = UNIT_FILE_ORDER[b[0].replace(/\.md$/, '')] ?? 99;
          return oa2 - ob || cmp(a[0], b[0]);
        });
        subgroups.push({
          id: 'unit-' + uname.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase(),
          label: uname,
          items: files.map((fi) => fi[1]),
        });
      }
      groups.push({ id: gid, label, icon, kind: 'markdown', subgroups });
    } else if (gid === 'surface') {
      if (isFile(surfacePath)) {
        groups.push({ id: gid, label, icon, kind: 'surface', source: posix(relative(projectRoot, surfacePath)) });
      }
    } else if (gid === 'coverage') {
      // decided at top level (needs state coverage / counts); appended later
    } else {
      const items = flat.get(gid);
      if (items && items.length) {
        items.sort((a, b) => cmp(a.title.toLowerCase(), b.title.toLowerCase()));
        groups.push({ id: gid, label, icon, kind: 'markdown', items });
      }
    }
  }

  return { id: 'discovery', label: `Discovery (${outFolder})`, groups, _has_surface: isFile(surfacePath) };
}

function findFeatureFiles(projectRoot) {
  const found = [];
  const seen = new Set();
  const roots = [projectRoot, ...FEATURE_SEARCH_ROOTS.map((r) => join(projectRoot, r))];
  for (const base of roots) {
    if (!isDir(base)) continue;
    for (const p of walkFiles(base, (n) => n.endsWith('.feature'))) {
      let real;
      try { real = realpathSync(p); } catch { real = resolve(p); }
      if (seen.has(real)) continue;
      seen.add(real);
      found.push(p);
    }
  }
  return found.sort(cmpPath);
}

function buildSdlcSource(projectRoot) {
  const docs = join(projectRoot, 'docs');
  const featureFiles = findFeatureFiles(projectRoot);
  if (!isDir(docs) && !featureFiles.length) return null;

  const flat = new Map();
  const add = (gid, absPath, lang) => {
    if (!flat.has(gid)) flat.set(gid, []);
    flat.get(gid).push(makeItem(projectRoot, absPath, lang));
  };

  if (isDir(docs)) {
    for (const md of walkMarkdown(docs)) {
      const top = relative(docs, md).split(sep)[0];
      const name = basename(md);
      if (top === 'requirements') add('requirements', md);
      else if (top === 'adr' || top === 'adrs') add('adrs', md);
      else if (top === 'design') add('design', md);
      else if (name === 'TRACEABILITY.md') add('trace', md);
      else add('docs', md);
    }
  }

  for (const f of featureFiles) add('features', f, 'feature');

  const groups = [];
  for (const gid of byOrder(SDLC_GROUPS)) {
    const [label, icon] = SDLC_GROUPS[gid];
    const items = flat.get(gid);
    if (items && items.length) {
      items.sort((a, b) => cmp(a.title.toLowerCase(), b.title.toLowerCase()));
      groups.push({ id: gid, label, icon, kind: 'markdown', items });
    }
  }

  if (!groups.length) return null;
  return { id: 'sdlc', label: 'SDLC (docs/)', groups };
}

function sumConfidence(sources) {
  let green = 0;
  let red = 0;
  for (const src of sources) {
    for (const g of src.groups) {
      for (const it of g.items || []) { green += it.confirmed || 0; red += it.gaps || 0; }
      for (const sg of g.subgroups || []) {
        for (const it of sg.items || []) { green += it.confirmed || 0; red += it.gaps || 0; }
      }
    }
  }
  return [green, red];
}

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function buildManifest(projectRoot) {
  const state = loadJson(join(projectRoot, '.doc-this', 'state.json')) || {};
  const outFolder = state.output_folder || '.doc-this-sdd';

  let discovery = buildDiscoverySource(projectRoot, outFolder);
  const sdlc = buildSdlcSource(projectRoot);

  const sources = [];
  let hasSurface = false;
  if (discovery) {
    hasSurface = discovery._has_surface || false;
    delete discovery._has_surface;
    if (discovery.groups.length) sources.push(discovery);
    else discovery = null;
  }
  if (sdlc) sources.push(sdlc);
  if (!sources.length) return null;

  const cov = state.coverage;
  let coverage = null;
  if (cov && typeof cov === 'object' && !Array.isArray(cov) && 'files_total_source' in cov) {
    const total = cov.files_total_source || 0;
    const analyzed = cov.files_analyzed || 0;
    coverage = {
      files_total_source: total,
      files_analyzed: analyzed,
      files_pending: 'files_pending' in cov ? cov.files_pending : Math.max(total - analyzed, 0),
      percent: total ? round1((analyzed / total) * 100) : null,
    };
  }

  const fm = loadJson(join(projectRoot, '.doc-this', 'context', 'file-manifest.json'));
  const manifestCounts = (fm && typeof fm === 'object' && !Array.isArray(fm))
    ? (fm.counts ?? null) : null;

  if (discovery !== null && (coverage || manifestCounts)) {
    const [label, icon] = DISCOVERY_GROUPS.coverage;
    discovery.groups.push({ id: 'coverage', label, icon, kind: 'coverage' });
    discovery.groups.sort((a, b) => (DISCOVERY_GROUPS[a.id]?.[2] ?? 999) - (DISCOVERY_GROUPS[b.id]?.[2] ?? 999));
  }

  const [green, red] = sumConfidence(sources);

  return {
    schema_version: SCHEMA_VERSION,
    project: state.project || '(unknown)',
    doc_level: state.doc_level ?? null,
    doc_language: state.doc_language ?? null,
    database_ownership: state.database_ownership ?? null,
    phase: state.phase ?? null,
    confidence: { confirmed_total: green, gap_total: red },
    coverage,
    manifest_counts: manifestCounts,
    has_surface: hasSurface,
    sources,
  };
}

function main(argv) {
  let output = null;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '-o' || argv[i] === '--output') {
      i += 1;
      if (i >= argv.length) { process.stderr.write('error: -o needs a path\n'); return 1; }
      output = argv[i];
    } else if (argv[i].startsWith('-')) {
      process.stderr.write(`error: unknown argument: ${argv[i]}\n`);
      return 1;
    } else positional.push(argv[i]);
  }

  const projectRoot = resolve(positional[0] || '.');
  if (!isDir(projectRoot)) {
    process.stderr.write(`error: not a directory: ${projectRoot}\n`);
    return 1;
  }

  const manifest = buildManifest(projectRoot);
  if (manifest === null) {
    process.stderr.write(
      'error: no doc-this output found here.\n'
      + '  Looked for a staging folder (default .doc-this-sdd/) and docs/.\n'
      + '  Run /doc-this first, or pass a project root that has doc-this output.\n');
    return 2;
  }

  const outPath = output ? resolve(output)
    : join(projectRoot, '.doc-this', 'viewer', 'viewer-manifest.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${outPath}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
